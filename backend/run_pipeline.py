import os
import sys
import argparse
from pathlib import Path

# Add backend directory to path
sys.path.append(str(Path(__file__).parent.resolve()))

from app.models.db import init_db
from app.agents.input_agent import run_input_agent
from app.agents.autolabel_agent import run_autolabel_agent
from app.agents.qc_agent import run_qc_agent
from app.agents.augment_agent import run_augment_agent
from app.agents.train_agent import run_train_agent
from app.agents.eval_agent import run_eval_agent
from app.agents.export_agent import run_export_agent

def main():
    parser = argparse.ArgumentParser(description="Rapid CV Pipeline CLI Orchestrator")
    parser.add_argument("--project", type=str, required=True, help="Name of the project")
    parser.add_argument("--classes", type=str, required=True, help="Comma-separated class names (e.g. helmet,vest)")
    parser.add_argument("--images", type=str, required=True, help="Directory or ZIP file containing raw images")
    parser.add_argument("--epochs", type=int, default=5, help="Number of training epochs")
    parser.add_argument("--model", type=str, default="yolov8n", help="YOLO model size (yolov8n, yolov8s)")
    parser.add_argument("--threshold", type=float, default=0.50, help="mAP50 threshold for a passing class")
    parser.add_argument("--mock", action="store_true", help="Run in mock mode (fast, simulated agents)")
    parser.add_argument("--no-aug", action="store_true", help="Disable offline augmentation")
    
    args = parser.parse_args()
    
    classes_list = [c.strip() for c in args.classes.split(",") if c.strip()]
    if not classes_list:
        print("Error: Please provide at least one class name.")
        sys.exit(1)

    print("==================================================")
    print("      RAPID CV PIPELINE CLI ORCHESTRATOR")
    print("==================================================")
    print(f"Project Name:   {args.project}")
    print(f"Classes:        {classes_list}")
    print(f"Image Source:   {args.images}")
    print(f"Epochs:         {args.epochs}")
    print(f"Model Size:     {args.model}")
    print(f"Threshold mAP:  {args.threshold}")
    print(f"Mock Mode:      {args.mock}")
    print("==================================================\n")

    # Ensure storage folders exist
    os.makedirs("storage", exist_ok=True)
    
    # 0. Initialize Database
    print("[Phase 0] Initializing database...")
    _, SessionLocal = init_db("sqlite:///storage/rapid_cv.db")
    db = SessionLocal()
    print("Database initialized successfully.\n")

    try:
        # 1. Input Agent
        print("[Phase 1] Running Input Agent...")
        input_result = run_input_agent(
            db=db,
            project_name=args.project,
            classes=classes_list,
            images_source=args.images,
            storage_root="storage"
        )
        project_id = input_result["project_id"]
        print(f"-> Ingested {input_result['images_ingested']} images (removed {input_result['images_deduplicated']} duplicates).\n")

        # 2. Auto-Labeling Agent
        print("[Phase 2] Running Auto-Labeling Agent...")
        label_result = run_autolabel_agent(
            db=db,
            project_id=project_id,
            storage_root="storage",
            use_mock=args.mock
        )
        print(f"-> Auto-labeled {label_result['labeled_count']} images. Labels count: {label_result['class_counts']}\n")

        # 3. QC / Review Agent
        print("[Phase 3] Running QC Agent (Simulated Review)...")
        qc_result = run_qc_agent(
            db=db,
            project_id=project_id,
            storage_root="storage",
            conf_threshold=0.80,
            nms_iou_threshold=0.45,
            auto_approve_all=True # CLI mode auto-approves all detections to proceed to training
        )
        print(f"-> QC Complete: Total={qc_result['total_images']}, Approved={qc_result['auto_approved']}, Needs Review={qc_result['needs_review']}, No Detections={qc_result['no_detections']}\n")

        # 4. Augmentation Agent
        print("[Phase 4] Running Augmentation Agent...")
        aug_result = run_augment_agent(
            db=db,
            project_id=project_id,
            storage_root="storage",
            train_ratio=0.8,
            apply_offline_aug=not args.no_aug
        )
        print(f"-> Dataset split generated: Train={aug_result['train_count']} images, Val={aug_result['val_count']} images.\n")

        # 5. Training Agent
        print("[Phase 5] Running Training Agent...")
        train_result = run_train_agent(
            db_session_factory=SessionLocal,
            project_id=project_id,
            model_size=args.model,
            epochs=args.epochs,
            storage_root="storage",
            use_mock=args.mock
        )
        print(f"-> Training complete. Model weights saved to: {train_result['weights_path']}\n")

        # 6. Evaluation Agent
        print("[Phase 6] Running Evaluation Agent...")
        eval_result = run_eval_agent(
            db=db,
            training_run_id=train_result["run_id"],
            map50_threshold=args.threshold,
            storage_root="storage",
            use_mock=args.mock
        )
        print(f"-> Evaluation Decision: {eval_result['decision'].upper()}")
        print("Per-class performance:")
        for cls, metrics in eval_result["per_class_metrics"].items():
            print(f"   - {cls}: mAP50={metrics['map50']:.4f}, precision={metrics['precision']:.4f}, recall={metrics['recall']:.4f} ({metrics['status'].upper()})")
        print()

        # 7. Decision Logic & Export Agent
        if eval_result["decision"] == "export":
            print("[Phase 7] Exporting model artifacts...")
            export_result = run_export_agent(
                db=db,
                eval_report_id=eval_result["report_id"],
                storage_root="storage",
                use_mock=args.mock
            )
            print("==================================================")
            print("      PIPELINE COMPLETED SUCCESSFULLY!")
            print("==================================================")
            print(f"Model File (PyTorch): {export_result['best_pt']}")
            print(f"Model File (ONNX):    {export_result['best_onnx']}")
            print(f"Inference Server:     {export_result['inference_server']}")
            print(f"Model Card:           {export_result['model_card']}")
            print("==================================================")
        else:
            print("==================================================")
            print("      PIPELINE FAILED TO MEET METRIC THRESHOLD")
            print("==================================================")
            print(f"Weak Classes identified: {eval_result['weak_classes']}")
            print("Active Learning Feedback Loop Triggered.")
            print("Please upload more images for weak classes and re-run.")
            print("==================================================")

    except Exception as e:
        print(f"\nPipeline execution failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(2)
    finally:
        db.close()

if __name__ == "__main__":
    main()
