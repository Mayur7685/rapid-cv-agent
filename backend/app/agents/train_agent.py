import os
import time
import shutil
from pathlib import Path
from sqlalchemy.orm import Session
from app.models.db import Project, TrainingRun

def run_train_agent(
    db_session_factory, # Sessionlocal factory (to open session inside callback/thread)
    project_id: int,
    model_size: str = "yolov8n", # yolov8n, yolov8s, etc.
    epochs: int = 10,
    storage_root: str = "storage",
    use_mock: bool = False
):
    """
    Trains a YOLO model on the prepared dataset.
    Updates the TrainingRun db record during training (via callbacks in real mode, or simulation in mock).
    """
    db = db_session_factory()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise ValueError(f"Project with ID {project_id} not found")

        # Create a new TrainingRun record
        run = TrainingRun(
            project_id=project_id,
            status="training",
            epoch=0,
            loss=0.0,
            map50=0.0
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        
        run_id = run.id
        
        # Update project status
        project.status = "training"
        db.commit()
    finally:
        db.close()

    # Define paths
    project_dir = Path(storage_root) / "projects" / str(project_id)
    dataset_dir = project_dir / "dataset"
    data_yaml_path = dataset_dir / "data.yaml"
    weights_dir = project_dir / "weights"
    weights_dir.mkdir(parents=True, exist_ok=True)

    if not data_yaml_path.exists():
        raise FileNotFoundError(f"data.yaml not found at {data_yaml_path}")

    # Real training run
    print(f"Starting real YOLO training run #{run_id} using model {model_size}...")
        
    from ultralytics import YOLO
    
    # Load weights model (e.g. yolov8n.pt or yolov8s.pt, downloads if not local)
    model = YOLO(f"{model_size}.pt")

    # Define custom callback to update SQLite during training
    def on_fit_epoch_end(trainer):
        db = db_session_factory()
        try:
            epoch = trainer.epoch + 1
            # trainer.loss_items are losses
            loss = float(trainer.loss_items[0]) if trainer.loss_items is not None else 0.0
            
            # Fetch validation metrics if computed in this epoch
            metrics = trainer.metrics if hasattr(trainer, "metrics") else {}
            map50 = float(metrics.get("metrics/mAP50(B)", 0.0))
            
            db_run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
            if db_run:
                db_run.epoch = epoch
                db_run.loss = loss
                db_run.map50 = map50
                db.commit()
        except Exception as e:
            print(f"Error updating training progress in callback: {e}")
        finally:
            db.close()

    # Add the callback
    model.add_callback("on_fit_epoch_end", on_fit_epoch_end)

    try:
        # Train the model
        # We specify project and name to control directory structure
        results = model.train(
            data=str(data_yaml_path.resolve()),
            epochs=epochs,
            imgsz=640,
            project=str(weights_dir.resolve()),
            name="yolo_train",
            exist_ok=True
        )
        
        # The weights are saved in project/name/weights/best.pt
        best_pt_source = weights_dir / "yolo_train" / "weights" / "best.pt"
        best_pt_dest = weights_dir / "best.pt"
        
        if best_pt_source.exists():
            shutil.copy2(best_pt_source, best_pt_dest)
            # Cleanup the folder structure created by YOLO to keep our storage neat
            shutil.rmtree(weights_dir / "yolo_train")
        
        db = db_session_factory()
        try:
            db_run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
            if db_run:
                db_run.status = "completed"
                db_run.weights_path = str(best_pt_dest.relative_to(storage_root))
                db.commit()
            db_project = db.query(Project).filter(Project.id == project_id).first()
            if db_project:
                db_project.status = "trained"
                db.commit()
        finally:
            db.close()
            
        return {"run_id": run_id, "status": "completed", "weights_path": str(best_pt_dest)}
        
    except Exception as err:
        db = db_session_factory()
        try:
            db_run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
            if db_run:
                db_run.status = "failed"
                db.commit()
            db_project = db.query(Project).filter(Project.id == project_id).first()
            if db_project:
                db_project.status = "failed"
                db.commit()
        finally:
            db.close()
        raise err
