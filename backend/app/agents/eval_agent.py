import json
from pathlib import Path
from sqlalchemy.orm import Session
from app.models.db import Project, TrainingRun, EvalReport

def run_eval_agent(
    db: Session,
    training_run_id: int,
    map50_threshold: float = 0.50,
    storage_root: str = "storage",
    use_mock: bool = False
):
    """
    Evaluates the trained model against the validation dataset.
    Computes per-class metrics and decides if model is ready for export or needs more data.
    """
    run = db.query(TrainingRun).filter(TrainingRun.id == training_run_id).first()
    if not run:
        raise ValueError(f"Training run with ID {training_run_id} not found")

    project_id = run.project_id
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise ValueError(f"Project with ID {project_id} not found")

    classes = project.classes

    # Define paths
    project_dir = Path(storage_root) / "projects" / str(project_id)
    weights_path = Path(storage_root) / run.weights_path if run.weights_path else None
    data_yaml_path = project_dir / "dataset" / "data.yaml"

    per_class_metrics = {}
    weak_classes = []
    
    print(f"Running real YOLO validation for run #{training_run_id}...")
    from ultralytics import YOLO
    
    if not weights_path or not weights_path.exists():
        raise FileNotFoundError(f"Weights file not found at {weights_path}")
        
    model = YOLO(str(weights_path))
    
    # Run validation
    results = model.val(data=str(data_yaml_path.resolve()), plots=False)
    
    # Parse metrics per class
    # results.box.maps is a list/array of mAP50-95 per class
    # results.box.ap50 is a list/array of mAP50 per class
    # results.box.p is precision, results.box.r is recall
    for i, cname in enumerate(classes):
        try:
            # In some versions of ultralytics, results.box.ap50 is a numpy array
            ap50 = float(results.box.ap50[i])
            precision = float(results.box.p[i])
            recall = float(results.box.r[i])
        except Exception as e:
            print(f"Could not parse class metrics for index {i} ({cname}): {e}. Using overall metrics.")
            ap50 = float(results.results_dict.get("metrics/mAP50(B)", 0.0))
            precision = float(results.results_dict.get("metrics/precision(B)", 0.0))
            recall = float(results.results_dict.get("metrics/recall(B)", 0.0))

        per_class_metrics[cname] = {
            "map50": round(ap50, 4),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "status": "pass" if ap50 >= map50_threshold else "fail"
        }
        if ap50 < map50_threshold:
            weak_classes.append(cname)

    # Determine decision
    if not weak_classes:
        decision = "export"
        project.status = "ready"
    else:
        decision = "request_more_data"
        project.status = "needs_data"

    db.commit()

    # Save EvalReport
    report = EvalReport(
        training_run_id=training_run_id,
        decision=decision
    )
    report.per_class_metrics = per_class_metrics # serialized by setter
    db.add(report)
    db.commit()
    db.refresh(report)

    # Write evaluation report to a JSON file
    report_json_path = project_dir / "eval_report.json"
    with open(report_json_path, 'w') as f:
        json.dump({
            "project_id": project_id,
            "training_run_id": training_run_id,
            "decision": decision,
            "weak_classes": weak_classes,
            "per_class_metrics": per_class_metrics
        }, f, indent=2)

    return {
        "report_id": report.id,
        "decision": decision,
        "weak_classes": weak_classes,
        "per_class_metrics": per_class_metrics
    }
