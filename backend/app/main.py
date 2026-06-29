import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.models.db import init_db
from app.api.routes import projects, images, labels, jobs, training, vlm

# Initialize FastAPI application
app = FastAPI(
    title="Rapid CV Pipeline — API",
    description="Agentic Auto-Labeling and Active-Learning Training Backend API",
    version="1.0.0"
)

# Configure CORS for local development (React frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all origins for local deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure storage directory exists
storage_dir = os.path.abspath("storage")
os.makedirs(storage_dir, exist_ok=True)

# Mount storage directory for static file access (serving raw images and weights)
app.mount("/static", StaticFiles(directory=storage_dir), name="static")

# Database initialization on startup
@app.on_event("startup")
def startup_db_init():
    print("Initializing database...")
    init_db()
    print("Database ready.")

# Register routes
app.include_router(projects.router, prefix="/api")
app.include_router(images.router, prefix="/api")
app.include_router(labels.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(training.router, prefix="/api")
app.include_router(vlm.router, prefix="/api")

@app.get("/")
def read_root():
    return {
        "status": "online",
        "api_docs": "/docs",
        "project": "Rapid CV Pipeline Backend"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
