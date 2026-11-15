"""Versioned project backups; restores create a new project, never overwrite one."""
import io
import json
import shutil
import stat
import tempfile
import time
import zipfile
from uuid import UUID,uuid4
from pathlib import Path
from . import db
from .config import MAX_EXPANDED,MAX_UPLOAD
from .storage import LocalStorage,fingerprint
from .uploads import safe_path,unpack

def idle(connection,project_id):
    if connection.execute("SELECT 1 FROM jobs WHERE project_id=? AND status IN ('queued','running','cancelling')",(project_id,)).fetchone():raise ValueError('Wait for analysis to finish or cancel it before managing project storage.')

def export_project(project_id):
    store=LocalStorage();content=io.BytesIO();size=0
    with db.connect() as c:
        c.execute('BEGIN IMMEDIATE');idle(c,project_id)
        project=c.execute('SELECT * FROM projects WHERE id=?',(project_id,)).fetchone()
        if not project:raise ValueError('Project not found')
        revisions=[dict(r) for r in c.execute('SELECT * FROM revisions WHERE project_id=? ORDER BY created',(project_id,))]
        notes=[dict(r) for r in c.execute('SELECT * FROM review_notes WHERE project_id=?',(project_id,))]
        metadata={'format':'circuitcheck-backup','version':1,'project':dict(project),'revisions':revisions,'review_notes':notes,'created':time.time()}
        with zipfile.ZipFile(content,'w',zipfile.ZIP_DEFLATED) as archive:
            def add(folder,prefix):
                nonlocal size
                for path in sorted(folder.rglob('*')):
                    if not path.is_file() or path.is_symlink():continue
                    size+=path.stat().st_size
                    if size>MAX_EXPANDED:raise ValueError('Backup exceeds the 100 MB expanded limit. Clean generated previews or back up fewer revisions.')
                    archive.write(path,prefix+'/'+path.relative_to(folder).as_posix())
            add(store.project(project_id)/'original','original')
            for revision in revisions:
                result=db.decode(revision['result'])
                add(store.revision(project_id,revision['id'])/'source',f"revisions/{revision['id']}/source")
                # Keep published exports and evidence, excluding disposable engine copies.
                artifacts=store.artifacts(project_id,revision['id'],result)
                if artifacts.is_dir():
                    for path in sorted(artifacts.rglob('*')):
                        if not path.is_file() or path.is_symlink() or any(part in ('runs','working','fabrication-working','engine-config') for part in path.relative_to(artifacts).parts):continue
                        size+=path.stat().st_size
                        if size>MAX_EXPANDED:raise ValueError('Backup exceeds the expanded size limit. Clean generated previews first.')
                        archive.write(path,f"revisions/{revision['id']}/artifacts/"+path.relative_to(artifacts).as_posix())
                if result:
                    result.pop('artifact_root',None);revision['result']=json.dumps(result)
            archive.writestr('metadata.json',json.dumps(metadata))
    if content.tell()>MAX_UPLOAD:raise ValueError('Compressed backup exceeds the 25 MB restore limit. Clean generated previews first.')
    content.seek(0);return content

def restore_project(blob):
    if len(blob)>MAX_UPLOAD:raise ValueError('Backup exceeds the 25 MB limit.')
    store=LocalStorage();temp_root=store.root/'tmp';temp_root.mkdir(parents=True,exist_ok=True)
    project_id=str(uuid4());destination=store.project(project_id)
    try:
        with tempfile.TemporaryDirectory(dir=temp_root,prefix='restore-') as temporary:
            stage=Path(temporary);seen=set();total=0
            try:
                with zipfile.ZipFile(io.BytesIO(blob)) as archive:
                    if len(archive.infolist())>2000:raise ValueError('Backup contains too many entries.')
                    for info in archive.infolist():
                        relative=safe_path(info.filename)
                        if relative.as_posix() in seen:raise ValueError('Backup contains duplicate paths.')
                        seen.add(relative.as_posix())
                        if stat.S_ISLNK(info.external_attr>>16):raise ValueError('Backup symlinks are unsupported.')
                        if info.is_dir():continue
                        if relative.parts[0] not in ('original','revisions','metadata.json'):raise ValueError('Unexpected backup entry.')
                        total+=info.file_size
                        if total>MAX_EXPANDED:raise ValueError('Backup exceeds the expanded size limit.')
                        target=stage/relative;target.parent.mkdir(parents=True,exist_ok=True)
                        target.write_bytes(archive.read(info))
            except (zipfile.BadZipFile,RuntimeError):raise ValueError('Choose a valid, unencrypted CircuitCheck backup ZIP.') from None
            metadata=json.loads((stage/'metadata.json').read_text(encoding='utf-8'))
            if metadata.get('format')!='circuitcheck-backup' or metadata.get('version')!=1:raise ValueError('Unsupported backup format.')
            revisions=metadata.get('revisions',[])
            if not 1<=len(revisions)<=100:raise ValueError('Backup must contain between 1 and 100 revisions.')
            mapping={r['id']:str(uuid4()) for r in revisions}
            if len(mapping)!=len(revisions) or metadata['project']['current_revision'] not in mapping:raise ValueError('Invalid revision history.')
            for revision in revisions:
                UUID(revision['id'])
                source=stage/'revisions'/revision['id']/'source'
                validated=stage/'validated'/revision['id']
                files=[(p.relative_to(source).as_posix(),p.read_bytes()) for p in source.rglob('*') if p.is_file()]
                manifest=unpack(files,validated)
                if fingerprint(validated)!=revision['hash']:raise ValueError('Backup source hash does not match its revision. Restore stopped.')
                # Manifest rules must still pass the ordinary upload validator.
                previous=db.decode(revision['manifest'])
                if previous.get('rule_profile'):
                    from .profiles import validate_profile
                    manifest['rule_profile']=validate_profile({k:v for k,v in previous['rule_profile'].items() if k!='fingerprint'})
                revision['manifest']=manifest
            original=stage/'original'
            unpack([(p.relative_to(original).as_posix(),p.read_bytes()) for p in original.rglob('*') if p.is_file()],stage/'validated-original')
            destination.mkdir(parents=True)
            shutil.copytree(stage/'validated-original',destination/'original')
            for revision in revisions:
                target=store.revision(project_id,mapping[revision['id']]);shutil.copytree(stage/'validated'/revision['id'],target/'source')
                artifacts=stage/'revisions'/revision['id']/'artifacts'
                if artifacts.is_dir():shutil.copytree(artifacts,target/'artifacts')
            now=time.time()
            with db.connect() as c:
                c.execute('INSERT INTO projects VALUES(?,?,?,?,?)',(project_id,str(metadata['project']['name'])[:200]+' (restored)',now,mapping[metadata['project']['current_revision']],0))
                for revision in revisions:
                    result=db.decode(revision.get('result'))
                    if result:
                        result.pop('artifact_root',None)
                        result.setdefault('notices',[]).append({'kind':'restored','message':'Restored backup evidence; rerun native checks before relying on this result.'})
                    c.execute('INSERT INTO revisions VALUES(?,?,?,?,?,?,?)',(mapping[revision['id']],project_id,mapping.get(revision.get('parent_id')),revision['hash'],json.dumps(revision['manifest']),json.dumps(result) if result else None,revision['created']))
                for note in metadata.get('review_notes',[])[:10000]:
                    if note.get('revision_id') not in mapping:raise ValueError('Review note refers to an unknown revision.')
                    c.execute('INSERT INTO review_notes VALUES(?,?,?,?,?,?,?,?)',(str(uuid4()),project_id,str(note['finding_id']),mapping[note['revision_id']],str(note['kind']),str(note['body'])[:4000],note['scope'],note['created']))
        return {'project_id':project_id,'revision_id':mapping[metadata['project']['current_revision']]}
    except Exception:
        if destination.is_dir():shutil.rmtree(destination)
        raise

def preview_files(project_id):
    store=LocalStorage();files=[]
    with db.connect() as c:
        idle(c,project_id)
        if not c.execute('SELECT 1 FROM projects WHERE id=?',(project_id,)).fetchone():raise ValueError('Project not found')
        for revision in c.execute('SELECT * FROM revisions WHERE project_id=?',(project_id,)):
            root=store.artifacts(project_id,revision['id'],db.decode(revision['result']))
            for path in root.rglob('*'):
                if path.is_file() and not path.is_symlink() and path.suffix.lower() in ('.svg','.glb'):files.append(path)
    return files

def cleanup_previews(project_id):
    store=LocalStorage()
    with db.connect() as c:
        c.execute('BEGIN IMMEDIATE');idle(c,project_id)
        files=[]
        for revision in c.execute('SELECT * FROM revisions WHERE project_id=?',(project_id,)).fetchall():
            root=store.artifacts(project_id,revision['id'],db.decode(revision['result']))
            for path in root.rglob('*'):
                if path.is_file() and not path.is_symlink() and path.suffix.lower() in ('.svg','.glb'):files.append(path)
            result=db.decode(revision['result'])
            if result:
                result['previews']=[];result['schematic_geometry']={}
                c.execute('UPDATE revisions SET result=? WHERE id=?',(json.dumps(result),revision['id']))
            for cache in root.rglob('result.json'):cache.unlink(missing_ok=True)
        size=sum(p.stat().st_size for p in files)
        for path in files:path.unlink(missing_ok=True)
    return {'removed_files':len(files),'freed_bytes':size,'message':'Generated SVG and GLB previews removed. Source files, findings and native reports are preserved. Rerun checks to rebuild previews.'}
