# Rapid CV Pipeline — Agentic Vision Console

Rapid CV is a self-hosted computer vision pipeline accelerator designed to build, label, train, and test custom object detection models in minutes. By utilizing zero-shot foundation models (Grounding DINO) to auto-label images and active learning loops to request further data where the model struggles, it dramatically speeds up the computer vision lifecycle.

The application is completely powered by **real-AI endpoints**—mock toggles have been removed. It features an Obsidian dark aesthetic, responsive viewport layouts, and seamless real-time telemetry polling.

---

## Key Capabilities

- **Zero-Shot Auto-Labeling**: Zero-shot target class proposal generation via Grounding DINO. Directly maps text categories to pixel bounding boxes without manual annotations.
- **OpenRouter Free LLM API**: Dynamically extracts singular, lowercase class tags from natural language prompt descriptions using the official `openrouter` Python SDK client and the `openrouter/free` router.
- **Robust Local Heuristic Fallback**: Gracefully falls back to local regex-based noun parsers if the `OPENROUTER_API_KEY` is not configured or if external API calls fail.
- **Offline Data Augmentation**: Native PIL/numpy-based augmentations (Contrast Jitter, Random Rotation, Random 80% Center Crop, and 2x2 Grid Mosaic collage) complete with bounding box coordinate translations and boundary check logic.
- **Real YOLOv8 Fine-Tuning**: Trains custom models locally (on CPU/MPS) using the reviewed dataset, streaming live training loss and mAP telemetry charts.
- **Human-in-the-Loop Canvas**: Refine labels using an interactive Konva canvas editor supporting box resizing, box drawing (`W`), selection (`V`), deletion, and class re-mapping.
- **HTML5 Webcam Capture**: Capture live snapshots directly in the console using `getUserMedia` to stage and build new training examples.
- **Weights Download & ONNX Export**: Serves the trained custom `best.pt` model weights as a file download and supports ONNX deployment export.

---

## Repository Map

### 🐍 Backend Python Application
- **API Entrypoint** ([main.py](backend/app/main.py)): FastAPI server configuration loading environment variables from `.env` on startup via `python-dotenv`, registering endpoint routes, and mounting static storage paths.
- **NLP Classes Router** ([projects.py](backend/app/api/routes/projects.py)): Handles project operations, weights downloads, NLP class extraction utilizing OpenRouter context manager, and test inference trials.
- **Training Router** ([training.py](backend/app/api/routes/training.py)): Runs local YOLO inference and manages data splits and the offline PIL background data augmentation worker.
- **Core Agents** ([app/agents/](backend/app/agents/)):
  - [autolabel_agent.py](backend/app/agents/autolabel_agent.py) — Runs Grounding DINO zero-shot label proposals.
  - [train_agent.py](backend/app/agents/train_agent.py) — Launches fine-tuning on the custom dataset.
  - [eval_agent.py](backend/app/agents/eval_agent.py) — Computes class-wise precision, recall, and mAP metrics.
  - [export_agent.py](backend/app/agents/export_agent.py) — Exports YOLO weights into a valid ONNX package.

### 💻 Frontend React Application
- **Style System** ([index.css](frontend/src/index.css)): Glassmorphic dashboard themes, font layouts (Space Grotesk, Inter), and scanner laser scanline animations.
- **App Shell** ([App.jsx](frontend/src/App.jsx)): Manages stage layout state, webcam streams, and navigates dynamically based on the project's metadata pipeline checkpoints.
- **Project Loader** ([HomeScreen.jsx](frontend/src/components/HomeScreen.jsx)): Responsive project list dashboard allowing rapid project resumes directly to their next pending pipeline checkpoint.
- **Ingestion Workbench** ([UploadStage.jsx](frontend/src/components/UploadStage.jsx)): Dual upload/snapshot staging area with native camera selection.
- **Annotation Workbench** ([AutoLabelStage.jsx](frontend/src/components/AutoLabelStage.jsx)): Triggers and logs Grounding DINO zero-shot extraction.
- **Training Monitor** ([TrainingMonitor.jsx](frontend/src/components/TrainingMonitor.jsx)): Real-time telemetry monitoring epochs vs training metrics using Recharts.
- **Testing & Export** ([ExportPanel.jsx](frontend/src/components/ExportPanel.jsx)): Inferencing try-out sandbox rendering pixel bounding box coordinates and code snippets.

---

## Setup & Installation

### Prerequisites
- **Python**: `3.10` or higher
- **Node.js**: `18.0` or higher (with npm)

### 1. Configuration Setup
Create a `.env` file in the `backend/` directory to store configuration variables:
```bash
cd backend
echo "OPENROUTER_API_KEY=your_openrouter_api_key_here" > .env
```
*(If the key is left empty or omitted, the application will automatically fall back to local regex extraction heuristics.)*

### 2. Backend Server Setup
1. Open a terminal and navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```
3. Install required packages:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the FastAPI application server:
   ```bash
   # Recommended (launches with live reload on port 8000)
   uvicorn app.main:app --reload
   
   # Or run via Python module execution
   python -m app.main
   ```
   *The server runs on `http://127.0.0.1:8000`. API documentation is available at `http://127.0.0.1:8000/docs`.*

### 3. Frontend Application Setup
1. In a new terminal, navigate to the frontend folder:
   ```bash
   cd frontend
   ```
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Start the Vite React development server:
   ```bash
   npm run dev
   ```
   *Open your browser and navigate to `http://localhost:5173/`.*
