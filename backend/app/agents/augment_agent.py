import os
import shutil
import random
import yaml
from pathlib import Path
from PIL import Image as PILImage
from sqlalchemy.orm import Session
from app.models.db import Project, Image as DBImage, Label as DBLabel

def horizontal_flip_bbox(bbox):
    """
    Flips a normalized YOLO bbox [x_center, y_center, w, h] horizontally.
    """
    xc, yc, w, h = bbox
    return [1.0 - xc, yc, w, h]

def run_augment_agent(
    db: Session,
    project_id: int,
    storage_root: str = "storage",
    train_ratio: float = 0.8,
    apply_offline_aug: bool = True
):
    """
    Splits reviewed images/labels into train/val sets, formats them for YOLO,
    applies optional offline augmentations (e.g., horizontal flip),
    and creates data.yaml.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise ValueError(f"Project with ID {project_id} not found")

    classes = project.classes
    images = db.query(DBImage).filter(
        DBImage.project_id == project_id,
        DBImage.status == "reviewed"
    ).all()

    if not images:
        raise ValueError("No reviewed images found. Run QC Agent first.")

    # Create dataset directories
    project_dir = Path(storage_root) / "projects" / str(project_id)
    dataset_dir = project_dir / "dataset"
    
    # Remove existing dataset directory to avoid mixing old/new runs
    if dataset_dir.exists():
        shutil.rmtree(dataset_dir)
        
    for split in ["train", "val"]:
        (dataset_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (dataset_dir / "labels" / split).mkdir(parents=True, exist_ok=True)

    # Shuffle and split images
    random.seed(42)  # reproducible splits
    shuffled_images = list(images)
    random.shuffle(shuffled_images)
    
    split_idx = int(len(shuffled_images) * train_ratio)
    train_images = shuffled_images[:split_idx]
    val_images = shuffled_images[split_idx:]

    # Fallback in case validation set is empty (e.g. very few images)
    if not val_images and train_images:
        val_images = [train_images.pop()]

    def process_split_image(db_img: DBImage, split: str, is_aug: bool = False):
        src_img_path = Path(storage_root) / db_img.file_path
        if not src_img_path.exists():
            return

        # Fetch labels
        labels = db.query(DBLabel).filter(DBLabel.image_id == db_img.id).all()
        if not labels:
            return  # skip background images for v1 simplicity, or write empty label file

        # Destination names
        suffix = "_aug" if is_aug else ""
        dest_filename = f"{src_img_path.stem}{suffix}{src_img_path.suffix}"
        dest_img_path = dataset_dir / "images" / split / dest_filename
        dest_label_path = dataset_dir / "labels" / split / f"{src_img_path.stem}{suffix}.txt"

        if is_aug:
            # Apply PIL-based horizontal flip
            try:
                with PILImage.open(src_img_path) as img:
                    flipped_img = img.transpose(PILImage.FLIP_LEFT_RIGHT)
                    flipped_img.save(dest_img_path)
                
                # Flip bboxes
                yolo_lines = []
                for label in labels:
                    flipped_bbox = horizontal_flip_bbox(label.bbox)
                    xc, yc, w, h = flipped_bbox
                    yolo_lines.append(f"{label.class_id} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}")
                
                with open(dest_label_path, 'w') as f:
                    f.write("\n".join(yolo_lines))
            except Exception as e:
                print(f"Failed to apply offline augmentation on {src_img_path}: {e}")
        else:
            # Copy original image
            shutil.copy2(src_img_path, dest_img_path)
            
            # Write standard YOLO labels
            yolo_lines = []
            for label in labels:
                xc, yc, w, h = label.bbox
                yolo_lines.append(f"{label.class_id} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}")
            
            with open(dest_label_path, 'w') as f:
                f.write("\n".join(yolo_lines))

    # Process train split
    for db_img in train_images:
        process_split_image(db_img, "train", is_aug=False)
        if apply_offline_aug:
            process_split_image(db_img, "train", is_aug=True)

    # Process val split (do not apply offline augmentation to validation data)
    for db_img in val_images:
        process_split_image(db_img, "val", is_aug=False)

    # Create data.yaml
    names_dict = {idx: name for idx, name in enumerate(classes)}
    
    # YOLO requires absolute path or path relative to execution dir
    data_yaml_content = {
        "path": str(dataset_dir.resolve()),
        "train": "images/train",
        "val": "images/val",
        "names": names_dict
    }

    yaml_path = dataset_dir / "data.yaml"
    with open(yaml_path, 'w') as f:
        yaml.dump(data_yaml_content, f, default_flow_style=False)

    # Update project status
    project.status = "augmenting"
    db.commit()

    return {
        "dataset_path": str(dataset_dir),
        "train_count": len(train_images) * (2 if apply_offline_aug else 1),
        "val_count": len(val_images),
        "classes": classes
    }
