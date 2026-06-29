# Testing & Verification Guide — Rapid CV Pipeline

This guide covers step-by-step workflows and CLI commands for validating the Rapid CV Pipeline from scratch.

---

## 🏗️ Pre-Test Environment Setup

### 1. Configure OpenRouter API Key (Optional)
Only needed for LLM-powered class extraction from natural language. Auto-labeling works without it.

- **With LLM** (recommended):
  ```bash
  cd backend
  echo "OPENROUTER_API_KEY=sk-or-v1-your-key-here" > .env
  ```
- **Without LLM**: Leave `.env` empty or skip creating it. The backend falls back to local regex-based noun extraction automatically.

### 2. Launch the Backend API Server
```bash
cd backend
source .venv/bin/activate        # Windows: .venv\Scripts\activate
uvicorn app.main:app --reload
```
*Server boots on `http://127.0.0.1:8000`. API docs available at `http://127.0.0.1:8000/docs`.*

> **First run**: Moondream 2 model weights (~1.7 GB) are downloaded automatically when the first auto-label job runs. This only happens once — subsequent runs load from local cache.

### 3. Launch the Frontend Web Console
```bash
cd frontend
npm run dev
```
*React app runs on `http://localhost:5173/`.*

### 4. Seed Verification Datasets
To quickly populate images for testing without a real camera or dataset:

```bash
cd backend
source .venv/bin/activate

# Generates 10 synthetic shape images (triangles/squares)
python generate_samples.py
# → Places files under backend/samples/

# Downloads real photography from Unsplash (cups & bottles)
python download_real_images.py
# → Places files under backend/real_samples/
```

### 5. Reset Database (Clean Slate)
To wipe all projects, images, labels, and weights before testing:
```bash
cd backend
rm -f storage/rapid_cv.db
rm -rf storage/projects/
```
The database is recreated automatically on next server start.

---

## 🧪 Automated Integration Script

Validates the full backend pipeline: DB creation → image ingestion → Moondream auto-labeling → YOLO training → evaluation.

```bash
cd backend
source .venv/bin/activate
python verify_api.py
```

Expected output: `INTEGRATION VERIFICATION SUCCESSFUL!` with per-class precision/recall/mAP metrics.

---

## 💻 Manual Web Console Walkthrough

Open `http://localhost:5173/` and follow this sequence:

---

### Step 1: Project Onboarding (Chat Interface)

1. Click **+ Start New Project** on the home screen.
2. The AI chat onboarding opens — describe what objects you want to detect:
   - *Example*: `"I want to detect helmets and safety vests on a construction site"`
3. Verify the class chips are extracted (e.g. `helmet`, `vest`). Edit or add classes if needed.
4. Give your project a name and click **Create Project**.

> The class extraction uses OpenRouter LLM if configured, otherwise falls back to local regex parsing. Both produce the same chip format.

---

### Step 2: Upload Stage

1. In the **Upload** stage, add images using either method:
   - **File Upload**: Drag & drop 5–15 images (use `backend/real_samples/` or your own).
   - **Webcam**: Click **Use Webcam** → allow camera → click **Capture** → **Add to Staging**.
2. Verify the image thumbnails populate in the left staging list.
3. Optionally add/edit ontology class tags in the right panel.
4. Click **Upload & Ingest** and wait for the progress indicator to complete.

---

### Step 3: Moondream Auto-Labeling

1. In the **Auto-Label** stage, review your defined classes in the right panel.
2. Check the **Auto-Label Engine** badge — it should show **Moondream 2 VLM · local · MPS**.
3. Configure the sliders:
   - **Detection Threshold** (default `35%`): Controls minimum box size. Raise to reduce false positives; lower to catch more objects.
   - **NMS IoU Threshold** (default `45%`): Controls duplicate box suppression. Lower = more aggressive.
4. Click **Run On All Images**.
5. Watch the progress bar. Once completed, green dots appear on labeled thumbnails.
6. Verify detection counts appear next to each class name in the right panel.

> Moondream runs `detect(image, class_name)` once per class per image — entirely on-device with no internet calls.

---

### Step 4: Label Review Canvas

1. The **Label Review** stage opens with the interactive canvas editor.
2. Verify bounding boxes are drawn on the active image with class-colored outlines.
3. Test canvas editing controls:
   - Press **W** → enter Draw mode → click and drag to create new boxes.
   - Press **V** → enter Select mode → click a box to select it.
   - Drag corners to resize, drag center to move.
   - Press **1–9** to reassign the selected box to a class.
   - Press **Backspace/Delete** to remove the selected box.
4. Use the **Ask VLM** button on the right panel to query Moondream about the current image.
5. Click **Approve** for each image. Approved images show a green checkmark badge.
6. Approve all images to enable the **Continue to Augment** button.

---

### Step 5: Augmentation & Split

1. In the **Augment & Split** stage, configure:
   - **Train/Val Split**: Drag the split slider (e.g. 80% train / 20% val).
   - **Augmentations**: Enable any combination of Contrast, Rotation, Crop, Mosaic.
2. Click **Apply & Continue**.
3. *(Optional)* Verify augmented files in `backend/storage/projects/{id}/dataset/` — augmented images have suffixes like `_contrast.jpg`, `_rot.jpg`, `_mosaic.jpg`.

---

### Step 6: Model Training

1. In the **Train** stage, configure:
   - **Model Size**: `yolov8n` (fastest), `yolov8s`, or `yolov8m`
   - **Epochs**: Start with `5–10` for a quick test
   - **mAP Threshold**: Minimum mAP50 to trigger model export (e.g. `0.50`)
2. Click **Start Training**.
3. Monitor the live epoch telemetry: loss curves and mAP50 chart update after each epoch.
4. On completion, verify the per-class evaluation table showing precision, recall, and pass/fail status.

---

### Step 7: Test Inference & Deploy

1. In the **Test & Deploy** stage, the **Test Model** tab opens by default.
2. Upload or drag a test image into the canvas area.
3. Adjust the sidebar sliders:
   - **Confidence Threshold**: Minimum box confidence to display
   - **Overlap Threshold**: NMS suppression for inference output
   - **Opacity**: Box overlay transparency
4. Click **Run Inference** — bounding boxes appear on the canvas with class labels and confidence scores.
5. Switch to the **Deploy & API** tab:
   - View generated Python/cURL/JavaScript API code snippets.
   - Click **Download Model (.pt)** to download PyTorch weights.
   - Click **Improve Model** to return to the upload stage and add more training data.

---

## ✅ Verification Checklist

| Check | Expected |
|-------|----------|
| Backend server starts | `Uvicorn running on http://127.0.0.1:8000` |
| Frontend loads | Home screen with project list and marketing section |
| New project created | Chat onboarding opens, classes extracted from text |
| Images uploaded | Thumbnails visible in left rail of Auto-Label stage |
| Moondream auto-labels | Green dots on thumbnails, detection counts in sidebar |
| Label review loads | Canvas shows bounding boxes; W/V/Backspace keys work |
| Training completes | Epoch telemetry charts update; per-class table appears |
| Inference runs | Bounding boxes drawn on test image with correct labels |
| Model download | `project_{id}_best.pt` file downloads from browser |
| DB reset | `rm storage/rapid_cv.db && rm -rf storage/projects/` → fresh start on next launch |
