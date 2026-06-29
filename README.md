# Rapid CV Pipeline — Agentic Vision Console

Rapid CV is a self-hosted computer vision pipeline accelerator that lets you build, label, train, and deploy custom object detection models in minutes — with zero cloud dependency. It uses a **local Moondream 2 VLM** running directly on Apple Silicon (MPS) or CUDA to auto-annotate images with bounding boxes, and fine-tunes a YOLOv8 model on the resulting dataset.

---

## Key Capabilities

- **Local VLM Auto-Labeling**: Uses the [Moondream 2](https://moondream.ai/) vision-language model running entirely on-device (MPS / CUDA / CPU) to detect and annotate objects in images via `model.detect(image, class_name)`. Zero cloud calls, zero API keys required for auto-labeling.
- **Precision/Recall Controls**: Two sliders in the UI — **Detection Threshold** (box size filter to suppress hallucinations) and **NMS IoU Threshold** (duplicate box suppression) — give fine-grained control over the auto-label quality.
- **OpenRouter LLM Class Extraction**: Dynamically extracts singular, lowercase class tags from natural language project descriptions using the `openrouter` Python SDK. Falls back to local regex parsing if no API key is configured.
- **Interactive AI Onboarding Chat**: Conversational interface guides users through project setup, class definition, and project naming before entering the pipeline.
- **Human-in-the-Loop Canvas**: Refine auto-generated labels using a Konva-powered canvas editor with box draw (`W`), select (`V`), resize, delete, class reassignment (keys `1–9`), and per-image approval workflow.
- **HTML5 Webcam Capture**: Capture live snapshots directly in the browser using `getUserMedia` to add real-time training examples.
- **Offline Data Augmentation**: PIL/numpy-based augmentations — Contrast Jitter, Random Rotation, Center Crop, 2×2 Mosaic — with automatic bounding box coordinate translation.
- **Real YOLOv8 Fine-Tuning**: Trains custom YOLOv8n/s/m models locally, with live epoch-by-epoch loss and mAP telemetry streamed to the UI via Recharts.
- **Test Inference Sandbox**: Upload an image after training to run live inference, adjust confidence/overlap/opacity sliders, and visualise bounding box predictions directly on the canvas.
- **Weights Download & ONNX Export**: Download `best.pt` PyTorch weights or export to ONNX for edge deployment, along with a generated `MODEL_CARD.md` and ready-to-run `inference_server.py`.
- **Monochrome + Yellow UI Theme**: Built with React + shadcn/ui components, Tailwind CSS v4, and a clean monochrome design system with yellow `#eab308` accent color.

---

## Architecture

```
rapid-cv-pipeline/
├── backend/                      # Python FastAPI server
│   ├── app/
│   │   ├── main.py               # FastAPI entrypoint, static mounts
│   │   ├── api/routes/
│   │   │   ├── images.py         # Upload & autolabel endpoints
│   │   │   ├── projects.py       # Project CRUD, NLP class extraction, test inference
│   │   │   ├── labels.py         # Label read/write endpoints
│   │   │   ├── training.py       # YOLO training, augmentation, evaluation
│   │   │   ├── vlm.py            # Interactive per-image VLM query/detect/segment
│   │   │   └── jobs.py           # Job status polling
│   │   ├── agents/
│   │   │   ├── vlm_helper.py     # Moondream 2 lazy loader (MPS / CUDA / CPU)
│   │   │   ├── autolabel_agent.py # Batch auto-labeling via Moondream detect()
│   │   │   ├── qc_agent.py       # NMS + confidence filtering + image status bucketing
│   │   │   ├── input_agent.py    # Image ingestion, deduplication
│   │   │   ├── augment_agent.py  # Offline augmentation + train/val split
│   │   │   ├── train_agent.py    # YOLOv8 fine-tuning wrapper
│   │   │   ├── eval_agent.py     # Per-class precision/recall/mAP evaluation
│   │   │   └── export_agent.py   # ONNX export + inference_server.py generation
│   │   ├── jobs/tasks.py         # Background task orchestration
│   │   └── models/db.py          # SQLAlchemy models (SQLite)
│   ├── storage/                  # Auto-created: images, labels, datasets, weights
│   ├── requirements.txt
│   └── .env                      # OPENROUTER_API_KEY (optional)
│
└── frontend/                     # React + Vite application
    └── src/
        ├── App.jsx               # Stage router and header
        ├── index.css             # Design system tokens (monochrome + yellow)
        └── components/
            ├── HomeScreen.jsx    # Project dashboard + marketing section
            ├── ChatOnboarding.jsx # Conversational project setup
            ├── UploadStage.jsx   # File upload + webcam capture
            ├── AutoLabelStage.jsx # Moondream auto-label controls
            ├── LabelReview.jsx   # Canvas annotation editor
            ├── AugmentSplitStage.jsx # Augmentation + train/val split config
            ├── TrainingMonitor.jsx # Live training telemetry
            └── TestDeployStage.jsx # Inference sandbox + deploy/export
```

---

## Setup & Installation

### Prerequisites
- **Python**: `3.10` or higher
- **Node.js**: `18.0` or higher (with npm)
- **Moondream 2 weights**: Downloaded automatically on first run via `pip install moondream`
- **Apple Silicon recommended**: MPS acceleration gives ~5–10× speedup over CPU for Moondream inference

### 1. Configuration (Optional)
Create a `.env` file in the `backend/` directory for LLM-powered class extraction:
```bash
cd backend
echo "OPENROUTER_API_KEY=your_openrouter_api_key_here" > .env
```
> If omitted, the app falls back to local regex-based class extraction — auto-labeling still works fully without this key.

### 2. Backend Server Setup
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```
*Server runs on `http://127.0.0.1:8000`. API docs at `http://127.0.0.1:8000/docs`.*

> **First start note**: The Moondream 2 model weights (~1.7 GB) are downloaded on the first auto-label run and cached locally. Subsequent runs load from cache instantly.

### 3. Frontend Application Setup
```bash
cd frontend
npm install
npm run dev
```
*Open your browser at `http://localhost:5173/`.*

---

## Pipeline Stages

| Stage | Description |
|-------|-------------|
| **Chat Onboarding** | Describe what you want to detect in natural language. Classes are extracted automatically. |
| **Upload** | Drag & drop images or capture via webcam. Images are deduplicated on ingest. |
| **Auto-Label** | Moondream 2 VLM runs `detect(image, class)` per class per image. Adjust Detection Threshold and NMS IoU sliders for precision/recall control. |
| **Label Review** | Inspect and correct auto-generated boxes on an interactive canvas. Approve images to proceed. |
| **Augment & Split** | Configure train/val ratio and offline augmentations (contrast, rotation, crop, mosaic). |
| **Train** | Fine-tune YOLOv8 locally with live loss/mAP telemetry. |
| **Test & Deploy** | Run inference on new images, download `best.pt`, export to ONNX. |

---

## Resetting the Database

To clear all projects, images, labels, and trained weights:
```bash
cd backend
rm -f storage/rapid_cv.db
rm -rf storage/projects/
```
The database is recreated automatically on next server start.
