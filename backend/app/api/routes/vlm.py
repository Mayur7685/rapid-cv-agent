import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from pathlib import Path
from PIL import Image as PILImage
from app.models.db import init_db, Project, Image as DBImage, Label as DBLabel
from app.agents.vlm_helper import get_moondream_model

router = APIRouter(prefix="/vlm", tags=["VLM Actions"])

def get_db():
    _, SessionLocal = init_db()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class VqaRequest(BaseModel):
    question: str

class SegmentRequest(BaseModel):
    object: str

@router.post("/{project_id}/images/{image_id}/vqa")
def vlm_vqa(
    project_id: int,
    image_id: int,
    data: VqaRequest,
    db: Session = Depends(get_db)
):
    # Fetch image
    db_img = db.query(DBImage).filter(
        DBImage.id == image_id,
        DBImage.project_id == project_id
    ).first()
    if not db_img:
        raise HTTPException(status_code=404, detail="Image not found")
        
    full_path = Path("storage") / db_img.file_path
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")
        
    try:
        # Load cached Moondream model
        vlm = get_moondream_model()
        with PILImage.open(full_path) as pil_img:
            # We want to make sure the image is in RGB format for the model
            if pil_img.mode != "RGB":
                pil_img = pil_img.convert("RGB")
            res = vlm.query(pil_img, data.question)
            answer = res.get("answer", "")
            return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"VQA inference error: {str(e)}")

@router.post("/{project_id}/images/{image_id}/segment")
def vlm_segment(
    project_id: int,
    image_id: int,
    data: SegmentRequest,
    db: Session = Depends(get_db)
):
    db_img = db.query(DBImage).filter(
        DBImage.id == image_id,
        DBImage.project_id == project_id
    ).first()
    if not db_img:
        raise HTTPException(status_code=404, detail="Image not found")
        
    full_path = Path("storage") / db_img.file_path
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")
        
    try:
        vlm = get_moondream_model()
        with PILImage.open(full_path) as pil_img:
            if pil_img.mode != "RGB":
                pil_img = pil_img.convert("RGB")
            res = vlm.segment(pil_img, data.object)
            path = res.get("path", "")
            return {"path": path}
    except ValueError as e:
        raise HTTPException(
            status_code=501, 
            detail=f"Model segmentation template missing or model does not support segmentation (requires Moondream 3+): {e}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Segmentation inference error: {str(e)}")

@router.post("/{project_id}/images/{image_id}/suggest-classes")
def vlm_suggest_classes(
    project_id: int,
    image_id: int,
    db: Session = Depends(get_db)
):
    db_img = db.query(DBImage).filter(
        DBImage.id == image_id,
        DBImage.project_id == project_id
    ).first()
    if not db_img:
        raise HTTPException(status_code=404, detail="Image not found")
        
    full_path = Path("storage") / db_img.file_path
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")
        
    try:
        vlm = get_moondream_model()
        with PILImage.open(full_path) as pil_img:
            if pil_img.mode != "RGB":
                pil_img = pil_img.convert("RGB")
            question = (
                "List the main distinct physical object classes of interest (e.g. helmet, car, person, bottle, etc.) visible in this image. "
                "Answer with only a comma-separated list of short singular lowercase nouns. Do not include any extra text."
            )
            res = vlm.query(pil_img, question)
            answer = res.get("answer", "")
            
            # Parse classes
            cleaned_answer = re.sub(r'[^a-zA-Z0-9,\s]', '', answer)
            classes = [c.strip().lower() for c in cleaned_answer.split(",") if c.strip()]
            return {"suggested_classes": classes[:8]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Class suggestion error: {str(e)}")
