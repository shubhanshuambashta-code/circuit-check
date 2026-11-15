"""Storage boundary. Only validated project/revision UUIDs reach this implementation."""
from pathlib import Path
from typing import Protocol
from uuid import UUID
import hashlib
import shutil
from .config import DATA

class Storage(Protocol):
    def project(self, project_id: str) -> Path: ...
    def revision(self, project_id: str, revision_id: str) -> Path: ...
    def delete(self, project_id: str) -> None: ...

class LocalStorage:
    def __init__(self, root: Path = DATA):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def project(self, project_id):
        UUID(project_id)
        return self.root / 'projects' / project_id

    def revision(self, project_id, revision_id):
        UUID(revision_id)
        return self.project(project_id) / 'revisions' / revision_id

    def artifacts(self, project_id, revision_id, result=None):
        if result is None:
            from . import db
            revision=db.row('revisions',revision_id)
            result=db.decode(revision['result']) if revision else None
        root=self.revision(project_id,revision_id)/'artifacts'
        prefix=(result or {}).get('artifact_root')
        if prefix:
            pieces=prefix.split('/')
            if len(pieces)!=2 or pieces[0]!='runs':raise ValueError('Invalid analysis artifact identity')
            UUID(pieces[1])
            root=self.root/'analyses'/pieces[1]
        return root

    def delete(self, project_id, job_ids=()):
        path = self.project(project_id).resolve()
        if self.root not in path.parents:
            raise ValueError('Invalid project path')
        shutil.rmtree(path, ignore_errors=True)
        for job_id in job_ids:
            UUID(job_id)
            attempt=(self.root/'analyses'/job_id).resolve()
            if self.root not in attempt.parents:raise ValueError('Invalid analysis path')
            shutil.rmtree(attempt,ignore_errors=True)

def fingerprint(directory: Path):
    h = hashlib.sha256()
    for p in sorted(directory.rglob('*')):
        if p.is_file():
            h.update(p.relative_to(directory).as_posix().encode())
            h.update(b'\0')
            h.update(p.read_bytes())
    return h.hexdigest()

