"""SQLite repository. Short-lived connections and atomic queue claims; no ORM state in workers."""
import json
import sqlite3
import time
from contextlib import contextmanager
from .config import DATA

@contextmanager
def connect():
    DATA.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DATA / 'circuitcheck.sqlite3', timeout=30)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA journal_mode=WAL')
    try:
        yield db
        db.commit()
    finally:
        db.close()

def init():
    with connect() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT,created REAL,current_revision TEXT,example INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS revisions(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,parent_id TEXT,hash TEXT,manifest TEXT,result TEXT,created REAL);
        CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,revision_id TEXT,status TEXT,stage TEXT,error TEXT,created REAL,updated REAL);
        CREATE TABLE IF NOT EXISTS repairs(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,base_id TEXT,candidate_id TEXT,finding_id TEXT,operation TEXT,state TEXT,created REAL);
        CREATE TABLE IF NOT EXISTS workers(id TEXT PRIMARY KEY,pid INTEGER,started REAL,updated REAL,current_job TEXT,state TEXT);
        CREATE TABLE IF NOT EXISTS job_control(job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,worker_id TEXT,token TEXT,cancel_requested INTEGER DEFAULT 0,fresh INTEGER DEFAULT 0);
        CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status,created);
        CREATE TABLE IF NOT EXISTS review_notes(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,finding_id TEXT,revision_id TEXT,kind TEXT,body TEXT,scope TEXT,created REAL);
        CREATE INDEX IF NOT EXISTS review_notes_finding ON review_notes(project_id,finding_id);
        CREATE TABLE IF NOT EXISTS explanations(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,revision_id TEXT,finding_id TEXT,question TEXT,response TEXT,created REAL);
        ''')

def row(table, id):
    if table not in ('projects', 'revisions', 'jobs', 'repairs'):
        raise ValueError('Unknown repository')
    with connect() as c:
        r = c.execute(f'SELECT * FROM {table} WHERE id=?', (id,)).fetchone()
        return dict(r) if r else None

def update_job(id, status, stage, error=None):
    with connect() as c:
        c.execute('UPDATE jobs SET status=?,stage=?,error=?,updated=? WHERE id=?', (status, stage, error, time.time(), id))

HEARTBEAT_TTL=30

def worker_heartbeat(worker_id,job_id=None,token=None):
    import os
    now=time.time()
    with connect() as c:
        c.execute("INSERT INTO workers VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated=excluded.updated,current_job=excluded.current_job,state=excluded.state",(worker_id,os.getpid(),now,now,job_id,'busy' if job_id else 'idle'))
        if job_id and token:
            c.execute("UPDATE jobs SET updated=? WHERE id=? AND status IN ('running','cancelling') AND EXISTS(SELECT 1 FROM job_control WHERE job_id=? AND token=?)",(now,job_id,job_id,token))
        c.execute('DELETE FROM workers WHERE updated<?',(now-86400,))

def worker_status():
    now=time.time()
    with connect() as c:
        worker=c.execute('SELECT * FROM workers ORDER BY updated DESC LIMIT 1').fetchone()
    if not worker:return {'available':False,'state':'stopped','heartbeat_age_seconds':None}
    age=max(0,now-worker['updated'])
    return {'available':age<HEARTBEAT_TTL,'state':worker['state'] if age<HEARTBEAT_TTL else 'unresponsive','heartbeat_age_seconds':round(age,1),'current_job':worker['current_job']}

def claim(worker_id=None):
    from uuid import uuid4
    with connect() as c:
        c.execute('BEGIN IMMEDIATE')
        if c.execute("SELECT 1 FROM jobs WHERE status IN ('running','cancelling') LIMIT 1").fetchone():return None
        r=c.execute("SELECT * FROM jobs WHERE status='queued' ORDER BY created LIMIT 1").fetchone()
        if not r:return None
        token=str(uuid4())
        c.execute("INSERT INTO job_control(job_id) VALUES(?) ON CONFLICT(job_id) DO NOTHING",(r['id'],))
        c.execute('UPDATE job_control SET worker_id=?,token=? WHERE job_id=?',(worker_id,token,r['id']))
        c.execute("UPDATE jobs SET status='running',stage='Reading project',updated=? WHERE id=?",(time.time(),r['id']))
        control=c.execute('SELECT * FROM job_control WHERE job_id=?',(r['id'],)).fetchone()
        return {**dict(r),**dict(control)}

def lease_active(job_id,token):
    with connect() as c:
        r=c.execute("SELECT jobs.status,job_control.cancel_requested FROM jobs JOIN job_control ON jobs.id=job_control.job_id WHERE jobs.id=? AND token=?",(job_id,token)).fetchone()
    return bool(r and r['status']=='running' and not r['cancel_requested'])

def cancel(job_id):
    with connect() as c:
        c.execute('BEGIN IMMEDIATE')
        job=c.execute('SELECT * FROM jobs WHERE id=?',(job_id,)).fetchone()
        if not job:raise ValueError('Job not found')
        if job['status'] not in ('queued','running','cancelling'):return dict(job)
        c.execute('INSERT INTO job_control(job_id,cancel_requested) VALUES(?,1) ON CONFLICT(job_id) DO UPDATE SET cancel_requested=1',(job_id,))
        status='cancelled' if job['status']=='queued' else 'cancelling'
        c.execute('UPDATE jobs SET status=?,stage=?,updated=? WHERE id=?',(status,'Cancelled before analysis' if status=='cancelled' else 'Stopping native checks',time.time(),job_id))
    return row('jobs',job_id)

def recover():
    with connect() as c:
        c.execute("UPDATE jobs SET status=CASE WHEN status='cancelling' THEN 'cancelled' ELSE 'failed' END,stage='Worker heartbeat expired',error='Worker stopped responding. Retry creates a fresh attempt; previous design files are preserved.',updated=? WHERE status IN ('running','cancelling') AND updated<?",(time.time(),time.time()-HEARTBEAT_TTL))

def decode(r):
    return json.loads(r) if r else None
