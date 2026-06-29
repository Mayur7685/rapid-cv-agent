import datetime
import json
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

Base = declarative_base()

class Project(Base):
    __tablename__ = 'projects'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    # Stored as a JSON string of class names: e.g. ["helmet", "vest"]
    classes_json = Column(Text, nullable=False, default="[]")
    status = Column(String, nullable=False, default="created")  # created, labeling, needs_review, training, ready, needs_data
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    images = relationship("Image", back_populates="project", cascade="all, delete-orphan")
    training_runs = relationship("TrainingRun", back_populates="project", cascade="all, delete-orphan")

    @property
    def classes(self):
        try:
            return json.loads(self.classes_json)
        except Exception:
            return []

    @classes.setter
    def classes(self, val):
        self.classes_json = json.dumps(val)


class Image(Base):
    __tablename__ = 'images'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey('projects.id'), nullable=False)
    file_path = Column(String, nullable=False)
    status = Column(String, nullable=False, default="unlabeled")  # unlabeled, auto_labeled, reviewed
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    project = relationship("Project", back_populates="images")
    labels = relationship("Label", back_populates="image", cascade="all, delete-orphan")


class Label(Base):
    __tablename__ = 'labels'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    image_id = Column(Integer, ForeignKey('images.id'), nullable=False)
    class_id = Column(Integer, nullable=False)  # index in project's classes array
    class_name = Column(String, nullable=False)
    # Bbox stored as JSON string: [x_center, y_center, width, height] normalized
    bbox_json = Column(Text, nullable=False)
    confidence = Column(Float, nullable=True)  # confidence from auto-labeling, NULL if human
    source = Column(String, nullable=False, default="auto")  # auto, human
    segmentation_path = Column(Text, nullable=True)  # Moondream SVG segmentation path
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    image = relationship("Image", back_populates="labels")

    @property
    def bbox(self):
        try:
            return json.loads(self.bbox_json)
        except Exception:
            return []

    @bbox.setter
    def bbox(self, val):
        self.bbox_json = json.dumps(val)


class TrainingRun(Base):
    __tablename__ = 'training_runs'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey('projects.id'), nullable=False)
    status = Column(String, nullable=False, default="queued")  # queued, training, completed, failed
    epoch = Column(Integer, default=0)
    loss = Column(Float, nullable=True)
    map50 = Column(Float, nullable=True)
    weights_path = Column(String, nullable=True)
    started_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    project = relationship("Project", back_populates="training_runs")
    eval_reports = relationship("EvalReport", back_populates="training_run", cascade="all, delete-orphan")


class EvalReport(Base):
    __tablename__ = 'eval_reports'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    training_run_id = Column(Integer, ForeignKey('training_runs.id'), nullable=False)
    # Stored as a JSON string of class metrics: e.g. {"helmet": {"map50": 0.82, "precision": 0.8}, ...}
    per_class_metrics_json = Column(Text, nullable=False, default="{}")
    decision = Column(String, nullable=False)  # export, request_more_data
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    training_run = relationship("TrainingRun", back_populates="eval_reports")

    @property
    def per_class_metrics(self):
        try:
            return json.loads(self.per_class_metrics_json)
        except Exception:
            return {}

    @per_class_metrics.setter
    def per_class_metrics(self, val):
        self.per_class_metrics_json = json.dumps(val)


class Job(Base):
    __tablename__ = 'jobs'
    
    id = Column(String, primary_key=True)  # UUID string
    type = Column(String, nullable=False)  # autolabel, training
    status = Column(String, nullable=False, default="queued")  # queued, running, completed, failed
    progress = Column(Integer, default=0)  # 0 to 100
    project_id = Column(Integer, ForeignKey('projects.id'), nullable=False)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


# Helper function to get DB engine and session
def init_db(db_path="sqlite:///storage/rapid_cv.db"):
    import sqlite3
    engine = create_engine(db_path, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    
    # Safely migrate and add segmentation_path if missing (SQLite)
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            # Check if column exists
            result = conn.execute(text("PRAGMA table_info(labels)"))
            columns = [row[1] for row in result.fetchall()]
            if "segmentation_path" not in columns:
                conn.execute(text("ALTER TABLE labels ADD COLUMN segmentation_path TEXT"))
                conn.commit()
                print("✔ Database Migration: Added segmentation_path column to labels table.")
    except Exception as e:
        print(f"Database migration notice: {e}")
        
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return engine, SessionLocal

