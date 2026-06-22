import os
import shutil
import datetime
from pathlib import Path
from sqlalchemy.orm import Session
from app.models.db import Project, TrainingRun, EvalReport

INFERENCE_SERVER_TEMPLATE = """import os
import io
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import StreamingResponse
from PIL import Image as PILImage
from ultralytics import YOLO

app = FastAPI(title="Rapid CV Pipeline — Inference Server")

# Load model (supports .pt and .onnx)
MODEL_PATH = "{model_path}"
CLASSES = {classes}

print(f"Loading YOLO model from {{MODEL_PATH}}...")
model = YOLO(MODEL_PATH)

@app.post("/predict")
def predict(file: UploadFile = File(...), conf_threshold: float = 0.25):
    image_bytes = file.file.read()
    image = PILImage.open(io.BytesIO(image_bytes))
    
    # Run prediction
    results = model.predict(image, conf=conf_threshold)
    result = results[0]
    
    detections = []
    # results[0].boxes contains box objects
    for box in result.boxes:
        xyxy = box.xyxy[0].tolist() # [xmin, ymin, xmax, ymax] in pixels
        conf = float(box.conf[0])
        cid = int(box.cls[0])
        cname = CLASSES[cid] if cid < len(CLASSES) else f"class_{{cid}}"
        
        detections.append({{
            "class_id": cid,
            "class_name": cname,
            "confidence": round(conf, 4),
            "bbox": [round(v, 2) for v in xyxy]
        }})
        
    return {{"detections": detections}}

@app.post("/predict-image")
def predict_image(file: UploadFile = File(...), conf_threshold: float = 0.25):
    image_bytes = file.file.read()
    image = PILImage.open(io.BytesIO(image_bytes))
    
    # Run prediction and plot results
    results = model.predict(image, conf=conf_threshold)
    result = results[0]
    
    # Plot returns a numpy array (BGR format) representing the image with boxes drawn
    plotted_img_arr = result.plot()
    
    # Convert BGR array to PIL RGB
    plotted_pil = PILImage.fromarray(plotted_img_arr[..., ::-1])
    
    img_byte_arr = io.BytesIO()
    plotted_pil.save(img_byte_arr, format="JPEG")
    img_byte_arr.seek(0)
    
    return StreamingResponse(img_byte_arr, media_type="image/jpeg")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
"""


MODEL_CARD_TEMPLATE = """# Model Card — {project_name} YOLO Model

Generated on {date} by Rapid CV Pipeline.

## Model Summary
- **Task:** Bounding-box Object Detection
- **Classes:** {classes}
- **Architecture:** {model_size} (Exported to ONNX)
- **Dataset Size:** {dataset_size} images (incl. training and validation splits)

## Performance Metrics (Validation Set)
{metrics_table}

## Files Exported
- `best.pt`: PyTorch weights file containing model parameters.
- `best.onnx`: ONNX format weights optimized for CPU/edge deployment.
- `inference_server.py`: A FastAPI endpoint server code.
- `MODEL_CARD.md`: This file.

## Quick Inference Setup

1. Install requirements:
   ```bash
   pip install fastapi uvicorn ultralytics pillow python-multipart
   ```
2. Start the server:
   ```bash
   python inference_server.py
   ```
3. Hit the endpoint with an image:
   ```bash
   curl -X POST -F "file=@test_image.jpg" http://localhost:8080/predict
   ```
"""

def run_export_agent(
    db: Session,
    eval_report_id: int,
    storage_root: str = "storage",
    use_mock: bool = False
):
    """
    Exports YOLO weights to ONNX format, generates a FastAPI inference server
    and a Markdown Model Card.
    """
    report = db.query(EvalReport).filter(EvalReport.id == eval_report_id).first()
    if not report:
        raise ValueError(f"EvalReport with ID {eval_report_id} not found")

    run = report.training_run
    project_id = run.project_id
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise ValueError(f"Project with ID {project_id} not found")

    project_dir = Path(storage_root) / "projects" / str(project_id)
    weights_dir = project_dir / "weights"
    best_pt_path = weights_dir / "best.pt"
    best_onnx_path = weights_dir / "best.onnx"

    print(f"Exporting real YOLO model {best_pt_path} to ONNX...")
    if not best_pt_path.exists():
        raise FileNotFoundError(f"best.pt weights file not found at {best_pt_path}")
        
    model = YOLO(str(best_pt_path))
    # Export model
    model.export(format="onnx")

    # Generate inference_server.py
    # We reference "best.onnx" relative to the location where inference_server.py is running (same folder)
    inference_code = INFERENCE_SERVER_TEMPLATE.format(
        model_path="best.onnx",
        classes=str(project.classes)
    )
    
    server_path = weights_dir / "inference_server.py"
    with open(server_path, 'w') as f:
        f.write(inference_code)

    # Generate performance table for Model Card
    metrics_table = "| Class | mAP50 | Precision | Recall | Status |\n|---|---|---|---|---|\n"
    for cname, m in report.per_class_metrics.items():
        metrics_table += f"| {cname} | {m['map50']:.4f} | {m['precision']:.4f} | {m['recall']:.4f} | {m['status'].upper()} |\n"

    # Dataset size
    dataset_dir = project_dir / "dataset"
    dataset_size = 0
    if dataset_dir.exists():
        # Count files in images
        dataset_size = len(list((dataset_dir / "images" / "train").glob("*"))) + len(list((dataset_dir / "images" / "val").glob("*")))

    # Generate MODEL_CARD.md
    model_card_code = MODEL_CARD_TEMPLATE.format(
        project_name=project.name,
        date=datetime.date.today().isoformat(),
        classes=str(project.classes),
        model_size="YOLOv8-Nano",
        dataset_size=dataset_size,
        metrics_table=metrics_table
    )

    card_path = weights_dir / "MODEL_CARD.md"
    with open(card_path, 'w') as f:
        f.write(model_card_code)

    print(f"Export complete. Files written to {weights_dir}")

    return {
        "best_pt": str(best_pt_path.relative_to(storage_root)),
        "best_onnx": str(best_onnx_path.relative_to(storage_root)),
        "inference_server": str(server_path.relative_to(storage_root)),
        "model_card": str(card_path.relative_to(storage_root))
    }
