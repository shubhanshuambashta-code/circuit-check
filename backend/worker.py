"""Single native-analysis worker with a live lease and cooperative cancellation."""
import argparse
import json
import logging
import shutil
import threading
import time
import traceback
from uuid import uuid4
from . import db
from .storage import LocalStorage
from .engine import analyze
from .job_runtime import AnalysisCancelled,cancellation

WORKER_ID=str(uuid4())

def tick():
    db.recover()
    db.worker_heartbeat(WORKER_ID)
    job=db.claim(WORKER_ID)
    if not job:return False
    store=LocalStorage()
    stopped=threading.Event()
    def heartbeat():
        while not stopped.wait(2):
            try:db.worker_heartbeat(WORKER_ID,job['id'],job['token'])
            except Exception:logging.exception('Worker heartbeat failed')
    thread=threading.Thread(target=heartbeat,daemon=True);thread.start()
    def checkpoint():
        if not db.lease_active(job['id'],job['token']):raise AnalysisCancelled('Cancelled or worker lease lost')
    def progress(stage):
        checkpoint()
        with db.connect() as c:
            c.execute("UPDATE jobs SET stage=?,updated=? WHERE id=? AND status='running'",(stage,time.time(),job['id']))
    try:
        rev=db.row('revisions',job['revision_id'])
        folder=store.revision(job['project_id'],job['revision_id'])
        artifacts=store.root/'analyses'/job['id']
        previous=store.artifacts(job['project_id'],job['revision_id'],db.decode(rev['result']))
        if not job['fresh'] and previous.is_dir():
            shutil.copytree(previous,artifacts,ignore=shutil.ignore_patterns('runs','working','fabrication-working'),dirs_exist_ok=True)
        with cancellation(checkpoint):
            checkpoint()
            manifest=db.decode(rev['manifest'])
            from .tscircuit_checks import analyze_capture,supplement_native
            if manifest.get('source_format')=='circuitcheck-capture':
                result=analyze_capture(folder/'source',artifacts,manifest,progress)
            else:
                result=analyze(folder/'source',artifacts,manifest,progress)
                progress('Running supplemental local captured-input checks')
                result=supplement_native(result,folder/'source',artifacts,manifest)
            checkpoint()
        result['artifact_root']='runs/'+job['id']
        with db.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            active=c.execute("SELECT 1 FROM jobs JOIN job_control ON jobs.id=job_control.job_id WHERE jobs.id=? AND token=? AND jobs.status='running' AND cancel_requested=0",(job['id'],job['token'])).fetchone()
            if not active:raise AnalysisCancelled('Lease lost before publishing results')
            c.execute('UPDATE revisions SET result=? WHERE id=?',(json.dumps(result),rev['id']))
            c.execute('UPDATE jobs SET status=?,stage=?,updated=? WHERE id=?',(result['status'],'Checks completed' if result['status']=='completed' else 'Review check coverage',time.time(),job['id']))
    except AnalysisCancelled:
        with db.connect() as c:
            c.execute("UPDATE jobs SET status='cancelled',stage='Analysis cancelled; previous results retained',updated=? WHERE id=? AND status IN ('running','cancelling') AND EXISTS(SELECT 1 FROM job_control WHERE job_id=? AND token=?)",(time.time(),job['id'],job['id'],job['token']))
    except Exception as e:
        folder=store.root/'analyses'/job['id'];folder.mkdir(parents=True,exist_ok=True)
        (folder/'failure.log').write_text(traceback.format_exc(),encoding='utf-8')
        with db.connect() as c:
            c.execute("UPDATE jobs SET status='failed',stage='Analysis failed',error=?,updated=? WHERE id=? AND status IN ('running','cancelling') AND EXISTS(SELECT 1 FROM job_control WHERE job_id=? AND token=?)",(str(e),time.time(),job['id'],job['id'],job['token']))
        logging.exception('Analysis failed for job %s',job['id'])
    finally:
        stopped.set();thread.join(timeout=5);db.worker_heartbeat(WORKER_ID)
    return True

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--once',action='store_true');args=parser.parse_args()
    db.init()
    if args.once:tick();return
    while True:
        if not tick():time.sleep(1)

if __name__=='__main__':main()
