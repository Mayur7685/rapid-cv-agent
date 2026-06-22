import uuid
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from app.models.db import init_db, Project, Job, TrainingRun, EvalReport
from app.jobs.tasks import background_train_task

router = APIRouter(prefix="/projects", tags=["Projects"])

# Dependency to get db session
def get_db():
    _, SessionLocal = init_db()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Pydantic schemas
class ProjectCreate(BaseModel):
    name: str
    classes: List[str]

class ProjectResponse(BaseModel):
    id: int
    name: str
    classes: List[str]
    status: str
    
    class Config:
        orm_mode = True

class TrainRequest(BaseModel):
    model_size: Optional[str] = "yolov8n"
    epochs: Optional[int] = 10
    threshold: Optional[float] = 0.50
    use_mock: Optional[bool] = False

@router.get("/", response_model=List[ProjectResponse])
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).all()
    # Serialize classes list property from project model
    result = []
    for p in projects:
        result.append(ProjectResponse(
            id=p.id,
            name=p.name,
            classes=p.classes,
            status=p.status
        ))
    return result

@router.post("/", response_model=ProjectResponse)
def create_project(data: ProjectCreate, db: Session = Depends(get_db)):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Project name cannot be empty")
    if not data.classes:
        raise HTTPException(status_code=400, detail="At least one class is required")
        
    project = Project(name=data.name, classes=data.classes, status="created")
    db.add(project)
    db.commit()
    db.refresh(project)
    
    return ProjectResponse(
        id=project.id,
        name=project.name,
        classes=project.classes,
        status=project.status
    )

@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectResponse(
        id=project.id,
        name=project.name,
        classes=project.classes,
        status=project.status
    )

@router.post("/{project_id}/train")
def train_project(
    project_id: int,
    data: TrainRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    # Check if there's any active job for this project
    active_job = db.query(Job).filter(
        Job.project_id == project_id,
        Job.status.in_(["queued", "running"])
    ).first()
    if active_job:
        raise HTTPException(status_code=400, detail=f"Project is busy with an active job of type: {active_job.type}")

    # Generate a job UUID
    job_id = str(uuid.uuid4())
    job = Job(id=job_id, type="training", status="queued", project_id=project_id, progress=0)
    db.add(job)
    
    # Update project status
    project.status = "training"
    db.commit()

    # Trigger background task
    background_tasks.add_task(
        background_train_task,
        job_id=job_id,
        project_id=project_id,
        model_size=data.model_size,
        epochs=data.epochs,
        threshold=data.threshold,
        use_mock=data.use_mock
    )

    return {"message": "Training job queued successfully", "job_id": job_id}

@router.get("/{project_id}/runs")
def list_training_runs(project_id: int, db: Session = Depends(get_db)):
    runs = db.query(TrainingRun).filter(TrainingRun.project_id == project_id).order_by(TrainingRun.started_at.desc()).all()
    result = []
    for r in runs:
        # Load reports if any
        reports = []
        for rep in r.eval_reports:
            reports.append({
                "id": rep.id,
                "per_class_metrics": rep.per_class_metrics,
                "decision": rep.decision,
                "created_at": rep.created_at.isoformat()
            })
        result.append({
            "id": r.id,
            "status": r.status,
            "epoch": r.epoch,
            "loss": r.loss,
            "map50": r.map50,
            "weights_path": r.weights_path,
            "started_at": r.started_at.isoformat(),
            "eval_reports": reports
        })
    return result


from fastapi import UploadFile, File
from fastapi.responses import FileResponse
from PIL import Image as PILImage
import io
import re
import random
import os
import json
from pathlib import Path
from openrouter import OpenRouter

class NlpRequest(BaseModel):
    text: str

def extract_classes_with_llm(text: str) -> Optional[List[str]]:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        print("OPENROUTER_API_KEY not found in environment. Falling back to local regex-based parsing.")
        return None
        
    prompt = (
        "You are a helpful assistant that extracts a list of object classes/categories that a user wants to detect in an object detection task from their natural language description.\n"
        "Extract only the distinct object names. Keep names short, singular, and lowercase (e.g., 'cup' instead of 'red cups').\n"
        "Provide the output as a valid JSON object with a single key 'classes' containing a list of strings.\n"
        "Do not include any markdown formatting (like ```json), explanation, or other text outside the JSON.\n"
        f"User input: \"{text}\"\n"
        "JSON output:"
    )
    
    try:
        with OpenRouter(api_key=api_key) as client:
            response = client.chat.send(
                model="openrouter/free",
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )
            content = response.choices[0].message.content.strip()
            # Clean possible markdown wrapping
            if content.startswith("```"):
                content = content.replace("```json", "").replace("```", "").strip()
            parsed = json.loads(content)
            if "classes" in parsed and isinstance(parsed["classes"], list):
                return [str(c).lower().strip() for c in parsed["classes"] if str(c).strip()]
    except Exception as e:
        print(f"Failed to call OpenRouter LLM using library: {e}")
        
    return None

@router.post("/nlp/extract-classes")
def extract_classes_api(data: NlpRequest):
    text = data.text
    
    # Try calling OpenRouter LLM first
    llm_classes = extract_classes_with_llm(text)
    if llm_classes is not None:
        return {"classes": llm_classes[:8]}
        
    # Local fallback logic using regex
    cleaned = re.sub(r'i want to detect|detect|find|identify|recognize|look for|spot|locate|track', '', text, flags=re.IGNORECASE)
    cleaned = re.sub(r'\bin\b|\bon\b|\bat\b|\ba\b|\ban\b|\bthe\b|\band\b|\bor\b|\bwith\b|\busing\b', ',', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'[.!?]', ',', cleaned)
    
    parts = [p.strip().lower() for p in cleaned.split(',') if p.strip()]
    classes = []
    seen = set()
    for p in parts:
        clean = re.sub(r'[^a-z0-9 \-_]', '', p).strip()
        if clean and len(clean) > 1 and len(clean) < 40 and clean not in seen:
            seen.add(clean)
            classes.append(clean)
    return {"classes": classes[:8]}

@router.get("/{project_id}/download-model")
def download_model(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    weights_path = Path("storage") / "projects" / str(project_id) / "weights" / "best.pt"
    if not weights_path.exists():
        raise HTTPException(status_code=404, detail="Model weights not found. Please complete training first.")
        
    return FileResponse(
        path=weights_path,
        filename=f"project_{project_id}_best.pt",
        media_type="application/octet-stream"
    )

@router.post("/{project_id}/test-inference")
def test_inference(
    project_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Read image dimensions
    try:
        contents = file.file.read()
        pil_img = PILImage.open(io.BytesIO(contents))
        width, height = pil_img.size
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {str(e)}")

    # Check if a real PyTorch model weights file exists
    weights_path = Path("storage") / "projects" / str(project_id) / "weights" / "best.pt"
    if not weights_path.exists():
        raise HTTPException(status_code=400, detail="No trained model found. Please complete training first.")

    classes = project.classes
    detections = []

    try:
        from ultralytics import YOLO
        model = YOLO(str(weights_path))
        results = model.predict(pil_img, conf=0.25)
        result = results[0]
        
        for box in result.boxes:
            xyxy = box.xyxy[0].tolist() # [xmin, ymin, xmax, ymax] in pixels
            conf = float(box.conf[0])
            cid = int(box.cls[0])
            cname = classes[cid] if cid < len(classes) else f"class_{cid}"
            
            detections.append({
                "class_id": cid,
                "class_name": cname,
                "confidence": round(conf, 4),
                "bbox": [round(v, 2) for v in xyxy]
            })
    except Exception as e:
        print(f"Error running real YOLO inference in endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Model execution error: {str(e)}")

    return {"detections": detections, "width": width, "height": height}
