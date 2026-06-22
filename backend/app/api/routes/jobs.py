from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models.db import init_db, Job

router = APIRouter(prefix="/jobs", tags=["Jobs & Tasks"])

def get_db():
    _, SessionLocal = init_db()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/{job_id}")
def get_job_status(job_id: str, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    return {
        "job_id": job.id,
        "type": job.type,
        "status": job.status,
        "progress": job.progress,
        "project_id": job.project_id,
        "error_message": job.error_message,
        "created_at": job.created_at.isoformat(),
        "updated_at": job.updated_at.isoformat()
    }

@router.get("/")
def list_jobs(db: Session = Depends(get_db)):
    jobs = db.query(Job).all()
    return [{
        "job_id": j.id,
        "type": j.type,
        "status": j.status,
        "progress": j.progress,
        "project_id": j.project_id,
        "error_message": j.error_message
    } for j in jobs]

