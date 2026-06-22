# Testing & Verification Guide — Rapid CV Pipeline

This guide outlines step-by-step workflows, CLI commands, and checklists for validating the Rapid CV Pipeline console from scratch.

---

## 🏗️ Pre-Test Environment Setup

### 1. Configure OpenRouter API Key
Before starting, choose whether to test with LLM-powered class extraction or local regex fallback:
- **Option A (With LLM)**: Insert your OpenRouter API key into the backend configuration:
  ```bash
  cd backend
  echo "OPENROUTER_API_KEY=sk-or-v1-your-key-here" > .env
  ```
- **Option B (Without LLM Fallback)**: Leave the `.env` file empty or do not create it. The backend will automatically fall back to regex-based noun extraction.

### 2. Launch Backend API Server
1. Navigate to the backend directory, activate the environment, and start the server:
   ```bash
   cd backend
   source .venv/bin/activate
   # Recommended (launches with live reload on port 8000)
   uvicorn app.main:app --reload
   
   # Or run via Python module execution
   python -m app.main
   ```
   *The server will boot on `http://127.0.0.1:8000`.*

### 3. Launch Frontend Web Console
1. Open a new terminal window, navigate to the frontend directory, and launch the Vite dev server:
   ```bash
   cd frontend
   npm run dev
   ```
   *The React application will boot on `http://localhost:5173/`.*

### 4. Seed Verification Datasets
To verify the autolabel and training agents, seed target image directories:
1. Generate synthetic shape images (produces yellow/orange triangles/squares):
   ```bash
   cd backend
   source .venv/bin/activate
   python generate_samples.py
   ```
   *Places 10 synthetic files under `backend/samples/`.*
2. Download real photography images (downloads cups and bottles from Unsplash):
   ```bash
   python download_real_images.py
   ```
   *Places real images under `backend/real_samples/`.*

---

## 🧪 Automated Integration Script

We have an integration test script that validates the backend database, Grounding DINO autolabeling, programmatic corrections, YOLO training, validation, and evaluations.

1. Ensure the backend FastAPI server is running in a terminal.
2. In another terminal, run:
   ```bash
   cd backend
   source .venv/bin/activate
   python verify_api.py
   ```
3. Check the CLI output. It must report `INTEGRATION VERIFICATION SUCCESSFUL!` and display class training convergence metrics.

---

## 💻 Manual Web Console Walkthrough

Open your browser to `http://localhost:5173/` and perform the following testing sequence:

### Step 1: Onboarding NLP Extraction
1. On the landing page, enter a natural description of the objects you want to detect:
   - *Example with LLM*: `"I want to detect yellow fresh bananas, red apples, and green avocados"`
   - *Example without LLM*: `"detect cups and bottles"`
2. Verify that the console extracts singular, lowercase chips: `["banana", "apple", "avocado"]` or `["cup", "bottle"]`.
3. Give your project a name and click **Create Project**.

### Step 2: Upload Stage & Webcam Capture
1. In the **Upload** stage, try both staging methods:
   - **File Upload**: Drag and drop 5-10 images from `backend/real_samples/` (or `backend/samples/`).
   - **Webcam Ingestion**: Click **Use Webcam**, accept camera permissions, click **Capture Snapshot**, preview the photo, and click **Add to Staging Yard**.
2. Verify the staging yard list populates on the left.
3. Click **Upload & Parse Dataset** and wait for ingestion to complete.

### Step 3: Zero-Shot Autolabeling
1. In the **Auto-Label** stage, review the prompt classes.
2. Click **Trigger Auto-Labeling** to launch Grounding DINO.
3. Watch the real-time progress indicators. Once completed, verify the console auto-advances to the Review stage.

### Step 4: Annotation Canvas Review
1. Ensure the workstation canvas loads: thumbnail strip on the left, interactive editor center, class categories on the right.
2. Click a thumbnail to view its auto-labeled bounding boxes.
3. Test annotation canvas controls:
   - Press **W** to enter Draw Box mode. Click and drag to create new boxes.
   - Press **V** to enter Select mode. Click a box to select it.
   - Drag box corners to resize or drag the center to move.
   - Press numbers **1-9** to assign selected boxes to a class.
   - Press **Backspace** to delete the selected box.
4. Click **Approve Image** for each file. Approved files get a green checkmark badge. Approve all images to advance to Augmentation.

### Step 5: Offline Augmentations
1. Choose dataset split percentages (e.g., 80% train, 20% val).
2. Enable target offline augmentations: **Contrast**, **Rotation**, **Crop**, and **Mosaic**.
3. Click **Apply Augmentation & Split**.
4. (Optional) Check the backend directory `backend/storage/projects/{id}/dataset/` to verify augmented files with matching suffixes (`_contrast`, `_rot`, `_crop`, `_mosaic`) have been generated.

### Step 6: Telemetry Model Training
1. In the **Train** stage, configure the parameters: Model Size (`yolov8n`), Epochs (`5`), Confidence Threshold (`0.25`).
2. Click **Start Model Training**.
3. Monitor the live telemetry: loss/mAP charts will plot training convergence points at the end of each epoch.
4. On completion, verify that the per-class evaluation status table prints precision, recall, and pass/fail metrics.

### Step 7: Testing Sandbox & Weight Download
1. Navigate to the **Deploy** stage.
2. Verify the testing sandbox functions: drag and drop a test image, adjust the sliders, and check that predicted bounding box coordinates are mapped back onto the image.
3. Click **Download Model (.pt)**. Verify that the backend serves `best.pt` file downloads.
