"""Build version-consistent, deterministic app/extension ZIPs from an allowlist."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import zipfile

ROOT=Path(__file__).resolve().parents[1]
FOLDERS=('checks','backend','src','scripts','tests','e2e','pages-tests','fixtures','public','dist','docs','.github','browser-extension')
FILES=('THIRD_PARTY_NOTICES.md','package.json','package-lock.json','index.html','README.md','VERIFICATION.md','RELEASE_NOTES.md','LICENSE','requirements.txt','requirements.lock.txt','pytest.ini','tsconfig.json','vite.config.ts','playwright.config.ts','playwright.pages.config.ts','Setup CircuitCheck.cmd','Start CircuitCheck.cmd','Stop CircuitCheck.cmd','Diagnose CircuitCheck.cmd','.env.example','.gitignore')
EXCLUDED={'node_modules','.git','data','.venv','__pycache__','.pytest_cache','test-results','playwright-report','engine-config','downloads','.env'}

def write(archive,name,data):
    info=zipfile.ZipInfo(name,(2020,1,1,0,0,0));info.external_attr=0o100644<<16
    archive.writestr(info,data,compress_type=zipfile.ZIP_DEFLATED)

def package(output):
    app=json.loads((ROOT/'package.json').read_text(encoding='utf-8-sig'))['version']
    if os.getenv('GITHUB_REF_TYPE')=='tag' and os.getenv('GITHUB_REF_NAME')!='v'+app:raise ValueError('Release tag must match the app version in package.json.')
    extension=ROOT/'browser-extension';version=json.loads((extension/'manifest.json').read_text(encoding='utf-8-sig'))['version']
    if json.loads((extension/'package.json').read_text(encoding='utf-8-sig'))['version']!=version:raise ValueError('Extension package and manifest versions differ.')
    if not (ROOT/'dist/index.html').is_file():raise ValueError('Build the production frontend before packaging.')
    output.mkdir(parents=True,exist_ok=True)
    ext=output/f'Circuit-Check-Multi-platform-v{version}.zip'
    with zipfile.ZipFile(ext,'w') as archive:
        for path in sorted(extension.rglob('*')):
            if path.is_file() and not path.is_symlink() and not any(part in EXCLUDED for part in path.relative_to(extension).parts):write(archive,path.relative_to(extension).as_posix(),path.read_bytes())
    complete=output/f'CircuitCheck-v{app}-extension-v{version}.zip'
    with zipfile.ZipFile(complete,'w') as archive:
        paths=[ROOT/name for name in FILES if (ROOT/name).is_file()]
        for folder in FOLDERS:paths.extend(path for path in (ROOT/folder).rglob('*') if path.is_file())
        for path in sorted(paths):
            relative=path.relative_to(ROOT)
            if path.is_symlink() or any(part in EXCLUDED for part in relative.parts) or path.suffix in ('.pyc','.tsbuildinfo','.log','.pem','.key','.p12','.pfx') or '.secret.' in path.name:continue
            write(archive,'CircuitCheck/'+relative.as_posix(),path.read_bytes())
        for folder in ('public','dist'):write(archive,f'CircuitCheck/{folder}/downloads/{ext.name}',ext.read_bytes())
    manifest={'app_version':app,'extension_version':version,'source_commit':os.getenv('GITHUB_SHA'),'packages':[{ 'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size} for path in (complete,ext)]}
    (output/'release-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    (output/'SHA256SUMS').write_text(''.join(p['sha256']+'  '+p['file']+'\n' for p in manifest['packages']),encoding='utf-8')
    return manifest

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--out-dir',type=Path,default=ROOT/'release');args=parser.parse_args()
    print(json.dumps(package(args.out_dir),indent=2))
