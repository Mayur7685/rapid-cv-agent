import json
from pathlib import Path
from PIL import Image as PILImage
from sqlalchemy.orm import Session
from app.models.db import Project, Image as DBImage, Label as DBLabel


def run_autolabel_agent(
    db: Session,
    project_id: int,
    model: str = "moondream",              # moondream is the default and only supported model
    storage_root: str = "storage",
    use_mock: bool = False,
    box_threshold: float = 0.35,           # minimum box area fraction to accept (filters tiny hallucinations)
    text_threshold: float = 0.25,          # unused, kept for API signature compat
    nms_iou_threshold: float = 0.45,       # passed downstream to QC agent
):
    """
    Runs zero-shot bounding-box labeling over all unlabeled images in the project
    using the local Moondream 2 VLM model (Apple Silicon MPS / CUDA / CPU).

    For each image, it calls model.detect(pil_image, class_name) once per user-defined
    class — exactly how the reference auto-labeler-moondream project works.

    Moondream returns normalized coordinates [x_min, y_min, x_max, y_max] ∈ [0, 1].

    Precision note:
      Moondream's detect() can hallucinate; we filter degenerate boxes whose
      area is smaller than (box_threshold * box_threshold) fraction of the image
      to reduce false positives.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise ValueError(f"Project with ID {project_id} not found")

    classes = project.classes
    if not classes:
        raise ValueError("No classes defined for this project")

    # ── Get all unlabeled images ────────────────────────────────────────────────
    unlabeled_images = db.query(DBImage).filter(
        DBImage.project_id == project_id,
        DBImage.status == "unlabeled"
    ).all()

    if not unlabeled_images:
        print("No unlabeled images found for this project.")
        return {"project_id": project_id, "labeled_count": 0, "class_counts": {}}

    # ── Output folders ──────────────────────────────────────────────────────────
    project_dir = Path(storage_root) / "projects" / str(project_id)
    labels_raw_dir = project_dir / "labels_raw"
    labels_raw_dir.mkdir(parents=True, exist_ok=True)

    # ── Load Moondream model ────────────────────────────────────────────────────
    if use_mock:
        vlm_model = None
        print("[MOCK] Skipping Moondream load — mock mode enabled.")
    else:
        from app.agents.vlm_helper import get_moondream_model
        vlm_model = get_moondream_model()

    labeled_count = 0
    class_counts = {c: 0 for c in classes}

    for db_img in unlabeled_images:
        full_img_path = Path(storage_root) / db_img.file_path
        if not full_img_path.exists():
            print(f"Image file not found: {full_img_path}, skipping.")
            continue

        try:
            with PILImage.open(full_img_path) as pil_img:
                img_width, img_height = pil_img.size
                # Convert to RGB to ensure Moondream compatibility (no RGBA / palette)
                if pil_img.mode != "RGB":
                    pil_img = pil_img.convert("RGB")
                pil_img_rgb = pil_img.copy()

            detections_list = []

            if use_mock:
                # ── Mock mode: one plausible centered box per class ─────────────
                import random
                for cid, cname in enumerate(classes):
                    if random.random() < 0.65:
                        w = round(random.uniform(0.15, 0.45), 3)
                        h = round(random.uniform(0.15, 0.45), 3)
                        cx = round(random.uniform(w / 2, 1.0 - w / 2), 3)
                        cy = round(random.uniform(h / 2, 1.0 - h / 2), 3)
                        detections_list.append({
                            "class_id":   cid,
                            "class_name": cname,
                            "bbox":       [cx, cy, w, h],   # [cx, cy, w, h] normalised YOLO format
                            "confidence": round(random.uniform(0.70, 0.95), 3),
                        })
                print(f"[MOCK] {len(detections_list)} detections → {full_img_path.name}")

            else:
                # ── Real Moondream inference ────────────────────────────────────
                # Pattern from reference project auto-labeler-moondream/server.py:
                #   res = model.detect(image, object_name)
                #   objects = res.get("objects", [])
                #   each object has x_min, y_min, x_max, y_max (normalised 0-1)
                print(f"Running Moondream detect on {full_img_path.name} "
                      f"for {len(classes)} class(es)...")

                for cid, cname in enumerate(classes):
                    try:
                        res = vlm_model.detect(pil_img_rgb, cname)
                        objects = res.get("objects", [])

                        for obj in objects:
                            x_min = float(obj.get("x_min", 0))
                            y_min = float(obj.get("y_min", 0))
                            x_max = float(obj.get("x_max", 0))
                            y_max = float(obj.get("y_max", 0))

                            # Convert to YOLO centre-format (normalised)
                            w_norm = x_max - x_min
                            h_norm = y_max - y_min
                            xc_norm = x_min + w_norm / 2
                            yc_norm = y_min + h_norm / 2

                            # Clamp to [0, 1]
                            xc_norm = max(0.0, min(1.0, xc_norm))
                            yc_norm = max(0.0, min(1.0, yc_norm))
                            w_norm  = max(0.0, min(1.0, w_norm))
                            h_norm  = max(0.0, min(1.0, h_norm))

                            # ── Precision filter ────────────────────────────────
                            # Reject boxes that are too small (likely hallucinations).
                            # box_threshold controls minimum box side length in normalised coords.
                            min_side = box_threshold * 0.5   # e.g. 0.35 → min side ≥ 0.175
                            if w_norm < min_side or h_norm < min_side:
                                continue

                            # Reject boxes that fill almost the entire image (false positives)
                            if w_norm > 0.97 and h_norm > 0.97:
                                continue

                            detections_list.append({
                                "class_id":   cid,
                                "class_name": cname,
                                # Moondream does not return a confidence score;
                                # we assign a fixed proposal confidence of 0.90
                                # (the same value the reference project uses).
                                "confidence": 0.90,
                                "bbox":       [xc_norm, yc_norm, w_norm, h_norm],
                            })
                            class_counts[cname] = class_counts.get(cname, 0) + 1

                    except Exception as class_err:
                        print(f"  Moondream error for class '{cname}' on "
                              f"{full_img_path.name}: {class_err}")

                print(f"  → {len(detections_list)} detection(s) on {full_img_path.name}")

            # ── Persist to DB ───────────────────────────────────────────────────
            for det in detections_list:
                db_label = DBLabel(
                    image_id   = db_img.id,
                    class_id   = det["class_id"],
                    class_name = det["class_name"],
                    confidence = det["confidence"],
                    source     = "auto",
                )
                db_label.bbox = det["bbox"]
                db.add(db_label)
                if not use_mock:
                    # class_counts already updated above during real inference
                    pass
                else:
                    class_counts[det["class_name"]] = class_counts.get(det["class_name"], 0) + 1

            # ── Write raw-label JSON backup ─────────────────────────────────────
            json_filename = Path(db_img.file_path).stem + ".json"
            json_path = labels_raw_dir / json_filename
            with open(json_path, "w") as f:
                json.dump({
                    "image_id":   db_img.id,
                    "image_path": db_img.file_path,
                    "width":      img_width,
                    "height":     img_height,
                    "detections": detections_list,
                    "settings": {
                        "model":             "moondream",
                        "box_threshold":     box_threshold,
                        "nms_iou_threshold": nms_iou_threshold,
                    },
                }, f, indent=2)

            db_img.status = "auto_labeled"
            labeled_count += 1

        except Exception as err:
            print(f"Error auto-labeling image {db_img.file_path}: {err}")
            import traceback; traceback.print_exc()

    project.status = "needs_review"
    db.commit()

    print(f"[autolabel_agent] Done — {labeled_count}/{len(unlabeled_images)} images labeled. "
          f"Class counts: {class_counts}")
    return {
        "project_id":    project_id,
        "labeled_count": labeled_count,
        "class_counts":  class_counts,
    }
