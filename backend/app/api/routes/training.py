import uuid
import io
import json
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from PIL import Image as PILImage
from app.models.db import init_db, Project, Job, TrainingRun

router = APIRouter(prefix="/projects", tags=["Training & Augmentation"])


def get_db():
    _, SessionLocal = init_db()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─── Augment + Split ──────────────────────────────────────────────────────────

class AugmentationOptions(BaseModel):
    flip: Optional[bool] = True
    brightness: Optional[bool] = True
    contrast: Optional[bool] = False
    rotation: Optional[bool] = False
    mosaic: Optional[bool] = False
    crop: Optional[bool] = False
    brightness_factor: Optional[float] = 0.2
    contrast_factor: Optional[float] = 0.15
    rotation_degrees: Optional[float] = 15.0


class SplitConfig(BaseModel):
    train: Optional[int] = 70
    val: Optional[int] = 20
    test: Optional[int] = 10


class AugmentSplitRequest(BaseModel):
    augmentations: Optional[AugmentationOptions] = None
    split: Optional[SplitConfig] = None


def _background_augment_task(
    job_id: str,
    project_id: int,
    augmentations: dict,
    split: dict
):
    from app.models.db import init_db, Job, Project
    import random, shutil, yaml
    from PIL import Image as PILImage

    _, SessionLocal = init_db()

    def update_job(progress, status="running", error=None):
        db = SessionLocal()
        try:
            job = db.query(Job).filter(Job.id == job_id).first()
            if job:
                job.progress = progress
                job.status = status
                if error:
                    job.error_message = error
                db.commit()
        finally:
            db.close()

    update_job(5)

    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            update_job(0, "failed", "Project not found")
            return

        from app.models.db import Image as DBImage, Label as DBLabel

        images = db.query(DBImage).filter(
            DBImage.project_id == project_id,
            DBImage.status == "reviewed"
        ).all()

        if not images:
            update_job(0, "failed", "No reviewed images found. Please complete the review step first.")
            return

        storage_root = "storage"
        project_dir = Path(storage_root) / "projects" / str(project_id)
        dataset_dir = project_dir / "dataset"

        if dataset_dir.exists():
            shutil.rmtree(dataset_dir)

        train_pct = split.get("train", 70) / 100.0
        val_pct = split.get("val", 20) / 100.0
        # test_pct = split.get("test", 10) / 100.0  # reserved for future test set

        for s in ["train", "val", "test"]:
            (dataset_dir / "images" / s).mkdir(parents=True, exist_ok=True)
            (dataset_dir / "labels" / s).mkdir(parents=True, exist_ok=True)

        random.seed(42)
        shuffled = list(images)
        random.shuffle(shuffled)

        n = len(shuffled)
        n_train = int(n * train_pct)
        n_val = int(n * val_pct)

        train_imgs = shuffled[:n_train]
        val_imgs = shuffled[n_train:n_train + n_val]
        test_imgs = shuffled[n_train + n_val:]

        if not val_imgs and train_imgs:
            val_imgs = [train_imgs.pop()]

        classes = project.classes
        update_job(20)

        def write_image_and_label(db_img, split_name, suffix=""):
            src = Path(storage_root) / db_img.file_path
            if not src.exists():
                return 0

            labels_q = db.query(DBLabel).filter(DBLabel.image_id == db_img.id).all()
            if not labels_q:
                return 0

            dest_name = f"{src.stem}{suffix}{src.suffix}"
            dest_img = dataset_dir / "images" / split_name / dest_name
            dest_lbl = dataset_dir / "labels" / split_name / f"{src.stem}{suffix}.txt"

            if suffix == "_flip" and augmentations.get("flip"):
                try:
                    with PILImage.open(src) as img:
                        img.transpose(PILImage.FLIP_LEFT_RIGHT).save(dest_img)
                    with open(dest_lbl, "w") as f:
                        for lbl in labels_q:
                            xc, yc, w, h = lbl.bbox
                            f.write(f"{lbl.class_id} {1.0 - xc:.6f} {yc:.6f} {w:.6f} {h:.6f}\n")
                except Exception as e:
                    print(f"Flip aug failed: {e}")
                    return 0
            elif suffix == "_bright" and augmentations.get("brightness"):
                try:
                    from PIL import ImageEnhance
                    factor = 1.0 + augmentations.get("brightness_factor", 0.2)
                    with PILImage.open(src) as img:
                        ImageEnhance.Brightness(img).enhance(factor).save(dest_img)
                    with open(dest_lbl, "w") as f:
                        for lbl in labels_q:
                            xc, yc, w, h = lbl.bbox
                            f.write(f"{lbl.class_id} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}\n")
                except Exception as e:
                    print(f"Brightness aug failed: {e}")
                    return 0
            elif suffix == "_contrast" and augmentations.get("contrast"):
                try:
                    from PIL import ImageEnhance
                    factor = 1.0 + augmentations.get("contrast_factor", 0.15)
                    with PILImage.open(src) as img:
                        ImageEnhance.Contrast(img).enhance(factor).save(dest_img)
                    with open(dest_lbl, "w") as f:
                        for lbl in labels_q:
                            xc, yc, w, h = lbl.bbox
                            f.write(f"{lbl.class_id} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}\n")
                except Exception as e:
                    print(f"Contrast aug failed: {e}")
                    return 0
            elif suffix == "_rot" and augmentations.get("rotation"):
                try:
                    import math
                    degrees = augmentations.get("rotation_degrees", 15.0)
                    angle = random.uniform(-degrees, degrees)
                    with PILImage.open(src) as img:
                        img.rotate(angle, expand=False, resample=PILImage.BICUBIC).save(dest_img)
                    
                    rad = math.radians(-angle)
                    cos_a = math.cos(rad)
                    sin_a = math.sin(rad)
                    
                    yolo_lines = []
                    for lbl in labels_q:
                        xc, yc, w, h = lbl.bbox
                        x = xc - 0.5
                        y = yc - 0.5
                        x_new = x * cos_a - y * sin_a + 0.5
                        y_new = x * sin_a + y * cos_a + 0.5
                        
                        x_new = max(0.0, min(1.0, x_new))
                        y_new = max(0.0, min(1.0, y_new))
                        
                        w_new = w * abs(cos_a) + h * abs(sin_a)
                        h_new = w * abs(sin_a) + h * abs(cos_a)
                        
                        w_new = max(0.01, min(1.0, w_new))
                        h_new = max(0.01, min(1.0, h_new))
                        
                        yolo_lines.append(f"{lbl.class_id} {x_new:.6f} {y_new:.6f} {w_new:.6f} {h_new:.6f}\n")
                    with open(dest_lbl, "w") as f:
                        f.writelines(yolo_lines)
                except Exception as e:
                    print(f"Rotation aug failed: {e}")
                    return 0
            elif suffix == "_crop" and augmentations.get("crop"):
                try:
                    with PILImage.open(src) as img:
                        w_img, h_img = img.size
                        left = int(w_img * 0.1)
                        top = int(h_img * 0.1)
                        right = int(w_img * 0.9)
                        bottom = int(h_img * 0.9)
                        img.crop((left, top, right, bottom)).resize((w_img, h_img), PILImage.BILINEAR).save(dest_img)
                    
                    yolo_lines = []
                    for lbl in labels_q:
                        xc, yc, w, h = lbl.bbox
                        xc_new = (xc - 0.1) / 0.8
                        yc_new = (yc - 0.1) / 0.8
                        w_new = w / 0.8
                        h_new = h / 0.8
                        
                        if 0.0 <= xc_new <= 1.0 and 0.0 <= yc_new <= 1.0:
                            xmin = max(0.0, xc_new - w_new / 2)
                            ymin = max(0.0, yc_new - h_new / 2)
                            xmax = min(1.0, xc_new + w_new / 2)
                            ymax = min(1.0, yc_new + h_new / 2)
                            
                            xc_final = (xmin + xmax) / 2
                            yc_final = (ymin + ymax) / 2
                            w_final = xmax - xmin
                            h_final = ymax - ymin
                            
                            if w_final > 0.01 and h_final > 0.01:
                                yolo_lines.append(f"{lbl.class_id} {xc_final:.6f} {yc_final:.6f} {w_final:.6f} {h_final:.6f}\n")
                    
                    with open(dest_lbl, "w") as f:
                        f.writelines(yolo_lines)
                except Exception as e:
                    print(f"Crop aug failed: {e}")
                    return 0
            elif suffix == "_mosaic" and augmentations.get("mosaic"):
                try:
                    other_imgs = [o_img for o_img in train_imgs if o_img.id != db_img.id]
                    if len(other_imgs) < 3:
                        other_imgs = (other_imgs * 3)[:3]
                    else:
                        other_imgs = random.sample(other_imgs, 3)
                        
                    mosaic_imgs = [db_img] + other_imgs
                    
                    with PILImage.open(src) as first_img:
                        w_img, h_img = first_img.size
                    
                    mosaic_canvas = PILImage.new("RGB", (w_img, h_img), (128, 128, 128))
                    w_half, h_half = w_img // 2, h_img // 2
                    
                    quadrants = [
                        (0, 0),
                        (w_half, 0),
                        (0, h_half),
                        (w_half, h_half)
                    ]
                    
                    yolo_lines = []
                    
                    for idx, q_img in enumerate(mosaic_imgs):
                        q_src = Path(storage_root) / q_img.file_path
                        if not q_src.exists():
                            continue
                        with PILImage.open(q_src) as img:
                            resized_img = img.resize((w_half, h_half), PILImage.BILINEAR)
                            mosaic_canvas.paste(resized_img, quadrants[idx])
                            
                        q_labels = db.query(DBLabel).filter(DBLabel.image_id == q_img.id).all()
                        for lbl in q_labels:
                            xc, yc, w, h = lbl.bbox
                            q_x_offset = 0.5 if idx in [1, 3] else 0.0
                            q_y_offset = 0.5 if idx in [2, 3] else 0.0
                            
                            xc_new = xc * 0.5 + q_x_offset
                            yc_new = yc * 0.5 + q_y_offset
                            w_new = w * 0.5
                            h_new = h * 0.5
                            
                            yolo_lines.append(f"{lbl.class_id} {xc_new:.6f} {yc_new:.6f} {w_new:.6f} {h_new:.6f}\n")
                            
                    mosaic_canvas.save(dest_img)
                    with open(dest_lbl, "w") as f:
                        f.writelines(yolo_lines)
                except Exception as e:
                    print(f"Mosaic aug failed: {e}")
                    return 0
            else:
                shutil.copy2(src, dest_img)
                with open(dest_lbl, "w") as f:
                    for lbl in labels_q:
                        xc, yc, w, h = lbl.bbox
                        f.write(f"{lbl.class_id} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}\n")
            return 1

        train_count = 0
        for img in train_imgs:
            train_count += write_image_and_label(img, "train")
            if augmentations.get("flip"):
                train_count += write_image_and_label(img, "train", "_flip")
            if augmentations.get("brightness"):
                train_count += write_image_and_label(img, "train", "_bright")
            if augmentations.get("contrast"):
                train_count += write_image_and_label(img, "train", "_contrast")
            if augmentations.get("rotation"):
                train_count += write_image_and_label(img, "train", "_rot")
            if augmentations.get("crop"):
                train_count += write_image_and_label(img, "train", "_crop")
            if augmentations.get("mosaic"):
                train_count += write_image_and_label(img, "train", "_mosaic")

        update_job(60)

        val_count = 0
        for img in val_imgs:
            val_count += write_image_and_label(img, "val")

        test_count = 0
        for img in test_imgs:
            test_count += write_image_and_label(img, "test")

        update_job(80)

        # Write data.yaml
        names_dict = {i: n for i, n in enumerate(classes)}
        yaml_content = {
            "path": str(dataset_dir.resolve()),
            "train": "images/train",
            "val": "images/val",
            "names": names_dict
        }
        with open(dataset_dir / "data.yaml", "w") as f:
            yaml.dump(yaml_content, f, default_flow_style=False)

        # Write split_info.json for the UI
        split_info = {
            "train_count": train_count,
            "val_count": val_count,
            "test_count": test_count,
            "augmentations_applied": augmentations
        }
        with open(project_dir / "split_info.json", "w") as f:
            json.dump(split_info, f, indent=2)

        # Update project status
        proj_db = db.query(Project).filter(Project.id == project_id).first()
        if proj_db:
            proj_db.status = "ready_to_train"
            db.commit()

        update_job(100, "completed")

    except Exception as e:
        update_job(0, "failed", str(e))
        raise
    finally:
        db.close()


@router.post("/{project_id}/augment-split")
def augment_and_split(
    project_id: int,
    data: AugmentSplitRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Runs augmentation + train/val/test split as a background job."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    active_job = db.query(Job).filter(
        Job.project_id == project_id,
        Job.status.in_(["queued", "running"])
    ).first()
    if active_job:
        raise HTTPException(status_code=400, detail=f"Project busy: {active_job.type} job running")

    job_id = str(uuid.uuid4())
    job = Job(id=job_id, type="augment_split", status="queued", project_id=project_id, progress=0)
    db.add(job)
    project.status = "augmenting"
    db.commit()

    aug_dict = data.augmentations.dict() if data.augmentations else {}
    split_dict = data.split.dict() if data.split else {"train": 70, "val": 20, "test": 10}

    background_tasks.add_task(
        _background_augment_task,
        job_id=job_id,
        project_id=project_id,
        augmentations=aug_dict,
        split=split_dict
    )

    return {"message": "Augmentation & split job queued", "job_id": job_id}


@router.get("/{project_id}/split-info")
def get_split_info(project_id: int, db: Session = Depends(get_db)):
    """Returns the split info JSON for a project if it exists."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    split_path = Path("storage") / "projects" / str(project_id) / "split_info.json"
    if not split_path.exists():
        return {"train_count": 0, "val_count": 0, "test_count": 0, "augmentations_applied": {}}

    with open(split_path) as f:
        return json.load(f)


# ─── Live Inference ───────────────────────────────────────────────────────────

@router.post("/{project_id}/inference")
async def live_inference(
    project_id: int,
    confidence: Optional[float] = 0.25,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Runs live inference on an uploaded image using the project's trained model.
    Falls back to mock detections if no real model exists.
    """
    import random

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    contents = await file.read()
    try:
        pil_img = PILImage.open(io.BytesIO(contents))
        width, height = pil_img.size
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {str(e)}")

    weights_path = Path("storage") / "projects" / str(project_id) / "weights" / "best.pt"
    is_real_model = weights_path.exists() and weights_path.stat().st_size > 100_000

    classes = project.classes
    detections = []

    if is_real_model:
        try:
            from ultralytics import YOLO
            model = YOLO(str(weights_path))
            results = model.predict(pil_img, conf=confidence, verbose=False)
            for box in results[0].boxes:
                xyxy = box.xyxy[0].tolist()
                cid = int(box.cls[0])
                detections.append({
                    "class_id": cid,
                    "class_name": classes[cid] if cid < len(classes) else f"class_{cid}",
                    "confidence": round(float(box.conf[0]), 4),
                    "bbox": [round(v, 2) for v in xyxy]
                })
        except Exception as e:
            print(f"Real inference failed: {e}, falling back to mock")
            is_real_model = False

    if not is_real_model:
        raise HTTPException(status_code=400, detail="No trained model weights found. Please train the model first.")

    return {
        "detections": detections,
        "width": width,
        "height": height,
        "model_used": "real",
        "confidence_threshold": confidence
    }


# ─── Model Status ─────────────────────────────────────────────────────────────

@router.get("/{project_id}/model-status")
def get_model_status(project_id: int, db: Session = Depends(get_db)):
    """Returns current model availability and latest metrics."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    weights_path = Path("storage") / "projects" / str(project_id) / "weights" / "best.pt"
    has_model = weights_path.exists() and weights_path.stat().st_size > 1000
    is_real_model = weights_path.exists() and weights_path.stat().st_size > 100_000

    latest_run = db.query(TrainingRun).filter(
        TrainingRun.project_id == project_id,
        TrainingRun.status == "completed"
    ).order_by(TrainingRun.started_at.desc()).first()

    eval_path = Path("storage") / "projects" / str(project_id) / "eval_report.json"
    eval_data = {}
    if eval_path.exists():
        with open(eval_path) as f:
            eval_data = json.load(f)

    return {
        "has_model": has_model,
        "is_real_model": is_real_model,
        "project_status": project.status,
        "latest_run": {
            "id": latest_run.id,
            "map50": latest_run.map50,
            "loss": latest_run.loss,
            "epoch": latest_run.epoch,
            "started_at": latest_run.started_at.isoformat()
        } if latest_run else None,
        "eval_report": eval_data
    }
