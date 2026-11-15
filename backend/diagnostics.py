"""Local readiness evidence. Never includes environment values, keys or circuit data."""
import os
import json
import shutil
import platform
import subprocess
import sys
import time
from typing import Literal
from pydantic import BaseModel
from . import db
from .contracts import WorkerStatus
from .config import DATA, ROOT, PINNED_ENGINE, APP_VERSION
from .engine import executable

class DiagnosticCheck(BaseModel):
    id: str
    title: str
    status: Literal['ready','warning','error']
    detail: str
    fix: str

class Diagnostics(BaseModel):
    generated_at: float
    app_version: str
    platform: str
    ready: bool
    data_directory: str
    checks: list[DiagnosticCheck]
    worker: WorkerStatus

def collect():
    checks=[DiagnosticCheck(id='api',title='Local API',status='ready',detail='The API answered this request.',fix=''),
            DiagnosticCheck(id='python',title='Python runtime',status='ready' if sys.version_info>=(3,11) else 'error',detail=platform.python_version(),fix='Install Python 3.11 or later and rerun Setup CircuitCheck.cmd.')]
    node=os.getenv('CIRCUITCHECK_NODE') or shutil.which('node')
    node_version='Not found';node_ready=False
    if node:
        try:
            probe=subprocess.run([node,'--version'],capture_output=True,text=True,timeout=5,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
            node_version=probe.stdout.strip()
            node_ready=probe.returncode==0 and int(node_version.lstrip('v').split('.')[0])>=24
        except (OSError,ValueError,subprocess.TimeoutExpired):pass
    expected=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['dependencies']
    installed=True
    for name in ('@tscircuit/checks','circuit-json','@tscircuit/solver-utils'):
        try:installed=installed and json.loads((ROOT/'node_modules'/name/'package.json').read_text(encoding='utf-8'))['version']==expected[name]
        except (OSError,KeyError,ValueError):installed=False
    ready=node_ready and installed
    checks.append(DiagnosticCheck(id='tscircuit',title='Supplemental checking runtime',status='ready' if ready else 'error',detail=node_version+(' · pinned checking packages present' if installed else ' · checking dependencies missing or mismatched'),fix='' if ready else 'Install Node.js 24, then run npm ci in the CircuitCheck folder. CIRCUITCHECK_NODE can select an explicit node executable.'))
    cli=executable()
    version='Not found'
    if cli:
        try:
            result=subprocess.run([cli,'version'],capture_output=True,text=True,timeout=5,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
            version=result.stdout.strip().splitlines()[-1] if result.returncode==0 and result.stdout.strip() else 'Version probe failed'
        except (OSError,subprocess.TimeoutExpired): version='Version probe failed'
    compatible=version.startswith('10.0.')
    checks.append(DiagnosticCheck(id='kicad',title='KiCad CLI',status='ready' if compatible else 'error',detail=f'{version}; tested adapter version {PINNED_ENGINE}',fix='' if compatible else 'Install KiCad 10.0.x, set KICAD_CLI to kicad-cli.exe, then restart CircuitCheck.'))
    worker=db.worker_status()
    checks.append(DiagnosticCheck(id='worker',title='Analysis worker',status='ready' if worker['available'] else 'error',detail=f"Live heartbeat; {worker['state']}." if worker['available'] else 'No worker heartbeat received within 30 seconds.',fix='' if worker['available'] else 'Run Start CircuitCheck.cmd. If the API is already running without a worker, stop and start CircuitCheck. Check the worker log in the configured data directory.'))
    writable=DATA.is_dir() and os.access(DATA,os.W_OK)
    checks.append(DiagnosticCheck(id='storage',title='Project storage',status='ready' if writable else 'error',detail='Configured data directory is writable.' if writable else 'Configured data directory is unavailable or read-only.',fix='' if writable else 'Choose a writable CIRCUITCHECK_DATA directory and restart both API and worker.'))
    return Diagnostics(generated_at=time.time(),app_version=APP_VERSION,platform=platform.system(),ready=all(c.status=='ready' for c in checks),data_directory=str(DATA),checks=checks,worker=worker)
