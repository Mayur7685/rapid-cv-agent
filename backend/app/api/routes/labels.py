import os
import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from app.models.db import init_db, Project, Image as DBImage, Label as DBLabel

router = APIRouter(tags=["Labels & Review"])

def get_db():
    _, SessionLocal = init_db()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Schema for incoming label corrections
class BoundingBoxInput(BaseModel):
    class_id: int
    class_name: str
    bbox: List[float] # [x_center, y_center, width, height] normalized
    confidence: Optional[float] = None

class LabelReviewSubmission(BaseModel):
    labels: List[BoundingBoxInput]

@router.get("/projects/{project_id}/labels")
def get_project_labels(project_id: int, image_id: Optional[int] = None, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if image_id:
        img = db.query(DBImage).filter(
            DBImage.id == image_id,
            DBImage.project_id == project_id
        ).first()
        if not img:
            raise HTTPException(status_code=404, detail="Image not found in this project")
            
        labels = db.query(DBLabel).filter(DBLabel.image_id == image_id).all()
        return {
            "image_id": image_id,
            "file_path": img.file_path,
            "status": img.status,
            "labels": [{
                "id": l.id,
                "class_id": l.class_id,
                "class_name": l.class_name,
                "bbox": l.bbox,
                "confidence": l.confidence,
                "source": l.source
            } for l in labels]
        }
    else:
        # Return all labels grouped by image
        images = db.query(DBImage).filter(DBImage.project_id == project_id).all()
        result = {}
        for img in images:
            labels = db.query(DBLabel).filter(DBLabel.image_id == img.id).all()
            result[img.id] = {
                "file_path": img.file_path,
                "status": img.status,
                "labels": [{
                    "id": l.id,
                    "class_id": l.class_id,
                    "class_name": l.class_name,
                    "bbox": l.bbox,
                    "confidence": l.confidence,
                    "source": l.source
                } for l in labels]
            }
        return result

@router.post("/images/{image_id}/review")
def review_image_labels(
    image_id: int,
    data: LabelReviewSubmission,
    db: Session = Depends(get_db)
):
    db_img = db.query(DBImage).filter(DBImage.id == image_id).first()
    if not db_img:
        raise HTTPException(status_code=404, detail="Image not found")
        
    project = db_img.project
    project_id = project.id
    
    # 1. Delete existing labels for this image
    db.query(DBLabel).filter(DBLabel.image_id == image_id).delete()
    
    # 2. Insert new corrected labels
    new_labels = []
    for box in data.labels:
        db_label = DBLabel(
            image_id=image_id,
            class_id=box.class_id,
            class_name=box.class_name,
            confidence=box.confidence,
            source="human" # Promoted to human-reviewed
        )
        db_label.bbox = box.bbox
        db.add(db_label)
        new_labels.append(db_label)
        
    # 3. Update image status to reviewed
    db_img.status = "reviewed"
    db.commit()
    
    # Re-fetch labels with IDs
    db.refresh(db_img)
    labels = db.query(DBLabel).filter(DBLabel.image_id == image_id).all()

    # 4. Save review JSON to labels_reviewed/ folder
    storage_root = "storage"
    project_dir = Path(storage_root) / "projects" / str(project_id)
    labels_reviewed_dir = project_dir / "labels_reviewed"
    labels_reviewed_dir.mkdir(parents=True, exist_ok=True)
    
    json_filename = Path(db_img.file_path).stem + ".json"
    json_path = labels_reviewed_dir / json_filename
    
    detections = [{
        "class_id": l.class_id,
        "class_name": l.class_name,
        "bbox": l.bbox,
        "confidence": l.confidence,
        "source": l.source
    } for l in labels]
    
    # Read width/height from original image if possible to keep JSON consistent
    try:
        from PIL import Image as PILImage
        with PILImage.open(Path(storage_root) / db_img.file_path) as img:
            width, height = img.size
    except Exception:
        width, height = 640, 480 # fallback default

    with open(json_path, 'w') as f:
        json.dump({
            "image_id": db_img.id,
            "image_path": db_img.file_path,
            "width": width,
            "height": height,
            "status": "reviewed",
            "detections": detections
        }, f, indent=2)

    # 5. Check if all project images are now reviewed. If so, update project status
    all_images = db.query(DBImage).filter(DBImage.project_id == project_id).all()
    all_reviewed = all(img.status == "reviewed" for img in all_images)
    if all_reviewed:
        project.status = "reviewed"
    db.commit()

    return {"message": "Image labels reviewed and saved successfully", "labels_count": len(detections)}
