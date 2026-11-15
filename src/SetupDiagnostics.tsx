import {useEffect,useState} from 'react';
import {CheckCircle2,Download,RefreshCw,TriangleAlert} from 'lucide-react';
import {api,download,demoMode} from './api';
import type {Diagnostics} from './api.generated';

export default function SetupDiagnostics(){
 const [report,setReport]=useState<Diagnostics>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){setBusy(true);setError('');try{setReport(await api<Diagnostics>('/diagnostics'))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 useEffect(()=>{if(!demoMode)void refresh()},[]);
 return <section className="r2-operations-card" aria-labelledby="setup-heading"><div className="r2-operation-heading"><div><h2 id="setup-heading">Setup & diagnostics</h2><p>Check each service separately before running analysis.</p></div><button className="r2-secondary" disabled={busy||demoMode} onClick={()=>void refresh()}><RefreshCw size={15} aria-hidden="true"/>{busy?'Checking…':'Check again'}</button></div>
  {demoMode?<p className="r2-caption">Setup diagnostics run in the local application.</p>:report&&<><p role="status" className={report.ready?'r2-verification':'r2-attention'}>{report.ready?'All required services are ready.':'Setup needs attention. Follow the fixes below.'}</p><div className="r2-diagnostic-checks">{report.checks.map(check=><article key={check.id} data-check={check.id}><div>{check.status==='ready'?<CheckCircle2 size={18} aria-hidden="true"/>:<TriangleAlert size={18} aria-hidden="true"/>}<h3>{check.title}</h3><strong>{check.status==='ready'?'Ready':'Needs attention'}</strong></div><p>{check.detail}</p>{check.status!=='ready'&&<p className="r2-diagnostic-fix"><strong>Fix: </strong>{check.fix}</p>}</article>)}</div><p className="r2-caption">Storage: <code>{report.data_directory}</code> · Checked {new Date(report.generated_at*1000).toLocaleTimeString()}</p><button className="r2-link-button" onClick={()=>download('/api/diagnostics/download').catch(e=>setError((e as Error).message))}><Download size={15} aria-hidden="true"/>Download diagnostic report</button><p className="r2-caption">Includes service status and local storage path. Credentials and circuit contents are excluded.</p></>}
  {error&&<p className="r2-error" role="alert">{error} Run Start CircuitCheck.cmd and check again.</p>}
 </section>;
}
