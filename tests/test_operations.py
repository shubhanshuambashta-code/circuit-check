import io
import json
import sys
import threading
import time
import zipfile
import pytest
from backend import db,worker
from backend.storage import LocalStorage,fingerprint
from backend.job_runtime import AnalysisCancelled,cancellation

def test_provider_fixture_isolates_every_legacy_search_directory(tmp_path):
    from backend import assistant_provider as provider
    assert provider.DATA==tmp_path/'data'
    assert provider.CONFIG_FILE.parent==tmp_path
    assert provider.LEGACY_FILE.parent==tmp_path

def test_worker_health_distinguishes_a_stopped_worker(client,monkeypatch):
    assert client.get('/api/health').json()['worker_available'] is False
    db.worker_heartbeat('fixture-worker')
    assert client.get('/api/health').json()['worker_available'] is True
    with db.connect() as c:c.execute('UPDATE workers SET updated=?',(time.time()-31,))
    report=client.get('/api/diagnostics').json()
    assert next(c for c in report['checks'] if c['id']=='worker')['status']=='error'
    assert report['ready'] is False
    download=client.get('/api/diagnostics/download')
    assert 'attachment' in download.headers['content-disposition']
    assert 'gsk_' not in download.text and 'AI_API_KEY' not in download.text

def test_queued_cancel_and_retry_create_a_fresh_attempt(client,upload_fixture):
    project=upload_fixture('valid');job=project['job_id']
    assert client.post(f'/api/jobs/{job}/cancel').json()['status']=='cancelled'
    response=client.post(f'/api/jobs/{job}/retry');assert response.status_code==202
    retry=db.row('jobs',response.json()['job_id'])
    assert retry['id']!=job and retry['revision_id']==project['revision_id']
    assert client.post(f"/api/jobs/{retry['id']}/retry").status_code==422
    with db.connect() as c:assert c.execute('SELECT fresh FROM job_control WHERE job_id=?',(retry['id'],)).fetchone()[0]==1

def test_cancelled_attempt_keeps_published_report_and_artifacts(client,upload_fixture,monkeypatch):
    project=upload_fixture('valid');revision=project['revision_id'];store=LocalStorage()
    old={'status':'completed','findings':[],'previews':[],'finished_at':1}
    with db.connect() as c:c.execute('UPDATE revisions SET result=? WHERE id=?',(json.dumps(old),revision))
    artifacts=store.revision(project['project_id'],revision)/'artifacts';artifacts.mkdir();(artifacts/'board.svg').write_text('published')
    def analyze(source,attempt,manifest,progress):
        attempt.mkdir(parents=True,exist_ok=True);(attempt/'board.svg').write_text('unpublished')
        db.cancel(project['job_id']);progress('Must stop')
        raise AssertionError('Cancellation should interrupt progress')
    monkeypatch.setattr(worker,'analyze',analyze);assert worker.tick()
    assert db.row('jobs',project['job_id'])['status']=='cancelled'
    assert db.decode(db.row('revisions',revision)['result'])==old
    assert (artifacts/'board.svg').read_text()=='published'

def test_lost_lease_cannot_publish_a_late_result(client,upload_fixture,monkeypatch):
    project=upload_fixture('valid')
    def analyze(*args):
        db.update_job(project['job_id'],'failed','Worker lease expired')
        return {'status':'completed','findings':[]}
    monkeypatch.setattr(worker,'analyze',analyze);worker.tick()
    assert db.row('jobs',project['job_id'])['status']=='failed'
    assert db.row('revisions',project['revision_id'])['result'] is None

def test_heartbeat_renews_a_busy_worker_without_stage_progress(client,upload_fixture,monkeypatch):
    monkeypatch.setattr('backend.tscircuit_checks.supplement_native',lambda result,*args:result)
    project=upload_fixture('valid')
    def analyze(*args):
        started=time.time();time.sleep(2.2)
        assert db.row('jobs',project['job_id'])['updated']>started
        assert db.worker_status()['available'] is True
        return {'status':'completed','findings':[]}
    monkeypatch.setattr(worker,'analyze',analyze);worker.tick()

def test_cancel_interrupts_a_native_process_wait(tmp_path):
    from backend.engine import run
    event=threading.Event();timer=threading.Timer(.3,event.set);timer.start();started=time.monotonic()
    def check():
        if event.is_set():raise AnalysisCancelled('Requested by test')
    try:
        with cancellation(check),pytest.raises(AnalysisCancelled):run([sys.executable,'-c','import time; time.sleep(30)'],tmp_path,tmp_path/'process.log',40)
    finally:timer.cancel()
    assert time.monotonic()-started<4

def test_backup_restore_is_a_new_project_with_matching_sources(client,upload_fixture):
    project=upload_fixture('valid');client.post(f"/api/jobs/{project['job_id']}/cancel")
    before=db.row('revisions',project['revision_id'])
    response=client.get(f"/api/projects/{project['project_id']}/backup");assert response.status_code==200
    restored=client.post('/api/backups/restore',files={'file':('backup.zip',response.content)})
    assert restored.status_code==201,restored.text
    new=restored.json();assert new['project_id']!=project['project_id']
    assert db.row('revisions',new['revision_id'])['hash']==before['hash']
    assert db.row('revisions',project['revision_id'])==before
    assert db.row('jobs',new['job_id'])['status']=='queued'

def test_backup_rejects_traversal_and_source_corruption(client,upload_fixture):
    malicious=io.BytesIO()
    with zipfile.ZipFile(malicious,'w') as z:z.writestr('../outside','bad')
    assert client.post('/api/backups/restore',files={'file':('bad.zip',malicious.getvalue())}).status_code==422
    project=upload_fixture('valid');client.post(f"/api/jobs/{project['job_id']}/cancel")
    backup=client.get(f"/api/projects/{project['project_id']}/backup").content;changed=io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(backup)) as original,zipfile.ZipFile(changed,'w') as z:
        for entry in original.infolist():
            value=original.read(entry)
            if '/source/' in entry.filename and entry.filename.endswith('.kicad_pcb'):value+=b'\n; altered'
            z.writestr(entry.filename,value)
    assert client.post('/api/backups/restore',files={'file':('bad.zip',changed.getvalue())}).status_code==422

def test_preview_cleanup_preserves_sources_and_native_reports(client,upload_fixture):
    project=upload_fixture('valid');store=LocalStorage();source=store.revision(project['project_id'],project['revision_id'])/'source';before=fingerprint(source)
    assert client.post(f"/api/projects/{project['project_id']}/previews/cleanup").status_code==422
    client.post(f"/api/jobs/{project['job_id']}/cancel")
    artifacts=source.parent/'artifacts';artifacts.mkdir();(artifacts/'board.svg').write_text('svg');(artifacts/'drc.json').write_text('{}')
    response=client.post(f"/api/projects/{project['project_id']}/previews/cleanup");assert response.json()['removed_files']==1
    assert fingerprint(source)==before and (artifacts/'drc.json').exists()

def test_provider_migration_verifies_os_store_before_removing_plaintext(monkeypatch,tmp_path):
    from backend import assistant_provider as provider
    key='gsk_'+'z'*30
    provider.LEGACY_FILE.write_text(json.dumps({'provider':'groq','key':key}))
    assert provider.configuration()['key']==key
    assert not provider.LEGACY_FILE.exists()
    assert key not in provider.CONFIG_FILE.read_text()
    assert provider.load_secret(provider.credential_target())==key

def test_failed_os_migration_keeps_existing_key_file(monkeypatch):
    from backend import assistant_provider as provider
    key='gsk_'+'z'*30;provider.LEGACY_FILE.write_text(json.dumps({'provider':'groq','key':key}))
    def unavailable(*args):raise ValueError('Credential store unavailable')
    monkeypatch.setattr(provider,'save_secret',unavailable)
    with pytest.raises(ValueError):provider.configuration()
    assert json.loads(provider.LEGACY_FILE.read_text())['key']==key
