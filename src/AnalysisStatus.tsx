import {useState} from 'react';
import {api} from './api';
import type {Job,QueuedJob} from './api.generated';

export default function AnalysisStatus({job,workerReady,onRefresh,onSetup}:{job?:Job;workerReady?:boolean;onRefresh:()=>Promise<unknown>;onSetup:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!job||!['queued','running','cancelling','cancelled','failed'].includes(job.status))return null;
 async function action(kind:'cancel'|'retry'){if(!job)return;setBusy(true);setError('');try{await api<Job|QueuedJob>(`/jobs/${job.id}/${kind}`,{});await onRefresh()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const active=['queued','running','cancelling'].includes(job.status);
 return <section className="r2-analysis-status" aria-label="Analysis job"><div role="status"><strong>{job.status==='cancelled'?'Analysis cancelled':job.status==='failed'?'Analysis failed':job.status==='cancelling'?'Cancelling analysis':job.stage}</strong><p>{job.error||(job.status==='queued'&&!workerReady?'Waiting for a live worker. Open setup diagnostics to check the service.':active?'Original design files are preserved. Cancellation stops checks and keeps the previous published result.':'Retry runs a fresh attempt on the same revision.')}</p></div><div>{active?<button className="r2-secondary" disabled={busy||job.status==='cancelling'} onClick={()=>void action('cancel')}>Cancel analysis</button>:<button className="r2-primary" disabled={busy} onClick={()=>void action('retry')}>Retry analysis</button>}<button className="r2-link-button" onClick={onSetup}>Setup diagnostics</button></div>{error&&<p className="r2-error" role="alert">{error}</p>}</section>;
}
