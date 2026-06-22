import os
import json
from pathlib import Path
from PIL import Image as PILImage
from sqlalchemy.orm import Session
from app.models.db import Project, Image as DBImage, Label as DBLabel

def run_autolabel_agent(
    db: Session,
    project_id: int,
    storage_root: str = "storage",
    use_mock: bool = False
):
    """
    Runs zero-shot labeling over all unlabeled images in the project.
    Writes predictions to the DB and exports raw label JSONs.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise ValueError(f"Project with ID {project_id} not found")

    classes = project.classes
    if not classes:
        raise ValueError("No classes defined for this project")

    # Get all unlabeled images for this project
    unlabeled_images = db.query(DBImage).filter(
        DBImage.project_id == project_id,
        DBImage.status == "unlabeled"
    ).all()

    if not unlabeled_images:
        print("No unlabeled images found for this project.")
        return {"project_id": project_id, "labeled_count": 0, "class_counts": {}}

    # Define project output folders
    project_dir = Path(storage_root) / "projects" / str(project_id)
    labels_raw_dir = project_dir / "labels_raw"
    labels_raw_dir.mkdir(parents=True, exist_ok=True)

    # Initialize model
    from autodistill_grounding_dino import GroundingDINO
    from autodistill.detection import CaptionOntology
    
    # Map each class to itself as a text prompt
    ontology_dict = {c: c for c in classes}
    ontology = CaptionOntology(ontology_dict)
    print("Initializing Grounding DINO base model...")
    model = GroundingDINO(ontology=ontology)

    labeled_count = 0
    class_counts = {c: 0 for c in classes}

    for db_img in unlabeled_images:
        full_img_path = Path(storage_root) / db_img.file_path
        if not full_img_path.exists():
            print(f"Image file not found: {full_img_path}, skipping.")
            continue

        try:
            with PILImage.open(full_img_path) as pil_img:
                img_width, img_height = pil_img.size

            detections_list = []

            # Run real grounding dino
            # predict() returns Supervision Detections
            print(f"Running Grounding DINO prediction on {full_img_path.name}...")
            preds = model.predict(str(full_img_path))
            
            # preds is a sv.Detections object
            # xyxy contains bounding boxes in pixels
            # class_id contains class indices
            # confidence contains confidences
            if preds and len(preds.xyxy) > 0:
                for i in range(len(preds.xyxy)):
                    box = preds.xyxy[i] # [xmin, ymin, xmax, ymax]
                    cid = int(preds.class_id[i]) if preds.class_id is not None else 0
                    conf = float(preds.confidence[i]) if preds.confidence is not None else 1.0
                    
                    # Guard rails for class indexing
                    if cid >= len(classes):
                        cid = 0
                    cname = classes[cid]

                    xmin, ymin, xmax, ymax = float(box[0]), float(box[1]), float(box[2]), float(box[3])
                    w_pixels = xmax - xmin
                    h_pixels = ymax - ymin
                    x_center_pixels = xmin + w_pixels / 2
                    y_center_pixels = ymin + h_pixels / 2

                    # Normalize coordinates
                    x_norm = x_center_pixels / img_width
                    y_norm = y_center_pixels / img_height
                    w_norm = w_pixels / img_width
                    h_norm = h_pixels / img_height

                    detections_list.append({
                        "class_id": cid,
                        "class_name": cname,
                        "bbox": [x_norm, y_norm, w_norm, h_norm],
                        "confidence": conf
                    })

            # Save detections to DB & JSON
            for det in detections_list:
                db_label = DBLabel(
                    image_id=db_img.id,
                    class_id=det["class_id"],
                    class_name=det["class_name"],
                    confidence=det["confidence"],
                    source="auto"
                )
                db_label.bbox = det["bbox"] # uses setter to serialize to JSON
                db.add(db_label)
                class_counts[det["class_name"]] += 1

            # Save to JSON raw label backup
            json_filename = Path(db_img.file_path).stem + ".json"
            json_path = labels_raw_dir / json_filename
            with open(json_path, 'w') as f:
                json.dump({
                    "image_id": db_img.id,
                    "image_path": db_img.file_path,
                    "width": img_width,
                    "height": img_height,
                    "detections": detections_list
                }, f, indent=2)

            db_img.status = "auto_labeled"
            labeled_count += 1

        except Exception as err:
            print(f"Error auto-labeling image {db_img.file_path}: {err}")

    # Update project status if labels were generated
    project.status = "needs_review"
    db.commit()

    return {
        "project_id": project_id,
        "labeled_count": labeled_count,
        "class_counts": class_counts
    }
