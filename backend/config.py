import os
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_VERSION = json.loads((ROOT/'package.json').read_text(encoding='utf-8-sig'))['version']
# Minimal .env reader: no interpolation, no command evaluation, environment wins.
if (ROOT/'.env').is_file():
    for line in (ROOT/'.env').read_text(encoding='utf-8-sig').splitlines():
        if line.strip() and not line.lstrip().startswith('#') and '=' in line:
            key,value=line.split('=',1)
            if key.strip() in {'KICAD_CLI','CIRCUITCHECK_DATA','ENGINE_TIMEOUT','AI_API_KEY','AI_BASE_URL','AI_MODEL','GROQ_API_KEY','GROQ_MODEL','CIRCUITCHECK_NODE'}:
                os.environ.setdefault(key.strip(),value.strip().strip('"').strip("'"))
runtime_file=ROOT/'data'/'runtime.json'
if runtime_file.is_file() and runtime_file.stat().st_size<=8192:
    runtime=json.loads(runtime_file.read_text(encoding='utf-8-sig'))
    for key,field in [('CIRCUITCHECK_DATA','data_directory'),('KICAD_CLI','kicad_cli')]:
        if isinstance(runtime.get(field),str) and runtime[field]:os.environ.setdefault(key,runtime[field])
DATA = Path(os.environ.get('CIRCUITCHECK_DATA', ROOT / 'data')).resolve()
ENGINE_TIMEOUT = int(os.environ.get('ENGINE_TIMEOUT', '120'))
MAX_UPLOAD = 25 * 1024 * 1024
MAX_EXPANDED = 100 * 1024 * 1024
MAX_FILES = 500
PINNED_ENGINE = '10.0.7'

