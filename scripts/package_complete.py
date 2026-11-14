"""Package a built local app without private data or installed dependencies."""
from pathlib import Path
import zipfile

root=Path(__file__).resolve().parents[1]
if not (root/'dist/index.html').is_file():
    raise SystemExit('Run npm ci and npm run build first.')
target=root/'downloads/CircuitCheck-complete-v0.2.1-extension-v0.6.4.zip'
target.parent.mkdir(exist_ok=True)
excluded={'.git','node_modules','data','.venv','venv','env','__pycache__','.pytest_cache','downloads','dist-pages','screenshots','test-results','playwright-report'}
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(root.rglob('*')):
        relative=path.relative_to(root)
        # public/downloads is intentional; top-level downloads contains this archive.
        if any(part in excluded-{'downloads'} for part in relative.parts) or relative.parts[0]=='downloads':continue
        if not path.is_file() or path.suffix in {'.pyc','.tsbuildinfo','.pem','.key','.log'}:continue
        if path.name.startswith('.env') and path.name!='.env.example':continue
        archive.write(path,Path('CircuitCheck')/relative)
print(f'Created {target.name}: {target.stat().st_size:,} bytes')
