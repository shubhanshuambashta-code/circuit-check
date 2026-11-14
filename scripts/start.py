"""One local supervisor; API and native worker remain separate processes."""
import argparse
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import webbrowser
import json
import socket
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))

def service_job():
    """Keep this supervisor and all future children together on Windows.

    The OS closes this handle when the supervisor exits, including forced exits.
    No live worker or API may be left behind without its supervisor.
    """
    import ctypes as c
    from ctypes import wintypes as w
    class BASIC(c.Structure):
        _fields_=[('PerProcessUserTimeLimit',c.c_longlong),('PerJobUserTimeLimit',c.c_longlong),('LimitFlags',w.DWORD),('MinimumWorkingSetSize',c.c_size_t),('MaximumWorkingSetSize',c.c_size_t),('ActiveProcessLimit',w.DWORD),('Affinity',c.c_size_t),('PriorityClass',w.DWORD),('SchedulingClass',w.DWORD)]
    class IO(c.Structure):
        _fields_=[(name,c.c_ulonglong) for name in ('ReadOperationCount','WriteOperationCount','OtherOperationCount','ReadTransferCount','WriteTransferCount','OtherTransferCount')]
    class EXTENDED(c.Structure):
        _fields_=[('BasicLimitInformation',BASIC),('IoInfo',IO),('ProcessMemoryLimit',c.c_size_t),('JobMemoryLimit',c.c_size_t),('PeakProcessMemoryUsed',c.c_size_t),('PeakJobMemoryUsed',c.c_size_t)]
    kernel=c.WinDLL('kernel32',use_last_error=True)
    kernel.CreateJobObjectW.argtypes=[c.c_void_p,w.LPCWSTR];kernel.CreateJobObjectW.restype=w.HANDLE
    kernel.SetInformationJobObject.argtypes=[w.HANDLE,c.c_int,c.c_void_p,w.DWORD];kernel.SetInformationJobObject.restype=w.BOOL
    kernel.AssignProcessToJobObject.argtypes=[w.HANDLE,w.HANDLE];kernel.AssignProcessToJobObject.restype=w.BOOL
    kernel.GetCurrentProcess.restype=w.HANDLE
    kernel.CloseHandle.argtypes=[w.HANDLE]
    job=kernel.CreateJobObjectW(None,None)
    if not job:raise OSError(c.get_last_error(),'Could not create the local service process group')
    info=EXTENDED();info.BasicLimitInformation.LimitFlags=0x2000
    if not kernel.SetInformationJobObject(job,9,c.byref(info),c.sizeof(info)) or not kernel.AssignProcessToJobObject(job,kernel.GetCurrentProcess()):
        error=c.get_last_error();kernel.CloseHandle(job)
        raise OSError(error,'Could not protect the local service process group')
    return job  # Intentionally retained until the OS closes it at process exit.

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=8000)
    parser.add_argument('--open',action='store_true')
    parser.add_argument('--service',action='store_true',help='Persist service and child logs for the background launcher')
    args=parser.parse_args()
    os.chdir(ROOT)
    settings_file=ROOT/'data'/'runtime.json'
    settings=json.loads(settings_file.read_text(encoding='utf-8-sig')) if settings_file.is_file() else {}
    for key,field in [('CIRCUITCHECK_DATA','data_directory'),('KICAD_CLI','kicad_cli')]:
        if settings.get(field):os.environ.setdefault(key,settings[field])
    url=f'http://127.0.0.1:{args.port}'
    try:
        with urllib.request.urlopen(url+'/api/health',timeout=1) as response:health=json.load(response)
        with urllib.request.urlopen(url+'/openapi.json',timeout=1) as response:info=json.load(response).get('info',{})
        version=json.loads((ROOT/'package.json').read_text(encoding='utf-8-sig'))['version']
        if health.get('status')=='ok' and health.get('deployment')=='local single-user' and info.get('title')=='CircuitCheck' and info.get('version')==version:
            print(f'CircuitCheck is already running: {url}',flush=True)
            if args.open:webbrowser.open(url)
            return
    except (OSError,ValueError):pass
    with socket.socket() as probe:
        try:probe.bind(('127.0.0.1',args.port))
        except OSError:raise SystemExit(f'Port {args.port} is already in use. Close the other server or run scripts/start.py --port {args.port+1}.')
    from backend.config import DATA
    logs=[]
    if args.service:
        log_dir=DATA/'logs';log_dir.mkdir(parents=True,exist_ok=True)
        supervisor_log=open(log_dir/'supervisor.log','a',encoding='utf-8',buffering=1)
        sys.stdout=sys.stderr=supervisor_log
        print(f'\n{time.strftime("%Y-%m-%d %H:%M:%S")} Starting CircuitCheck supervisor {os.getpid()}',flush=True)
    if not (ROOT/'dist/index.html').exists():
        raise SystemExit('Frontend build is missing. Run npm ci, then npm run build.')
    temp=DATA/'tmp';temp.mkdir(parents=True,exist_ok=True)
    os.environ['TMP']=os.environ['TEMP']=str(temp)
    from backend.engine import executable
    if not executable():print('KiCad is unavailable. Upload validation remains available; checks will fail explicitly. See README.',flush=True)
    process_group=service_job() if args.service and os.name=='nt' else None
    processes=[]
    def stop(*_):raise KeyboardInterrupt
    signal.signal(signal.SIGTERM,stop)
    try:
        for name,command in [('worker',[sys.executable,'-m','backend.worker']),('api',[sys.executable,'-m','uvicorn','backend.main:app','--host','127.0.0.1','--port',str(args.port)])]:
            stream=open(log_dir/f'{name}.log','a',encoding='utf-8',buffering=1) if args.service else None
            if stream:logs.append(stream)
            processes.append(subprocess.Popen(command,cwd=ROOT,stdin=subprocess.DEVNULL,stdout=stream,stderr=stream,creationflags=subprocess.CREATE_NO_WINDOW if args.service and os.name=='nt' else 0))
        print(f'CircuitCheck: {url}\n'+('Managed background task. Use Stop CircuitCheck.cmd to stop.' if args.service else 'Press Ctrl+C to stop the API and worker.'),flush=True)
        if args.open:
            for _ in range(30):
                try:
                    urllib.request.urlopen(url+'/api/health',timeout=1)
                    webbrowser.open(url);break
                except OSError:time.sleep(.5)
        while all(p.poll() is None for p in processes):time.sleep(.5)
        for name,process in zip(('worker','api'),processes):
            if process.poll() is not None:print(f'{time.strftime("%Y-%m-%d %H:%M:%S")} {name} exited with code {process.returncode}',flush=True)
        raise SystemExit('A service exited. Review data/logs for its exit details.')
    except KeyboardInterrupt:pass
    finally:
        for p in processes:
            if p.poll() is None:p.terminate()
        for p in processes:
            try:p.wait(timeout=10)
            except subprocess.TimeoutExpired:p.kill();p.wait()
        for stream in logs:stream.close()

if __name__=='__main__':main()
