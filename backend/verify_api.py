import os
import time
import requests

BASE_URL = "http://127.0.0.1:8000/api"

def wait_for_job(job_id, poll_interval=1.0, timeout=60.0):
    start_time = time.time()
    while time.time() - start_time < timeout:
        res = requests.get(f"{BASE_URL}/jobs/{job_id}")
        assert res.status_code == 200, f"Failed to get job {job_id}"
        job = res.json()
        print(f"   Job {job_id} [{job['type']}]: status={job['status']}, progress={job['progress']}%")
        
        if job["status"] == "completed":
            return job
        elif job["status"] == "failed":
            raise RuntimeError(f"Job failed: {job['error_message']}")
            
        time.sleep(poll_interval)
    raise TimeoutError(f"Job {job_id} timed out after {timeout}s")

def run_verification():
    print("==================================================")
    print("      API INTEGRATION VERIFICATION SCRIPT")
    print("==================================================")

    # 1. Ping test
    res = requests.get("http://127.0.0.1:8000/")
    assert res.status_code == 200, "API Server is not running"
    print("✓ API Ping successful.")

    # 2. Create Project
    project_payload = {
        "name": "api_test_project",
        "classes": ["cup", "bottle"]
    }
    res = requests.post(f"{BASE_URL}/projects/", json=project_payload)
    assert res.status_code == 200, "Failed to create project"
    project = res.json()
    project_id = project["id"]
    print(f"✓ Created project '{project['name']}' with ID {project_id}.")

    # 3. Upload Images
    # We will upload the real_samples downloaded in Phase 1
    samples_dir = "real_samples"
    if not os.path.exists(samples_dir):
        print(f"Error: {samples_dir} folder not found. Run download_real_images.py first.")
        return
        
    image_files = [f for f in os.listdir(samples_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    if not image_files:
        print("Error: No images found in real_samples folder.")
        return

    files_payload = []
    opened_files = []
    for fname in image_files[:4]:  # upload 4 images
        fpath = os.path.join(samples_dir, fname)
        f = open(fpath, "rb")
        files_payload.append(("files", (fname, f, "image/jpeg")))
        opened_files.append(f)

    try:
        print(f"Uploading {len(files_payload)} images to project {project_id}...")
        res = requests.post(f"{BASE_URL}/projects/{project_id}/images/upload", files=files_payload)
        assert res.status_code == 200, "Failed to upload images"
        upload_res = res.json()
        print(f"✓ Uploaded successfully. Ingested={upload_res['images_ingested']}, Deduped={upload_res['images_deduplicated']}")
    finally:
        for f in opened_files:
            f.close()

    # 4. Trigger Auto-Labeling
    print("Triggering auto-labeling (MOCK mode)...")
    res = requests.post(f"{BASE_URL}/projects/{project_id}/autolabel", json={"use_mock": True})
    assert res.status_code == 200, "Failed to trigger autolabel"
    autolabel_job = res.json()
    job_id = autolabel_job["job_id"]
    print(f"✓ Autolabel job queued: {job_id}")

    # Poll autolabel job
    wait_for_job(job_id)
    print("✓ Auto-labeling job completed successfully.")

    # 5. Get Labels and Submit Human Review
    res = requests.get(f"{BASE_URL}/projects/{project_id}/labels")
    assert res.status_code == 200, "Failed to get labels"
    labels_data = res.json()
    
    # We pick the first image and review its boxes
    first_image_id = list(labels_data.keys())[0]
    print(f"Reviewing labels for image {first_image_id}...")
    
    # Simulate a human correcting/approving the boxes:
    # We submit a cup box at center of image
    review_payload = {
        "labels": [
            {
                "class_id": 0,
                "class_name": "cup",
                "bbox": [0.5, 0.5, 0.2, 0.3],
                "confidence": 1.0
            }
        ]
    }
    
    res = requests.post(f"{BASE_URL}/images/{first_image_id}/review", json=review_payload)
    assert res.status_code == 200, "Failed to submit label review"
    print("✓ Submitted label review.")

    # In CLI verification, to avoid having to manually review all 4 images,
    # let's review the remaining ones programmatically as well so that all images
    # are in "reviewed" status, which is required by the Augmentation Agent!
    for img_id in list(labels_data.keys())[1:]:
        requests.post(f"{BASE_URL}/images/{img_id}/review", json={"labels": [
            {"class_id": 1, "class_name": "bottle", "bbox": [0.3, 0.4, 0.1, 0.2], "confidence": 1.0}
        ]})
    print("✓ All project images reviewed programmatically.")

    # 6. Trigger Training
    print("Triggering model training (MOCK mode, 2 epochs)...")
    train_payload = {
        "model_size": "yolov8n",
        "epochs": 2,
        "threshold": 0.20,
        "use_mock": True
    }
    res = requests.post(f"{BASE_URL}/projects/{project_id}/train", json=train_payload)
    assert res.status_code == 200, "Failed to trigger training"
    train_job = res.json()
    train_job_id = train_job["job_id"]
    print(f"✓ Training job queued: {train_job_id}")

    # Poll training job
    wait_for_job(train_job_id)
    print("✓ Training and evaluation job completed successfully.")

    # 7. Check final training runs
    res = requests.get(f"{BASE_URL}/projects/{project_id}/runs")
    assert res.status_code == 200, "Failed to get training runs"
    runs = res.json()
    print("==================================================")
    print("      INTEGRATION VERIFICATION SUCCESSFUL!")
    print("==================================================")
    print(f"Latest run status: {runs[0]['status']}")
    print(f"Epochs completed:  {runs[0]['epoch']}")
    print(f"Validation mAP50:  {runs[0]['map50']:.4f}")
    if runs[0]['eval_reports']:
        print(f"Decision:          {runs[0]['eval_reports'][0]['decision'].upper()}")
    print("==================================================")

if __name__ == "__main__":
    run_verification()
