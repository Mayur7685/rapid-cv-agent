import os
import shutil
import zipfile
import tempfile
from pathlib import Path
from PIL import Image as PILImage
import imagehash
from sqlalchemy.orm import Session
from app.models.db import Project, Image

SUPPORTED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}

def get_image_files(directory_path: Path):
    image_files = []
    for root, _, files in os.walk(directory_path):
        for file in files:
            ext = os.path.splitext(file.lower())[1]
            if ext in SUPPORTED_EXTENSIONS:
                image_files.append(Path(root) / file)
    return image_files

def deduplicate_images(image_paths: list[Path], hash_threshold: int = 4):
    """
    Computes perceptual hashes of images and returns a list of unique images.
    If multiple images are near-identical (distance <= hash_threshold), only the first is kept.
    """
    unique_paths = []
    seen_hashes = []
    dedup_count = 0
    
    for img_path in sorted(image_paths):
        try:
            with PILImage.open(img_path) as img:
                # Calculate perceptual hash
                h = imagehash.phash(img)
            
            # Check if this hash is similar to any we've seen
            is_duplicate = False
            for prev_h in seen_hashes:
                if h - prev_h <= hash_threshold:
                    is_duplicate = True
                    break
            
            if not is_duplicate:
                seen_hashes.append(h)
                unique_paths.append(img_path)
            else:
                dedup_count += 1
        except Exception as e:
            # If image is corrupted or cannot be read, skip it
            print(f"Skipping corrupted or invalid image {img_path}: {e}")
            
    return unique_paths, dedup_count

def run_input_agent(
    db: Session,
    project_name: str,
    classes: list[str],
    images_source: str, # path to folder or .zip file
    storage_root: str = "storage",
    example_images: list[str] = None, # list of paths to examples
    project_id: int = None
):
    """
    Ingests, validates, dedupes, copies images to storage, and writes rows to DB.
    """
    # 1. Ensure project exists or create it
    if project_id is not None:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            project = Project(id=project_id, name=project_name, classes=classes, status="created")
            db.add(project)
            db.commit()
            db.refresh(project)
        else:
            project.classes = classes
            project.status = "created"
            db.commit()
    else:
        project = db.query(Project).filter(Project.name == project_name).first()
        if not project:
            project = Project(name=project_name, classes=classes, status="created")
            db.add(project)
            db.commit()
            db.refresh(project)
        else:
            # Update classes if project exists
            project.classes = classes
            project.status = "created"
            db.commit()

    project_id = project.id
    project_dir = Path(storage_root) / "projects" / str(project_id)
    raw_images_dir = project_dir / "raw_images"
    raw_images_dir.mkdir(parents=True, exist_ok=True)

    # 2. Extract images from zip if needed
    temp_dir = None
    source_path = Path(images_source)
    if not source_path.exists():
        raise FileNotFoundError(f"Source path {images_source} does not exist")

    try:
        if zipfile.is_zipfile(source_path):
            temp_dir = tempfile.TemporaryDirectory()
            print(f"Extracting zip file {source_path} to {temp_dir.name}...")
            with zipfile.ZipFile(source_path, 'r') as zip_ref:
                zip_ref.extractall(temp_dir.name)
            ingest_source = Path(temp_dir.name)
        else:
            ingest_source = source_path

        # 3. Find and deduplicate images
        all_image_paths = get_image_files(ingest_source)
        print(f"Found {len(all_image_paths)} images in source.")
        
        unique_image_paths, dedup_count = deduplicate_images(all_image_paths)
        print(f"Deduplication complete. Kept {len(unique_image_paths)} images, removed {dedup_count} duplicates.")

        # 4. Copy unique images and save to DB
        ingested_count = 0
        manifest = []
        
        for idx, img_path in enumerate(unique_image_paths):
            ext = img_path.suffix.lower()
            dest_filename = f"img_{idx:05d}{ext}"
            dest_path = raw_images_dir / dest_filename
            
            shutil.copy2(img_path, dest_path)
            
            # Save to Database
            # We store the path relative to the storage_root
            relative_path = str(dest_path.relative_to(storage_root))
            db_img = Image(project_id=project_id, file_path=relative_path, status="unlabeled")
            db.add(db_img)
            
            manifest.append({
                "original_name": img_path.name,
                "saved_name": dest_filename,
                "relative_path": relative_path
            })
            ingested_count += 1
            
        db.commit()
        
        # Update project status
        project.status = "labeling"
        db.commit()

        # Handle example images if provided
        if example_images:
            examples_dir = project_dir / "example_images"
            examples_dir.mkdir(parents=True, exist_ok=True)
            for ex_idx, ex_path in enumerate(example_images):
                ex_path = Path(ex_path)
                if ex_path.exists() and ex_path.suffix.lower() in SUPPORTED_EXTENSIONS:
                    shutil.copy2(ex_path, examples_dir / f"example_{ex_idx:03d}{ex_path.suffix.lower()}")
        
        return {
            "project_id": project_id,
            "project_name": project_name,
            "images_ingested": ingested_count,
            "images_deduplicated": dedup_count,
            "manifest": manifest
        }

    finally:
        if temp_dir:
            temp_dir.cleanup()
