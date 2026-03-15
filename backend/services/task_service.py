import uuid
import time
import logging
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field


logger = logging.getLogger(__name__)

class TaskStatus(BaseModel):
    task_id: str
    status: str  # pending, running, completed, failed
    progress: float = 0.0
    message: str = ""
    result_path: Optional[str] = None
    created_at: float = Field(default_factory=time.time)
    updated_at: float = Field(default_factory=time.time)

class TaskManager:
    _instance = None
    _tasks: Dict[str, TaskStatus] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(TaskManager, cls).__new__(cls)
        return cls._instance

    def create_task(self, name: str = "") -> str:
        task_id = str(uuid.uuid4())
        task = TaskStatus(
            task_id=task_id,
            status="pending",
            message=f"Starting {name}..."
        )
        self._tasks[task_id] = task
        return task_id

    def update_task(self, task_id: str, status: str = None, progress: float = None, message: str = None, result_path: str = None):
        if task_id in self._tasks:
            task = self._tasks[task_id]
            if status: task.status = status
            if progress is not None: task.progress = progress
            if message: task.message = message
            if result_path: task.result_path = result_path
            task.updated_at = time.time()
            logger.info(f"Task {task_id} updated: {task.status} - {task.message}")

    def get_task(self, task_id: str) -> Optional[TaskStatus]:
        return self._tasks.get(task_id)

    def clean_old_tasks(self, max_age_seconds: int = 3600):
        """Clean up tasks older than max_age_seconds."""
        now = time.time()
        to_delete = [tid for tid, task in self._tasks.items() if now - task.updated_at > max_age_seconds]
        for tid in to_delete:
            del self._tasks[tid]

task_manager = TaskManager()
