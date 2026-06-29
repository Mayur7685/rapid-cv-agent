import traceback
from app.models.db import init_db, Job, Project, TrainingRun, EvalReport
from app.agents.autolabel_agent import run_autolabel_agent
from app.agents.qc_agent import run_qc_agent
from app.agents.augment_agent import run_augment_agent
from app.agents.train_agent import run_train_agent
from app.agents.eval_agent import run_eval_agent
from app.agents.export_agent import run_export_agent

def get_db_session():
    _, SessionLocal = init_db()
    return SessionLocal()


def background_autolabel_task(
    job_id: str,
    project_id: int,
    model: str = "grounding_dino",
    use_mock: bool = False,
    box_threshold: float = 0.35,     # forwarded from API request
    nms_iou_threshold: float = 0.45, # forwarded from API request
):
    db = get_db_session()
    try:
        # Update job status to running
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return
        job.status = "running"
        job.progress = 10
        db.commit()

        # Step 1: Run Auto-Labeling with Grounding DINO
        print(f"[Job {job_id}] Running Grounding DINO autolabel "
              f"(box_threshold={box_threshold}, nms_iou={nms_iou_threshold})...")
        run_autolabel_agent(
            db=db,
            project_id=project_id,
            model=model,
            use_mock=use_mock,
            box_threshold=box_threshold,
            text_threshold=0.25,           # fixed sensible default
            nms_iou_threshold=nms_iou_threshold,
        )

        job.progress = 60
        db.commit()

        # Step 2: QC / NMS pass
        # Moondream assigns a fixed proposal confidence of 0.90 to every detection.
        # We set QC conf_threshold to 0.85 so those boxes pass as auto_approved
        # (below 0.85 will be flagged as needs_review for human inspection).
        print(f"[Job {job_id}] Running QC agent (conf_threshold=0.85, nms_iou={nms_iou_threshold})...")
        run_qc_agent(
            db=db,
            project_id=project_id,
            conf_threshold=0.85,                 # ← aligns with Moondream's 0.90 output
            nms_iou_threshold=nms_iou_threshold,
            auto_approve_all=False,              # UI is the human-in-the-loop step
        )

        job.status = "completed"
        job.progress = 100
        db.commit()
        print(f"[Job {job_id}] Autolabel task completed successfully.")

    except Exception as e:
        print(f"[Job {job_id}] Autolabel task failed: {e}")
        traceback.print_exc()
        db_fail = get_db_session()
        try:
            job_fail = db_fail.query(Job).filter(Job.id == job_id).first()
            if job_fail:
                job_fail.status = "failed"
                job_fail.error_message = str(e)
                db_fail.commit()
            project = db_fail.query(Project).filter(Project.id == project_id).first()
            if project:
                project.status = "failed"
                db_fail.commit()
        finally:
            db_fail.close()
    finally:
        db.close()


def background_train_task(
    job_id: str,
    project_id: int,
    model_size: str,
    epochs: int,
    threshold: float,
    use_mock: bool = False
):
    _, SessionLocal = init_db()
    db = SessionLocal()
    try:
        # Update job status to running
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return
        job.status = "running"
        job.progress = 10
        db.commit()

        # Step 1: Augment split
        print(f"[Job {job_id}] Running augment agent...")
        run_augment_agent(
            db=db,
            project_id=project_id,
            train_ratio=0.8,
            apply_offline_aug=True
        )

        job.progress = 20
        db.commit()

        # Step 2: Training wrapper callback to update Job progress smoothly
        def session_factory():
            return SessionLocal()

        print(f"[Job {job_id}] Running training agent...")
        train_result = run_train_agent(
            db_session_factory=session_factory,
            project_id=project_id,
            model_size=model_size,
            epochs=epochs,
            use_mock=use_mock
        )

        run_id = train_result["run_id"]
        job.progress = 80
        db.commit()

        # Step 3: Run evaluation
        print(f"[Job {job_id}] Running evaluation agent...")
        eval_result = run_eval_agent(
            db=db,
            training_run_id=run_id,
            map50_threshold=threshold,
            use_mock=use_mock
        )

        job.progress = 90
        db.commit()

        # Step 4: Export if passed
        if eval_result["decision"] == "export":
            print(f"[Job {job_id}] Exporting model...")
            run_export_agent(
                db=db,
                eval_report_id=eval_result["report_id"],
                use_mock=use_mock
            )

        job.status = "completed"
        job.progress = 100
        db.commit()
        print(f"[Job {job_id}] Training task completed successfully.")

    except Exception as e:
        print(f"[Job {job_id}] Training task failed: {e}")
        traceback.print_exc()
        db_fail = SessionLocal()
        try:
            job_fail = db_fail.query(Job).filter(Job.id == job_id).first()
            if job_fail:
                job_fail.status = "failed"
                job_fail.error_message = str(e)
                db_fail.commit()
            project = db_fail.query(Project).filter(Project.id == project_id).first()
            if project:
                project.status = "failed"
                db_fail.commit()
        finally:
            db_fail.close()
    finally:
        db.close()
