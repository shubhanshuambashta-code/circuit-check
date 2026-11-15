"""Typed API boundaries shared with the generated TypeScript client contracts."""
from typing import Literal
from pydantic import BaseModel

class WorkerStatus(BaseModel):
    available: bool
    state: str
    heartbeat_age_seconds: float | None = None
    current_job: str | None = None

class Health(BaseModel):
    status: Literal['ok']
    engine_available: bool
    worker_available: bool
    worker: WorkerStatus
    ai_available: bool
    tested_engine: str
    deployment: str

class Job(BaseModel):
    id: str
    project_id: str
    revision_id: str
    status: Literal['queued','running','cancelling','cancelled','completed','partial','failed']
    stage: str
    error: str | None = None
    created: float
    updated: float

class ProviderStatus(BaseModel):
    configured: bool
    provider: str
    model: str
    mode: str
    credential_storage: str | None = None

class QueuedJob(BaseModel):
    job_id: str
    previous_job_id: str | None = None

class RestoredProject(BaseModel):
    project_id: str
    revision_id: str
    job_id: str | None = None

class CleanupPlan(BaseModel):
    files: int
    bytes: int

class CleanupResult(BaseModel):
    removed_files: int
    freed_bytes: int
    message: str
