import {explainConsequence} from './finding-consequences.js';
import { importCircuit } from './importers.js';
import { readExtraCircuit } from './extra-readers.js';
import { platformForUrl, platformOf, platformLabel, selectCapture, captureSnapshot } from './platforms.js';
import { normalizeDiagram, exportDiagram } from './wokwi.js';
import { readWokwi, locateWokwi } from './wokwi-reader.js';
import { readTinkercad, locateTinkercad } from './reader.js';
import { RULES, DEFAULT_PROFILE, validateProfile } from './profiles.js';
import { createRun, compareRuns, reviewStatus, explainFinding, previewResistance, reportHTML } from './review.js';
import { loadWorkspace, freshWorkspace, transact, ensureProject, saveRun, saveNote, importWorkspace, WORKSPACE_KEY, MAX_BYTES } from './workspace.js';
import { correctionStatus, buildCorrectionPlan } from './correction.js';
import { openVisualProject } from './visual-storage.js';
const $ = id => document.getElementById(id);
const el = (tag, text = '', className = '') => { const n = document.createElement(tag); n.textContent = text; if (className) n.className = className; return n; };
const button = (text, action, className = '') => { const n = el('button', text, className); n.type = 'button'; n.addEventListener('click', () => perform(action)); return n; };
const option = (text, value) => { const n = el('option', text); n.value = value; return n; };
const date = value => new Date(value).toLocaleString();
const labelState = state => ({open:'Open',accepted_exception:'Accepted exception · finding retained',reviewed:'Reviewed',needs_review:'Evidence changed · re-review required'}[state] || state);
const isTinkercad = url => /^https:\/\/(?:(?:www|editor)\.)?tinkercad\.com\//.test(url || '');
let workspace = freshWorkspace(), run = null, target = null, paused = false, archived = false, busy = false, pendingCheck = false, editing = false, epoch = 0, fingerprint = '', filter = 'all', view = 'findings';
let correcting = false;
const project = () => workspace.projects.find(p => p.id === run?.projectId);
const notes = () => project()?.notes || [];
const canLocate = () => !!run && !!target && !paused && !archived;
const canEdit = () => canLocate() && platformOf(run.snapshot)==='tinkercad' && run.snapshot.editable && run.snapshot.simulation === 'stopped' && !editing;
const canPreview = () => canEdit() || !!run?.snapshot.diagram;
function notify(message, error = false) { $('notice').textContent = message; $('notice').style.color = error ? 'var(--red)' : 'var(--teal)'; }
async function perform(action) { try { return await action(); } catch (error) { notify(String(error?.message || error), true); } }
function download(name, body, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([typeof body === 'string' ? body : JSON.stringify(body,null,2)], {type:mime}));
  const a = el('a'); a.href = url; a.download = name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function showView(next) {
  view = next;
  document.querySelectorAll('[data-view]').forEach(b => { const active = b.dataset.view === next; b.setAttribute('aria-selected',String(active)); b.tabIndex = active ? 0 : -1; });
  document.querySelectorAll('[role=tabpanel]').forEach(s => { s.hidden = s.id !== 'view-' + next; });
  if (next === 'circuit') renderCircuit();
  if (next === 'reviews') renderReviews();
}
function clear(message, title = 'Open a supported circuit') {
  notify('');
  run = target = null; $('platform-name').textContent='Multi-platform'; fingerprint = ''; paused = archived = false;
  $('project').textContent = title; $('status').textContent = message; $('connection').textContent = 'NOT CONNECTED'; $('dot').className = 'dot';
  $('updated').textContent = 'No live circuit data is being checked.'; $('pause').textContent = 'Pause live checks'; render();
}
function paintConnection() {
  if (!run) return;
  $('platform-name').textContent=platformLabel(run.snapshot);
  $('project').textContent = run.snapshot.title || 'Untitled circuit';
  $('connection').textContent = run.snapshot.captureMode==='file' ? 'DIAGRAM FILE · FROZEN REVIEW' : archived ? 'SAVED REVIEW · READ ONLY' : paused ? 'LIVE CHECKS PAUSED' : 'CONNECTED TO '+platformLabel(run.snapshot).toUpperCase();
  $('dot').className = archived ? 'dot' : 'dot live';
  $('status').textContent = archived ? 'Showing saved data. Check circuit to return to the current live design.' : paused ? 'Showing a frozen result. Resume to check your latest edits.' : !['wokwi','tinkercad'].includes(platformOf(run.snapshot)) ? 'Reading parsed circuit connections. Simulator diagnostics are not included.' : platformOf(run.snapshot)==='wokwi' ? 'Reading current Wokwi diagram.json. Simulator diagnostics and firmware are not checked.' : `Reading actual Tinkercad connections. Simulation ${run.snapshot.simulation}.`;
  $('updated').textContent = `Captured ${date(run.snapshot.capturedAt)} · ${run.profile.name}`;
  $('pause').textContent = paused ? 'Resume live checks' : 'Pause live checks';
}
function render() {
  renderCorrection();
  const findings = run?.analysis.findings || [];
  for (const id of ['export','export-html','save-review','save-review-2']) $(id).disabled = !run;
  $('pause').disabled = !run || archived;
  $('export-source').disabled=!run?.snapshot.sourceDocument;
  $('parts').textContent = run ? run.snapshot.components.length : '—'; $('nets').textContent = run ? run.snapshot.netCount : '—'; $('issues').textContent = run ? findings.length : '—';
  $('all-count').textContent = run ? findings.length : '—'; $('error-count').textContent = run ? findings.filter(f=>f.severity==='error').length : '—'; $('warning-count').textContent = run ? findings.filter(f=>f.severity==='warning').length : '—';
  paintConnection(); renderFindings(); renderCoverage(); renderReviews(); if (view === 'circuit') renderCircuit();
}
function renderCorrection() {
  $('correct-circuit').disabled = (!canLocate() && !run?.snapshot.diagram) || correcting;
  $('open-designer').disabled = !run || correcting || editing;
  if (!run) {
    $('correction-status').textContent = 'Connect a circuit to prepare corrections.';
    $('correction-scope').textContent = 'Preview supported fixes, repair the remaining connections, and recheck every supported rule.';
    return;
  }
  const nativeImport=run&&!['tinkercad','wokwi'].includes(platformOf(run.snapshot));
  if(nativeImport)$('correct-circuit').disabled=true;
  const status = correctionStatus(run.snapshot, run.profile, { live: canLocate() });
  $('correction-status').textContent = (status.current ? '' : 'Saved or paused evidence · ') + status.summary;
  $('correction-scope').textContent = nativeImport?'Use the visual workspace to review and edit a separate proposal. Apply the guide in the original simulator.':status.note;
}
async function correctionDialog() {
  if(run && platformOf(run.snapshot)==='wokwi')return wokwiCorrectionDialog();
  if(run&&!['tinkercad','wokwi'].includes(platformOf(run.snapshot)))throw Error('Use Open visual workspace to edit this proposal and export a connection guide.');
  if (!canLocate() || correcting) throw Error('Connect your live Tinkercad circuit and resume checks first.');
  const base = run, body = openDialog('Correct circuit · preview first');
  body.append(el('p', 'The plan can change existing resistor values. Shorts, missing parts, reversed LEDs and uncertain connections need the listed repairs in Tinkercad.'),
    el('p', 'Changes affect this open design. Use Tinkercad’s Duplicate / Copy and Tinker first to keep the original circuit.', 'small muted'));
  const form = el('form'), label = el('label', 'Replacement for zero / negative resistors (Ω, optional)', 'field'), value = el('input');
  value.id = 'correction-value'; value.type = 'number'; value.min = '0.000001'; value.max = '1000000000'; value.step = 'any'; value.placeholder = 'Choose for your supply and load'; label.append(value);
  const preview = el('button', 'Build correction preview', 'primary'); preview.type = 'submit';
  const error = el('p', '', 'dialog-error'); error.setAttribute('role', 'alert');
  const result = el('div'); result.id = 'correction-plan'; form.append(label, el('p', 'Leaving this empty allows only changes derived from your configured LED resistance minimum. A replacement value is not calculated from component ratings.', 'small muted'), preview, error); body.append(form, result);
  let generation = 0;
  const build = async () => {
    const token = ++generation; preview.disabled = true; result.replaceChildren(); error.textContent = '';
    try {
      const plan = await buildCorrectionPlan(base, { replacementResistance: value.value.trim() === '' ? null : Number(value.value) });
      if (token !== generation || !$('review-dialog').open) return;
      const before = correctionStatus(base.snapshot, base.profile), after = correctionStatus(plan.candidate.snapshot, base.profile);
      result.append(el('h3', `${plan.changes.length} supported value correction(s)`), el('p', 'Before: ' + before.summary),
        el('p', 'Predicted static result: ' + after.summary), el('p', plan.note, 'small muted'));
      for (const change of plan.changes) {
        const card = el('div', '', 'component-card'); card.append(el('h3', `${change.label}: ${change.before} Ω → ${change.after} Ω`), el('p', change.reason)); result.append(card);
      }
      if (plan.blockers.length) result.append(el('p', 'Apply is blocked while a supply short is present. Correct the supply wiring first, then Check circuit and build a fresh plan.', 'dialog-error'));
      const remaining = el('div'); remaining.id = 'correction-remaining'; remaining.append(el('h3', `${plan.remaining.length} finding(s) still need attention`));
      for (const f of plan.remaining) {
        const item = el('article', '', 'component-card'); item.append(el('h3', `${f.severity.toUpperCase()}: ${f.title}`), el('p', f.evidence), el('p', f.fix));
        const locateButton = button('Locate affected components', () => {
          if (run?.snapshot.designId !== base.snapshot.designId) throw Error('The circuit changed. Build a fresh plan.');
          return locate(f.componentIds);
        }); item.append(locateButton); remaining.append(item);
      }
      if (!plan.remaining.length) remaining.append(el('p', 'No predicted static findings remain. Start or restart Simulation after applying, then Check circuit to read its current warnings. Whole-circuit correctness remains outside coverage.'));
      result.append(remaining);
      if (plan.changes.length) {
        const approval = el('label', '', 'check-row'), check = el('input'); check.id = 'correction-approve'; check.type = 'checkbox';
        approval.append(check, document.createTextNode('I reviewed these values and approve changing the open circuit.'));
        const apply = button('Apply supported corrections & recheck', async () => {
          apply.disabled = true; check.disabled = true; preview.disabled = true; value.disabled = true; correcting = true;
          $('dialog-close').disabled = true;
          let completed = 0;
          try {
            if (!check.checked || plan.blockers.length) throw Error('Review the plan and correct supply shorts first.');
            if (!canEdit() || run.provenance.designHash !== plan.baseDesignHash || run.provenance.profileHash !== plan.baseProfileHash) throw Error('The live design or rule profile changed. Recheck and build a fresh plan.');
            const library = await loadWorkspace();
            const bytes = new TextEncoder().encode(JSON.stringify(library)).byteLength;
            if (library.projects.reduce((n,p) => n+p.runs.length,0) + 2*plan.changes.length > 60 || bytes + plan.changes.length*(2*new TextEncoder().encode(JSON.stringify(base)).byteLength+8192) > MAX_BYTES) throw Error('Export and remove older reviews to make room for all before/after correction records. No changes were applied.');
            const liveTarget = { ...target };
            for (const change of plan.changes) {
              if (!canEdit() || target?.tabId !== liveTarget.tabId || target?.frameId !== liveTarget.frameId || run.provenance.profileHash !== plan.baseProfileHash) throw Error('The active editor or profile changed. Remaining corrections were stopped.');
              const current = run, c = current.snapshot.components.find(c => c.id === change.componentId);
              if (!c || c.resistance !== change.before) throw Error('A planned resistor changed. Remaining corrections were stopped.');
              await applyResistance(current, await previewResistance(current, change.componentId, change.after), false);
              completed++; error.textContent = `Applied and reread ${completed} of ${plan.changes.length} correction(s).`;
            }
            $('review-dialog').close();
            notify(`Applied ${completed} supported correction(s). Before/after reviews saved. ${correctionStatus(run.snapshot,run.profile).summary}. Restart Simulation and Check circuit; remaining wiring tasks still need attention.`);
          } catch (e) {
            error.textContent = `${completed} correction(s) completed. ${e.message} Review the actual circuit before continuing; use Tinkercad Undo or restore the last recorded value in Reviews if needed.`;
          } finally {
            correcting = false; $('dialog-close').disabled = false; value.disabled = false; preview.disabled = false; render();
          }
        }, 'primary');
        apply.id = 'apply-corrections'; apply.disabled = true;
        check.addEventListener('change', () => { apply.disabled = !check.checked || !!plan.blockers.length || !canEdit(); });
        value.addEventListener('input', () => { apply.disabled = true; check.checked = false; }, { once: true });
        result.append(approval, apply);
        if (!canEdit()) result.append(el('p', 'Open an editable circuit and stop Simulation before applying. Then recheck and build a fresh preview.', 'small muted'));
      }
      result.append(button('Return to live check', async () => { $('review-dialog').close(); await check(true); }));
      result.append(button('Export correction plan', () => download('circuit-check-correction-plan.json', plan)));
    } catch (e) { error.textContent = e.message; }
    finally { if (token === generation) preview.disabled = false; }
  };
  value.addEventListener('input', () => { generation++; result.replaceChildren(); preview.disabled = false; });
  form.addEventListener('submit', event => { event.preventDefault(); void build(); });
  await build();
}
function renderFindings() {
  const query = $('search').value.trim().toLowerCase(), stateFilter = $('review-filter').value;
  const expanded = new Set([...$('results').querySelectorAll('details[open]')].map(d=>d.dataset.finding));
  if (!run) { const empty=el('div','','empty'); empty.append(el('h3','Circuit not checked'),el('p','No circuit data is currently connected. Resolve any connection message above, then choose Check circuit, import a circuit file, or load a saved review. Finding counts remain unavailable until data is read.')); $('results').replaceChildren(empty); return; }
  const visible = run.analysis.findings.filter(f => (filter==='all'||f.severity===filter) && (stateFilter==='all'||reviewStatus(notes(),f)===stateFilter) && (!query||[f.title,f.evidence,f.rule,...f.pins,...f.componentIds].join(' ').toLowerCase().includes(query)));
  const cards = visible.slice(0,150).map(f => {
    const card=el('article','',`finding ${f.severity}`); card.dataset.findingId=f.id;
    card.append(el('span',f.severity.toUpperCase(),'badge'),el('span',f.source,'source'),el('h3',f.title));
    const category = {confirmed_connection:'Confirmed connection',simulator_report:'Simulator report',review_suggestion:'Review suggestion'}[f.category];
    card.append(el('p',category + (f.pins.length ? ' · Pins: '+f.pins.join(' · ') : '')));
    const impact=explainConsequence(f),why=el('div','','finding-consequence');why.append(el('h4','In plain language'),el('p',impact.meaning),el('b','What could happen'),el('p',impact.consequence));if(impact.uncertain)why.append(el('p','This consequence is not confirmed for the current circuit. Review the source evidence.'));card.append(why);
    const detail=el('details'); detail.dataset.finding=f.id; detail.open=expanded.has(f.id); detail.append(el('summary','Why this was flagged'),el('p',f.evidence)); card.append(detail);
    const fix=el('p','','fix'); fix.append(el('b','What to try'),document.createTextNode(f.fix)); card.append(fix);
    const state=reviewStatus(notes(),f); card.append(el('p',labelState(state),`review-state ${state}`));
    const actions=el('div','','button-row');
    for(const id of [...new Set(f.componentIds)]) { const c=run.snapshot.components.find(c=>c.id===id);const b=button('Locate '+(c?.label||id),()=>locate([id]),'locate');b.disabled=!canLocate();actions.append(b); }
    actions.append(button('Review / explain',()=>reviewDialog(f.id),'review-finding'));
    const resistor=f.componentIds.map(id=>run.snapshot.components.find(c=>c.id===id)).find(c=>c?.model.toLowerCase()==='resistor'&&c.resistance!==null);
    if(resistor){const b=button('Preview value change',()=>repairDialog(resistor.id),'repair-finding');b.disabled=!canPreview();b.title='Preview a resistor change using the workflow available for this platform.';actions.append(b);}
    card.append(actions);return card;
  });
  if(!cards.length){const empty=el('div','','empty');empty.append(el('h3',run.analysis.findings.length?'No findings in this filter':'No supported-rule findings'),el('p',run.analysis.findings.length?'Adjust the search or review-state filter.':'Review Coverage and test the circuit in Tinkercad. This does not verify the whole circuit.'));cards.push(empty);}
  if(visible.length>150)cards.push(el('p',`Showing 150 of ${visible.length}. Narrow the search to inspect more.`,'small muted'));
  $('results').replaceChildren(...cards);
}
async function locate(ids) {
  if(canLocate()&&!['wokwi','tinkercad'].includes(platformOf(run.snapshot)))throw Error('Use the component ID or visual workspace to locate this imported part.');
  if(!canLocate())throw Error('Return to the live circuit and resume checks to locate components.');
  const current=target;
  const result=await chrome.scripting.executeScript({target:{tabId:current.tabId,frameIds:[current.frameId]},world:'MAIN',func:target.platform==='wokwi'?locateWokwi:locateTinkercad,args:[ids,run.snapshot.designId]});
  const value=result[0]?.result;
  notify(value?.found ? `Outlined ${value.count||1} visible component(s) for 3 seconds.` : value?.changed ? 'The active design changed. Check circuit again.' : 'Live highlighting is unavailable for this part. Use its ID in the source editor or inspect it in the visual workspace.',!value?.found);
}
function renderCircuit() {
  if(!run){$('components').replaceChildren(el('p','Connect or load a circuit review first.','small muted'));return;}
  const query=$('component-search').value.toLowerCase();
  const matches=run.snapshot.components.filter(c=>[c.label,c.typeName,c.model,c.id].join(' ').toLowerCase().includes(query));
  const cards=matches.slice(0,100).map(c=>{
    const card=el('div','','component-card');const details=el('details');details.append(el('summary',`${c.label} · ${c.typeName||c.model||'Component'}`));
    details.append(el('p',`Model: ${c.model||'No simulation model'} · ID: ${c.id}`));
    if(c.position)details.append(el('p',`Editor position: ${c.position.x}, ${c.position.y} · ${c.position.angle}°`));
    if(c.resistance!==null)details.append(el('p',`Resistance: ${c.resistance} Ω`));
    const actions=el('div','','button-row');const b=button('Locate',()=>locate([c.id]));b.disabled=!canLocate();actions.append(b);
    if(c.model.toLowerCase()==='resistor'&&c.resistance!==null){const edit=button('Preview resistor value',()=>repairDialog(c.id));edit.disabled=!canPreview();actions.append(edit);}
    details.append(actions);
    const rows=el('div','','pins');let shown=0;
    function more(){const end=Math.min(shown+80,c.terminals.length);for(const p of c.terminals.slice(shown,end)){const row=el('div','','pin-row');row.append(el('span',p.name));if(p.net)row.append(button(p.net,()=>netDialog(p.net)));else row.append(el('span','Unconnected','muted'));rows.append(row);}shown=end;load.hidden=shown>=c.terminals.length;load.textContent=`Show more pins (${shown}/${c.terminals.length})`;}
    const load=button('Show pins',more);details.append(rows,load);details.addEventListener('toggle',()=>{if(details.open&&!shown)more();});card.append(details);return card;
  });
  if(matches.length>100)cards.push(el('p','Showing the first 100 components. Narrow the search.','small muted'));
  $('components').replaceChildren(...cards.length?cards:[el('p','No components match.','small muted')]);
}
function openDialog(title) { $('dialog-title').textContent=title;$('dialog-body').replaceChildren();if(!$('review-dialog').open)$('review-dialog').showModal();return $('dialog-body'); }
function netDialog(net) {
  const base=run;const body=openDialog('Electrical net '+net);const members=[];
  for(const c of base.snapshot.components)for(const p of c.terminals)if(p.net===net)members.push({c,p});
  body.append(el('p',`${members.length} terminal(s) share this electrical net. Breadboard strips are included.`));
  const ids=[...new Set(members.filter(({c})=>!/breadboard/i.test(c.typeName+' '+c.model)).map(({c})=>c.id))];
  const highlight=button('Highlight connected components',()=>locate(ids));highlight.disabled=!canLocate();body.append(highlight);
  const list=el('div');for(const {c,p} of members.slice(0,500))list.append(el('p',`${c.label}.${p.name}`));body.append(list);
  if(members.length>500)body.append(el('p','The first 500 terminal memberships are shown. The JSON report contains the full snapshot.','small muted'));
}
function reviewDialog(findingId) {
  const base=run,f=base?.analysis.findings.find(f=>f.id===findingId);if(!f)return;
  const body=openDialog(f.title);body.append(el('p',f.evidence,'dialog-evidence'),el('p','Suggested action: '+f.fix));
  const history=workspace.projects.find(p=>p.id===base.projectId)?.notes||[];
  body.append(el('h3','Comments and decisions','subheading'));
  for(const note of history.filter(n=>n.findingId===f.id).slice(-20)){const box=el('div','','review-note');box.append(el('small',date(note.createdAt)+' · '+note.kind+(note.evidenceHash!==f.evidenceHash?' · earlier evidence':'')),document.createTextNode(note.body));body.append(box);}
  const form=el('form');const actionLabel=el('label','Review action','field'),action=el('select');action.id='note-kind';
  for(const [value,label]of[['comment','Add comment'],['exception','Accept exception with reason'],['reviewed','Mark reviewed'],['reopen','Reopen']])action.append(option(label,value));actionLabel.append(action);
  const noteLabel=el('label','Comment or decision reason','field'),note=el('textarea');note.id='note-body';note.required=true;note.maxLength=5000;noteLabel.append(note);
  const submit=el('button','Save review note','primary');submit.type='submit';const error=el('p','','dialog-error');error.setAttribute('role','alert');
  form.append(actionLabel,noteLabel,submit,error);form.addEventListener('submit',async event=>{event.preventDefault();submit.disabled=note.disabled=action.disabled=true;try{const result=await saveNote(base,f,action.value,note.value);workspace=result.data;render();const saved=workspace.projects.find(p=>p.id===base.projectId).notes.at(-1);const box=el('div','','review-note');box.append(el('small',date(saved.createdAt)+' · '+saved.kind),document.createTextNode(saved.body));form.before(box);note.value='';error.textContent='';}catch(e){error.textContent=e.message;}finally{submit.disabled=note.disabled=action.disabled=false;}});body.append(form);
  body.append(el('h3','Evidence guide','subheading'),el('p','Answers use the selected finding’s recorded evidence and repair guidance. No AI model or cloud request is used.','small muted'));
  const guideForm=el('form'),questionLabel=el('label','Question about this finding','field'),question=el('input');question.id='guide-question';question.maxLength=2000;question.value='Why was this flagged?';questionLabel.append(question);
  const ask=el('button','Explain selected evidence');ask.type='submit';const answer=el('div','','guide-answer');answer.hidden=true;answer.setAttribute('role','status');
  const prompts=el('div','','button-row');for(const q of['Why was this flagged?','How do I fix it?','How can I verify?'])prompts.append(button(q,()=>{question.value=q;guideForm.requestSubmit();}));
  guideForm.append(questionLabel,ask);guideForm.addEventListener('submit',async event=>{event.preventDefault();ask.disabled=true;try{const reply=explainFinding(f,question.value);answer.textContent=reply.answer;answer.hidden=false;const result=await transact(data=>{const p=ensureProject(data,base.snapshot);p.explanations.push(reply);if(p.explanations.length>100)p.explanations.shift();});workspace=result.data;}catch(e){error.textContent=e.message;}finally{ask.disabled=false;}});body.append(prompts,guideForm,answer);
}
function renderCoverage() {
  if(!run){$('coverage').replaceChildren(el('p','Run a circuit check to establish coverage.','small muted'));$('provenance').textContent='No result yet.';return;}
  const rows=run.analysis.coverage.map(c=>{const row=el('div','','coverage-row');row.dataset.status=c.status;row.append(el('span',c.label),el('strong',c.status.replaceAll('_',' ')),el('small',`${c.evaluated} evaluated · ${c.findings} findings`));return row;});
  rows.push(el('p',`${run.analysis.supported}/${run.snapshot.components.length} components recognized for connection rules. ${run.analysis.ledPaths} proven LED supply paths analyzed.`,'small muted'));
  const list=el('ul','','small muted');run.analysis.limitations.forEach(l=>list.append(el('li',l)));rows.push(list);$('coverage').replaceChildren(...rows);
  $('provenance').textContent=JSON.stringify(run.provenance,null,2);
}
function renderReviews() {
  const p=project();const selected=p?.baselineId||'';$('baseline').replaceChildren(option('Choose a saved review',''),...(p?.runs||[]).map(r=>option(r.name+' · '+date(r.createdAt),r.id)));$('baseline').value=selected;
  const prior=p?.runs.find(r=>r.id===selected);
  $('comparison').replaceChildren();
  if(prior&&run){const delta=compareRuns(prior,run),counts=el('div','','comparison-counts');for(const [n,label]of[[delta.added.length,'new'],[delta.remaining.length,'remaining'],[delta.notReported.length,'not reported']]){const box=el('div');box.append(el('strong',String(n)),document.createTextNode(label));counts.append(box);}$('comparison').append(counts,el('p',delta.note));for(const [type,ids]of Object.entries(delta.components))if(ids.length)$('comparison').append(el('p',`${type}: ${ids.join(', ')}`));}
  else $('comparison').append(el('p','Save a review before making changes, then select it here to compare with the displayed result.'));
  const cards=[];
  for(const group of workspace.projects)for(const saved of [...group.runs].reverse()){
    const card=el('article','','saved-card');card.append(el('h3',saved.name),el('p',group.title+' · '+date(saved.createdAt)),el('p',`${saved.analysis.findings.length} findings · ${saved.profile.name}${saved.snapshot.imported?' · imported data':''}`));
    const actions=el('div','','button-row');actions.append(button('Load review',()=>{run=structuredClone(saved);target=null;archived=paused=true;epoch++;fingerprint='';render();notify('Loaded saved evidence. The source project was not changed.');}));
    if(group.id===run?.projectId)actions.append(button('Use as baseline',async()=>{const result=await transact(data=>{const group=data.projects.find(p=>p.id===saved.projectId);group.baselineId=saved.id;});workspace=result.data;renderReviews();}));
    actions.append(button('Remove saved review',async()=>{const result=await transact(data=>{const group=data.projects.find(p=>p.id===saved.projectId);group.runs=group.runs.filter(r=>r.id!==saved.id);if(group.baselineId===saved.id)delete group.baselineId;});workspace=result.data;renderReviews();notify('Saved review removed. Live circuit unchanged.');}));card.append(actions);cards.push(card);
  }
  $('saved-reviews').replaceChildren(...cards.length?cards:[el('p','No reviews saved yet.','small muted')]);
  const repairs=p?.repairs||[];$('repair-history').replaceChildren(...repairs.slice(-8).reverse().map(r=>el('p',`${date(r.createdAt)} · ${r.componentId}: ${r.before} Ω → ${r.after} Ω · ${r.kind||'approved change'}`,'small muted')));
  if(!repairs.length)$('repair-history').append(el('p','No approved resistor-value changes recorded for this design.','small muted'));
  const last=repairs.at(-1);$('undo-repair').disabled=!canEdit()||!last||last.before<0||last.afterDesignHash!==run?.provenance.designHash||last.restored===true;
}
function saveDialog() {
  if(!run)return;const base=run,body=openDialog('Save review snapshot');body.append(el('p','Stores this circuit’s connections, platform, findings, rule profile and provenance locally. It does not change the source project.'));
  const form=el('form'),label=el('label','Review name','field'),input=el('input');input.id='review-name';input.required=true;input.maxLength=160;input.value=base.snapshot.title+' · '+new Date().toLocaleTimeString();label.append(input);
  const submit=el('button','Save snapshot','primary');submit.type='submit';const error=el('p','','dialog-error');error.setAttribute('role','alert');form.append(label,submit,error);form.addEventListener('submit',async event=>{event.preventDefault();submit.disabled=true;try{const result=await saveRun(base,input.value);workspace=result.data;$('review-dialog').close();renderReviews();notify('Review saved locally.');}catch(e){error.textContent=e.message;submit.disabled=false;}});body.append(form);
}
function renderProfile(profile=workspace.profile) {
  $('profile-name').value=profile.name;$('profile-version').value=profile.version;$('profile-source').value=profile.source;$('profile-minimum').value=profile.minLedResistance??'';
  const field=$('rule-switches');field.replaceChildren(el('legend','Enabled checks'));
  for(const [id,label]of RULES){const row=el('label','','check-row'),input=el('input');input.type='checkbox';input.checked=profile.checks[id];input.dataset.rule=id;row.append(input,document.createTextNode(label));field.append(row);}
}
async function useProfile(profile) {
  profile=validateProfile(profile);const result=await transact(data=>{data.profile=profile;});workspace=result.data;fingerprint='';
  if(run)run=await createRun(run.snapshot,profile,{name:run.name});renderProfile();render();notify('Profile applied. Coverage and comparisons reflect the selected rules.');
}
function repairDialog(id,restore=false) {
  if(run && platformOf(run.snapshot)==='wokwi')return wokwiRepairDialog(id);
  if(!canEdit())throw Error('Open your editable live circuit, stop Simulation, and resume checks before previewing a value change.');
  const base=run,c=base.snapshot.components.find(c=>c.id===id);if(!c)throw Error('Component is unavailable.');
  const last=project()?.repairs.at(-1);const body=openDialog(restore?'Restore previous resistor value':'Preview resistor value change');
  body.append(el('p',`${c.label} currently has ${c.resistance} Ω. Select the replacement value for this specific resistor.`),el('p','Only this property can be applied automatically. Wiring repairs remain manual. No automatic change is made by previewing.','small muted'));
  const form=el('form'),label=el('label','New resistance (Ω)','field'),value=el('input');value.type='number';value.id='repair-value';value.min=restore?'0':'0.000001';value.max='1000000000';value.step='any';value.required=true;value.readOnly=restore;value.value=restore?String(last.before):'';label.append(value);
  const previewButton=el('button','Preview static rule changes','primary');previewButton.type='submit';const error=el('p','','dialog-error');error.setAttribute('role','alert');const resultBox=el('div');form.append(label,previewButton,error);body.append(form,resultBox);
  form.addEventListener('submit',async event=>{event.preventDefault();try{
    const preview=await previewResistance(base,id,Number(value.value),{restore});resultBox.replaceChildren(el('p',`${preview.before} Ω → ${preview.after} Ω`,'value-change'),el('p',preview.note),el('p',`${base.analysis.findings.filter(f=>f.rule!=='native').length} static findings before · ${preview.candidate.analysis.findings.filter(f=>f.rule!=='native').length} predicted after. Review all new and remaining findings.`));
    const apply=button('Apply approved change & recheck',async()=>{apply.disabled=true;try{await applyResistance(base,preview,restore);$('review-dialog').close();}catch(e){error.textContent=e.message;apply.disabled=false;}},'primary');resultBox.append(apply);
  }catch(e){error.textContent=e.message;}});
}
async function applyResistance(base,preview,restore) {
  if(!canEdit()||run.projectId!==base.projectId||run.provenance.designHash!==base.provenance.designHash||run.provenance.profileHash!==base.provenance.profileHash)throw Error('The displayed circuit changed after preview. Create a fresh preview.');
  // Reserve space conservatively before changing the live editor.
  const library=await loadWorkspace();
  if(library.projects.reduce((n,p)=>n+p.runs.length,0)>58 || new TextEncoder().encode(JSON.stringify(library)).byteLength + 2*new TextEncoder().encode(JSON.stringify(base)).byteLength + 4096 > MAX_BYTES)throw Error('Export and remove older reviews to make room for the before/after repair records. No change was applied.');
  const beforeSaved=await saveRun(base,'Before '+base.snapshot.components.find(c=>c.id===preview.componentId).label+' value change');workspace=beforeSaved.data;
  const liveTarget={...target};editing=true;epoch++;let changed=false;
  try{
    const result=await chrome.scripting.executeScript({target:{tabId:liveTarget.tabId,frameIds:[liveTarget.frameId]},world:'MAIN',func:readTinkercad,args:[{type:'set-resistance',componentId:preview.componentId,value:preview.after,restore,expected:base.snapshot}]});
    const fresh=result[0]?.result;if(!fresh?.edit?.applied)throw Error(fresh?.edit?.error||fresh?.error||'The change was not applied. Inspect the live circuit.');changed=true;
    run=await createRun(captureSnapshot('tinkercad',fresh),workspace.profile,{name:'After approved resistor change'});fingerprint='';
    const saved=await saveRun(run,run.name);workspace=saved.data;
    const recorded=await transact(data=>{const p=ensureProject(data,run.snapshot);p.repairs.push({id:crypto.randomUUID(),componentId:preview.componentId,before:preview.before,after:preview.after,beforeDesignHash:base.provenance.designHash,afterDesignHash:run.provenance.designHash,createdAt:new Date().toISOString(),kind:restore?'restored previous value':'approved value change',restored:restore});if(p.repairs.length>50)p.repairs.shift();});workspace=recorded.data;
    notify('The resistor value was applied and reread. Supported static checks were rerun. Restart Tinkercad Simulation to check its behavior.');
  }catch(error){if(changed)throw Error('The resistor value changed in Tinkercad, but recording the local review failed: '+error.message+'. Inspect the circuit; use Tinkercad Undo if needed.');throw error;}finally{editing=false;render();}
}
async function check(manual=false) {
  if(busy){if(manual)pendingCheck=true;return;}
  if(editing||correcting||((paused||archived)&&!manual))return;
  busy=true;const token=epoch;
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab){clear('Select a Tinkercad or Wokwi circuit tab.');return;}
    let platform=platformForUrl(tab.url),compatibleResults=null;
    if(!platform&&target?.tabId===tab.id&&$('compatible-site').checked)platform=target.platform;
    if(!platform&&manual&&$('compatible-site').checked){compatibleResults=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},world:'MAIN',func:readExtraCircuit});const match=compatibleResults.find(r=>r.result&&!r.result.error);if(['simduino','falstad'].includes(match?.result?.platform))platform=match.result.platform;} 
    if(!platform){clear(tab.url?'Open Tinkercad, Wokwi, SimDuino or Falstad, or import a desktop circuit file below.':'Allow the listed sites in extension Details → Site access, then reload the circuit tab.');return;}
    const results=compatibleResults||await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},world:'MAIN',func:platform==='wokwi'?readWokwi:platform==='tinkercad'?readTinkercad:readExtraCircuit});
    const [active]=await chrome.tabs.query({active:true,currentWindow:true});if(token!==epoch||active?.id!==tab.id)return;
    const captured=selectCapture(platform,results),newTarget={tabId:tab.id,frameId:captured.frameId,designId:captured.snapshot.designId,platform};
    const next=JSON.stringify({...captured.snapshot,capturedAt:null,profile:workspace.profile,target:newTarget});
    if(next!==fingerprint||manual){const nextRun=await createRun(captured.snapshot,workspace.profile);if(token!==epoch)return;run=nextRun;target=newTarget;archived=false;fingerprint=next;render();}
    if($('notice').textContent.startsWith('Browser detail:'))notify('');
  }catch(error){if(token===epoch){clear(String(error?.message||error).slice(0,700),'Circuit connection failed');notify('Browser detail: '+String(error?.message||error).slice(0,500),true);}}
  finally{busy=false;if(pendingCheck){pendingCheck=false;void check(true);}}
}
document.querySelectorAll('[data-view]').forEach((b,index,buttons)=>{b.addEventListener('click',()=>showView(b.dataset.view));b.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;showView(buttons[next].dataset.view);buttons[next].focus();});});
$('check').addEventListener('click',()=>{paused=archived=false;epoch++;notify('');perform(()=>check(true));});
$('pause').addEventListener('click',()=>{paused=!paused;epoch++;paintConnection();render();if(!paused)perform(()=>check(true));});
for(const id of ['search','review-filter'])$(id).addEventListener('input',renderFindings);
$('component-search').addEventListener('input',renderCircuit);
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));renderFindings();}));
for(const id of ['save-review','save-review-2'])$(id).addEventListener('click',()=>perform(saveDialog));
$('dialog-close').addEventListener('click',()=>$('review-dialog').close());
$('review-dialog').addEventListener('cancel',event=>{if(correcting)event.preventDefault();});
$('correct-circuit').addEventListener('click',()=>perform(correctionDialog));
$('open-designer').addEventListener('click',()=>perform(async()=>{
  if(!run)return;
  const capturedRun=run;
  const [currentTab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!currentTab?.id)throw Error('Select the browser tab where you want to open the visual workspace.');
  const result=await openVisualProject(capturedRun);workspace=result.data;
  const page=chrome.runtime.getManifest().side_panel.default_path.replace(/panel\.html$/,'designer.html');
  await chrome.tabs.update(currentTab.id,{url:chrome.runtime.getURL(page)+'?project='+encodeURIComponent(result.result)});
}));
$('baseline').addEventListener('change',()=>perform(async()=>{const selected=$('baseline').value;const result=await transact(data=>{ensureProject(data,run.snapshot).baselineId=selected;});workspace=result.data;renderReviews();}));
$('export').addEventListener('click',()=>{if(run)download('circuit-check-report.json',{schema:2,type:'circuit-check-review',extensionVersion:chrome.runtime.getManifest().version,frozen:paused||archived,run,notes:notes(),explanations:project()?.explanations||[],repairs:project()?.repairs||[]});});
$('export-html').addEventListener('click',()=>{if(run)download('circuit-check-report.html',reportHTML(run,notes(),project()?.explanations||[],project()?.repairs||[]),'text/html');});
$('export-library').addEventListener('click',()=>perform(async()=>{download('circuit-check-review-library.json',await loadWorkspace());notify('Review library exported.');}));
$('import-library').addEventListener('change',event=>perform(async()=>{const file=event.target.files[0];if(!file)return;try{if(file.size>MAX_BYTES)throw Error('Review import exceeds 8 MB.');let raw=JSON.parse(await file.text());if(raw.type==='circuit-check-review')raw={schema:2,projects:[{runs:[raw.run],notes:raw.notes,explanations:raw.explanations,repairs:raw.repairs}]};const result=await importWorkspace(raw);workspace=result.data;renderReviews();notify(`Imported ${result.result} review(s). Eligible visual drafts were restored; existing drafts were preserved. Imported data is historical.`);}finally{event.target.value='';}}));
$('profile-form').addEventListener('submit',event=>{event.preventDefault();perform(()=>useProfile({name:$('profile-name').value,version:$('profile-version').value,source:$('profile-source').value,checks:Object.fromEntries([...document.querySelectorAll('[data-rule]')].map(i=>[i.dataset.rule,i.checked])),minLedResistance:$('profile-minimum').value===''?null:Number($('profile-minimum').value)}));});
$('profile-reset').addEventListener('click',()=>perform(()=>useProfile(DEFAULT_PROFILE)));
$('export-profile').addEventListener('click',()=>download('circuit-check-electrical-profile.json',workspace.profile));
$('import-profile').addEventListener('change',event=>perform(async()=>{const file=event.target.files[0];if(!file)return;try{if(file.size>65536)throw Error('Profile exceeds 64 KB.');const profile=validateProfile(JSON.parse(await file.text()));renderProfile(profile);notify('Profile loaded into the form. Review it and choose Apply profile & recheck.');}finally{event.target.value='';}}));
$('undo-repair').addEventListener('click',()=>perform(()=>repairDialog(project().repairs.at(-1).componentId,true)));
$('native-app').addEventListener('click',()=>perform(()=>chrome.tabs.create({url:'http://127.0.0.1:8000/'})));
chrome.tabs.onActivated.addListener(()=>{if(archived)return;epoch++;clear('Checking the selected tab…');perform(()=>check(true));});
chrome.tabs.onUpdated.addListener((id,change)=>{if(target?.tabId===id&&(change.status==='loading'||change.url)){epoch++;clear('The page changed. Waiting for the circuit editor…');}});
chrome.tabs.onRemoved.addListener(id=>{if(target?.tabId===id){epoch++;clear('The circuit tab was closed.');}});
chrome.storage?.onChanged?.addListener((changes,area)=>{if(area==='local'&&changes[WORKSPACE_KEY]?.newValue){workspace=changes[WORKSPACE_KEY].newValue;renderFindings();renderReviews();}});
document.querySelector('.version').textContent='v'+chrome.runtime.getManifest().version;
setInterval(()=>{if(!document.hidden)check();},1600);
try{workspace=await loadWorkspace();}catch(e){notify(e.message,true);}renderProfile();renderReviews();await check();

async function wokwiCorrectionDialog() {
  if(!run?.snapshot.diagram)throw Error('Capture or open a Wokwi diagram first.');
  const base=run,body=openDialog('Preview resistor corrections');
  body.append(el('p','Build a separate diagram.json proposal for existing resistor values. Wiring, missing parts and LED polarity can be edited in the visual workspace.'));
  const form=el('form'),label=el('label','Replacement for zero or negative resistors (Ω, optional)','field'),value=el('input');
  value.type='number';value.min='0.000001';value.max='1000000000';value.step='any';value.id='correction-value';label.append(value);
  const preview=el('button','Build correction preview','primary');preview.type='submit';const result=el('div'),error=el('p','','dialog-error');error.setAttribute('role','alert');form.append(label,preview,error);body.append(form,result);
  form.addEventListener('submit',async event=>{event.preventDefault();preview.disabled=true;error.textContent='';result.replaceChildren();try{
    const plan=await buildCorrectionPlan(base,{replacementResistance:value.value.trim()===''?null:Number(value.value)});
    result.append(el('h3',plan.changes.length+' proposed value changes'),el('p','Predicted result: '+correctionStatus(plan.candidate.snapshot,base.profile).summary));
    for(const c of plan.changes)result.append(el('p',`${c.label}: ${c.before} Ω → ${c.after} Ω`));
    for(const f of plan.remaining)result.append(el('p',f.title+': '+f.fix));
    const save=button('Download proposed diagram.json',()=>download('diagram.json',exportDiagram(base.snapshot,plan.candidate.snapshot)),'primary');
    save.disabled=!plan.changes.length||!!plan.blockers.length;result.append(save,el('p','Save a copy in Wokwi, replace diagram.json with the reviewed proposal, run simulation, then check again. Supply shorts block this value-only correction export.','small muted'));
  }catch(e){error.textContent=e.message;}finally{preview.disabled=false;}});
}
function wokwiRepairDialog(id) {
  if(!canPreview())throw Error('Capture or open a Wokwi diagram first.');
  const base=run,c=base.snapshot.components.find(c=>c.id===id),body=openDialog('Preview resistor value');
  const form=el('form'),label=el('label',`${c.label}: new resistance (Ω)`,'field'),input=el('input');input.type='number';input.min='0.000001';input.max='1000000000';input.step='any';input.required=true;input.id='repair-value';label.append(input);
  const submit=el('button','Preview changes','primary');submit.type='submit';const result=el('div'),error=el('p','','dialog-error');error.setAttribute('role','alert');form.append(label,submit,error);body.append(form,result);
  form.addEventListener('submit',async event=>{event.preventDefault();error.textContent='';try{const preview=await previewResistance(base,id,Number(input.value));result.replaceChildren(el('p',`${preview.before} Ω → ${preview.after} Ω. ${preview.candidate.analysis.findings.length} predicted findings in supported checks.`),button('Download proposed diagram.json',()=>download('diagram.json',exportDiagram(base.snapshot,preview.candidate.snapshot)),'primary'),el('p','Review the file, replace diagram.json in a copy of your Wokwi project, then run simulation and check again.'));}catch(e){error.textContent=e.message;}});
}

async function openLocalDiagram(raw,name='Pasted diagram') {
  const label=$('local-project').value.trim()||'My Wokwi project';
  const snapshot=normalizeDiagram(raw,{title:label,designId:'local:'+label.slice(0,160),source:'Opened diagram.json · '+name,captureMode:'file',imported:true});
  epoch++;paused=true;archived=true;target=null;fingerprint='';run=await createRun(snapshot,workspace.profile);render();
  $('status').textContent='Frozen file review. Reopen your updated diagram using the same local project name to compare revisions.';notify('Diagram opened. This file is not connected to a live editor.');
}
$('import-diagram').addEventListener('change',event=>perform(async()=>{const file=event.target.files[0];try{if(!file)return;if(file.size>2097152)throw Error('Diagram exceeds 2 MB.');await openLocalDiagram(JSON.parse(await file.text()),file.name);}catch(e){clear('The selected diagram could not be loaded.');throw e;}finally{event.target.value='';}}));
$('check-paste').addEventListener('click',()=>perform(async()=>{try{await openLocalDiagram(JSON.parse($('diagram-text').value));}catch(e){clear('The pasted diagram could not be loaded.');throw e;}}));

async function openNativeText(text,name='Pasted circuit'){
  const platform=$('native-platform').value,label=$('native-name').value.trim()||name;
  const snapshot=importCircuit(text,platform,{title:label,designId:'local:'+label,source:name,captureMode:'file',imported:true});
  const next=await createRun(snapshot,workspace.profile);epoch++;paused=archived=true;target=null;fingerprint='';run=next;render();notify('Opened '+platformLabel(snapshot)+' file. Review Coverage before interpreting the findings.');
}
$('native-file').addEventListener('change',event=>perform(async()=>{try{const file=event.target.files[0];if(!file)return;if(file.size>2097152)throw Error('File exceeds 2 MB.');await openNativeText(await file.text(),file.name);}catch(e){clear('The circuit file could not be loaded.');throw e;}finally{event.target.value='';}}));
$('native-check').addEventListener('click',()=>perform(async()=>{try{await openNativeText($('native-text').value);}catch(e){clear('The pasted circuit could not be loaded.');throw e;}}));

$('export-source').addEventListener('click',()=>{const source=run?.snapshot.sourceDocument;if(source)download('circuit-source.'+({spice:'cir',simulide:'simu',sdf:'sdf',simduino:'json',circuitlab:'json',falstad:'txt'}[source.format]||'txt'),source.text,'text/plain;charset=utf-8');});

