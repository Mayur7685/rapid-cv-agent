import os
import tempfile
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from app.models.db import init_db, Project, Image as DBImage, Job
from app.agents.input_agent import run_input_agent
from app.jobs.tasks import background_autolabel_task

router = APIRouter(prefix="/projects", tags=["Images & Auto-Labeling"])

def get_db():
    _, SessionLocal = init_db()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class AutolabelRequest(BaseModel):
    use_mock: Optional[bool] = False

@router.get("/{project_id}/images")
def list_images(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    images = db.query(DBImage).filter(DBImage.project_id == project_id).all()
    return [{
        "id": img.id,
        "file_path": img.file_path,
        # Frontend will prepend the base backend URL to serve the static files: e.g. /static/projects/1/raw_images/...
        "status": img.status,
        "created_at": img.created_at.isoformat()
    } for img in images]

@router.post("/{project_id}/images/upload")
def upload_images(
    project_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    # Save uploaded files to a temp directory
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_dir_path = temp_dir
        
        for file in files:
            file_dest = os.path.join(temp_dir_path, file.filename)
            with open(file_dest, "wb") as buffer:
                buffer.write(file.file.read())
                
        # Run input agent to validate, deduplicate, and ingest images
        try:
            result = run_input_agent(
                db=db,
                project_name=project.name,
                classes=project.classes,
                images_source=temp_dir_path,
                storage_root="storage",
                project_id=project_id
            )
            return {
                "message": "Images uploaded and ingested successfully",
                "images_ingested": result["images_ingested"],
                "images_deduplicated": result["images_deduplicated"]
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Image ingestion failed: {str(e)}")

@router.post("/{project_id}/autolabel")
def trigger_autolabel(
    project_id: int,
    data: AutolabelRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check if there are any unlabeled images
    unlabeled_count = db.query(DBImage).filter(
        DBImage.project_id == project_id,
        DBImage.status == "unlabeled"
    ).count()
    
    if unlabeled_count == 0:
        raise HTTPException(status_code=400, detail="No unlabeled images found in this project.")

    # Check if project has an active job
    active_job = db.query(Job).filter(
        Job.project_id == project_id,
        Job.status.in_(["queued", "running"])
    ).first()
    if active_job:
        raise HTTPException(status_code=400, detail=f"Project is busy with an active job of type: {active_job.type}")

    # Create Job entry
    job_id = str(uuid.uuid4())
    job = Job(id=job_id, type="autolabel", status="queued", project_id=project_id, progress=0)
    db.add(job)
    
    # Update project status
    project.status = "labeling"
    db.commit()

    # Launch background task
    background_tasks.add_task(
        background_autolabel_task,
        job_id=job_id,
        project_id=project_id,
        use_mock=data.use_mock
    )

    return {"message": "Auto-labeling job queued successfully", "job_id": job_id}
