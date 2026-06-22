import json
from pathlib import Path
from sqlalchemy.orm import Session
from app.models.db import Project, Image as DBImage, Label as DBLabel

def xywh_to_xyxy(bbox):
    """Converts [x_center, y_center, w, h] to [xmin, ymin, xmax, ymax]"""
    xc, yc, w, h = bbox
    xmin = xc - w / 2
    ymin = yc - h / 2
    xmax = xc + w / 2
    ymax = yc + h / 2
    return [xmin, ymin, xmax, ymax]

def compute_iou(box1, box2):
    """Computes IoU of two boxes in [xmin, ymin, xmax, ymax] format"""
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])
    
    intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    union = area1 + area2 - intersection
    
    if union == 0.0:
        return 0.0
    return intersection / union

def run_nms(labels: list[DBLabel], iou_threshold: float = 0.5):
    """
    Performs class-specific Non-Maximum Suppression on a list of DB Label objects.
    Returns a list of kept labels and a list of suppressed labels to delete.
    """
    # Group labels by class_id
    class_groups = {}
    for label in labels:
        class_groups.setdefault(label.class_id, []).append(label)

    kept_labels = []
    suppressed_labels = []

    for cid, group in class_groups.items():
        # Sort by confidence descending (treat human label confidence as 1.0)
        sorted_group = sorted(
            group,
            key=lambda l: l.confidence if l.confidence is not None else 1.0,
            reverse=True
        )
        
        while sorted_group:
            best = sorted_group.pop(0)
            kept_labels.append(best)
            
            best_box = xywh_to_xyxy(best.bbox)
            
            # Compare with remaining boxes
            remaining = []
            for item in sorted_group:
                item_box = xywh_to_xyxy(item.bbox)
                iou = compute_iou(best_box, item_box)
                if iou >= iou_threshold:
                    suppressed_labels.append(item)
                else:
                    remaining.append(item)
            sorted_group = remaining

    return kept_labels, suppressed_labels

def run_qc_agent(
    db: Session,
    project_id: int,
    storage_root: str = "storage",
    conf_threshold: float = 0.80,
    nms_iou_threshold: float = 0.45,
    auto_approve_all: bool = True  # Used in CLI mode to bypass UI review step
):
    """
    Applies NMS, categorizes images into auto_approved / needs_review / no_detections,
    and handles saving reviewed labels.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise ValueError(f"Project with ID {project_id} not found")

    images = db.query(DBImage).filter(DBImage.project_id == project_id).all()
    
    project_dir = Path(storage_root) / "projects" / str(project_id)
    labels_reviewed_dir = project_dir / "labels_reviewed"
    labels_reviewed_dir.mkdir(parents=True, exist_ok=True)

    summary = {
        "total_images": len(images),
        "auto_approved": 0,
        "needs_review": 0,
        "no_detections": 0,
    }

    for db_img in images:
        # Get auto labels for this image
        labels = db.query(DBLabel).filter(DBLabel.image_id == db_img.id).all()

        # Run NMS to clean up overlapping labels
        kept, suppressed = run_nms(labels, nms_iou_threshold)
        
        # Delete suppressed labels from DB
        for sup in suppressed:
            db.delete(sup)
        db.commit()

        # Re-fetch remaining labels
        remaining_labels = db.query(DBLabel).filter(DBLabel.image_id == db_img.id).all()

        # Classify the image status
        if not remaining_labels:
            img_status = "no_detections"
            summary["no_detections"] += 1
        elif all((l.confidence is not None and l.confidence >= conf_threshold) for l in remaining_labels):
            img_status = "auto_approved"
            summary["auto_approved"] += 1
        else:
            img_status = "needs_review"
            summary["needs_review"] += 1

        db_img.status = img_status
        db.commit()

        # In CLI mode, or if the image is auto-approved, we write it to labels_reviewed/
        if auto_approve_all or img_status == "auto_approved":
            # If auto-approving a needs_review/no_detections image, promote its source to human-approved (or keep auto but write it)
            # Write final labels JSON
            json_filename = Path(db_img.file_path).stem + ".json"
            json_path = labels_reviewed_dir / json_filename
            
            detections = []
            for label in remaining_labels:
                # Update source to human if we are simulating review approval
                if auto_approve_all and label.source == "auto":
                    label.source = "human"
                
                detections.append({
                    "class_id": label.class_id,
                    "class_name": label.class_name,
                    "bbox": label.bbox,
                    "confidence": label.confidence,
                    "source": label.source
                })
            
            with open(json_path, 'w') as f:
                json.dump({
                    "image_id": db_img.id,
                    "image_path": db_img.file_path,
                    "status": "reviewed",
                    "detections": detections
                }, f, indent=2)

            # Update DB image status to reviewed
            db_img.status = "reviewed"
            db.commit()

    # If all images are reviewed, set project status to ready for training / training-ready
    # We will use "needs_review" as a generic project status if some still need review
    all_reviewed = all(img.status == "reviewed" for img in images)
    if all_reviewed:
        project.status = "reviewed"
    else:
        project.status = "needs_review"
    db.commit()

    return summary
