import { platformLabel, platformOf } from './platforms.js';
import { exportDiagram } from './wokwi.js';
import { analyze } from './analyzer.js';
import { correctionProfile } from './correction.js';
import { newVisualDocument, draftAnalysis, differences, connectionGuide, repairText, catalog, movePart, connectPin, disconnectPin, setResistance, replacePart, addPart, removePart, improveVisual, arrange, VISUAL_LIMITS } from './visual-model.js';
import { renderDiagram, renderRepairSheet, rasterDimensions } from './visual-svg.js';
import { loadVisualProject, saveVisualProject } from './visual-storage.js';
const $=id=>document.getElementById(id);
const node=(tag,text='',className='')=>{const n=document.createElement(tag);n.textContent=text;if(className)n.className=className;return n;};
const option=(text,value)=>{const n=node('option',text);n.value=String(value);return n;};
const action=(text,fn)=>{const b=node('button',text);b.type='button';b.addEventListener('click',()=>perform(fn));return b;};
const notice=(text,error=false)=>{$('notice').textContent=text;$('notice').style.color=error?'#9c2636':'#315b50';};
async function perform(fn){try{return await fn();}catch(e){notice(String(e.message||e),true);}}
const projectId=new URL(location.href).searchParams.get('project');
let doc=null,selected=null,latestSource=null,revision=0,sequence=0,savedSequence=0,queue=Promise.resolve(),blocked=false;
let past=[],future=[],focus=false,inspected=null,shownFindings=100,shownChanges=150;
const part=()=>doc?.draft.components.find(c=>c.id===selected);
function download(name,body,mime){const a=node('a'),url=URL.createObjectURL(new Blob([body],{type:mime}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function persist(){
  if(!doc)return queue;if(blocked){notice('Export your unsaved draft, then reload this workspace to resolve the other-window conflict.',true);return queue;}const captured=doc,token=sequence;
  $('save-state').textContent='Saving local draft…';
  queue=queue.then(async()=>{
    if(blocked)return;
    try{const result=await saveVisualProject(projectId,captured,revision);revision=result.result;savedSequence=token;
      if(token===sequence)$('save-state').textContent='Saved on this device · revision '+revision;
    }catch(e){if(/another window/.test(e.message))blocked=true;$('save-state').textContent='Unsaved changes · export a backup';notice(e.message,true);}
  });return queue;
}
function commit(next,message='Draft updated. The Wokwi design was not changed.'){
  if(!next||next===doc)return;past.push(doc);if(past.length>30)past.shift();future=[];doc=next;sequence++;
  if(!part())selected=doc.draft.components[0]?.id||null;render();notice(message);void persist();
}
function select(id,bringIntoFocus=false){if(!doc?.draft.components.some(c=>c.id===id))return;selected=id;if(bringIntoFocus)focus=true;renderInspector();renderDiagrams(!bringIntoFocus);}
function renderSelect(){
  const q=$('part-search').value.toLowerCase(),all=doc.draft.components;
  const matches=all.filter(c=>[c.label,c.typeName,c.model,c.id,...c.terminals.map(p=>p.name)].join(' ').toLowerCase().includes(q));
  const chosen=part();if(chosen&&!matches.some(c=>c.id===chosen.id))matches.unshift(chosen);
  $('selected-part').replaceChildren(...matches.map(c=>option(c.label+' · '+(c.typeName||c.model),c.id)));$('selected-part').value=selected||'';
}
function renderInspector(){
  renderSelect();const c=part(),p=doc.layout.find(p=>p.id===selected),types=catalog(doc);
  $('part-info').textContent=c?`${c.id} · ${c.model||'Unknown model'} · ${c.terminals.length} pins. Inspect all pins even when a model has no automatic checks.`:'Select or add a component.';
  for(const id of ['placement-form','connection-form','replace-form'])$(id).hidden=!c;
  for(const id of ['disconnect','remove-part','focus-part'])$(id).disabled=!c;
  $('resistance-form').hidden=!c||!/^resistor$/i.test(c.model);
  if(c){$('position-x').value=String(p?.x||80);$('position-y').value=String(p?.y||80);$('part-resistance').value=c.resistance===null?'':String(c.resistance);
    $('source-pin').replaceChildren(...c.terminals.map((p,i)=>option((i+1)+'. '+p.name+' · '+(p.net||'unconnected'),i)));
    const oldTarget=$('target-part').value; $('target-part').replaceChildren(...doc.draft.components.map(c=>option(c.label,c.id)));$('target-part').value=doc.draft.components.some(c=>c.id===oldTarget)?oldTarget:(doc.draft.components.find(p=>p.id!==c.id)?.id||c.id);renderTargetPins();
    const oldType=$('replacement-type').value; $('replacement-type').replaceChildren(...types.map(t=>option(t.label,t.key)));
    $('replacement-type').value=inspected===c.id&&types.some(t=>t.key===oldType)?oldType:(types.find(t=>t.model.toLowerCase()===c.model.toLowerCase())?.key||types[0].key);inspected=c.id;renderMapping();
    const memberships=c.terminals.slice(0,100).map((p,i)=>node('p',`${i+1}. ${p.name}: ${p.net||'unconnected'}`));
    if(c.terminals.length>100)memberships.push(node('p',`First 100 memberships shown here. The source-pin selector and JSON contain all ${c.terminals.length} pins.`));$('pin-memberships').replaceChildren(...memberships);
  }else{$('pin-memberships').replaceChildren();inspected=null;}
  const oldAdd=$('add-type').value;$('add-type').replaceChildren(...types.map(t=>option(t.label,t.key)));$('add-type').value=types.some(t=>t.key===oldAdd)?oldAdd:types[0].key;renderAddValue();
}
function renderTargetPins(){const c=doc.draft.components.find(c=>c.id===$('target-part').value);$('target-pin').replaceChildren(...(c?.terminals||[]).map((p,i)=>option((i+1)+'. '+p.name+' · '+(p.net||'unconnected'),i)));}
function renderMapping(){
  const c=part(),type=catalog(doc).find(t=>t.key===$('replacement-type').value);if(!c||!type)return;
  const used=new Set();const rows=type.pins.map((name,i)=>{const label=node('label','New '+name+' takes original pin'),select=node('select');select.dataset.mapping=String(i);select.append(option('Leave unconnected',''),...c.terminals.map((p,j)=>option(p.name+' · '+(p.net||'unconnected'),j)));
    const found=c.terminals.findIndex((p,index)=>p.name===name&&!used.has(index));if(found>=0)used.add(found);select.value=found<0?'':String(found);label.append(select);return label;});
  $('pin-mapping').replaceChildren(...rows);$('replacement-r-label').hidden=!/^resistor$/i.test(type.model);$('replacement-resistance').required=!$('replacement-r-label').hidden;$('replacement-resistance').value=c.resistance===null?'':String(c.resistance);
}
function renderAddValue(){const type=catalog(doc).find(t=>t.key===$('add-type').value);$('add-r-label').hidden=!/^resistor$/i.test(type?.model||'');$('add-resistance').required=!$('add-r-label').hidden;}
function renderDiagrams(preserveView=false){
  const beforeBox=preserveView?$('before-diagram').querySelector('svg')?.getAttribute('viewBox'):null,afterBox=preserveView?$('after-diagram').querySelector('svg')?.getAttribute('viewBox'):null;
  const changes=differences(doc),original=analyze(doc.original.snapshot,correctionProfile(doc.original.profile)),current=draftAnalysis(doc);
  // Only renderer-produced, XML-escaped SVG is assigned to these two hosts.
  $('before-diagram').innerHTML=renderDiagram(doc.original.snapshot,doc.originalLayout,{title:'Captured original — '+doc.original.snapshot.title,selectedId:selected,analysis:original,focus});
  $('after-diagram').innerHTML=renderDiagram(doc.draft,doc.layout,{title:'Proposed circuit — '+doc.draft.title,selectedId:selected,analysis:current,changes,interactive:true,focus});
  if(beforeBox)$('before-diagram').querySelector('svg')?.setAttribute('viewBox',beforeBox);if(afterBox)$('after-diagram').querySelector('svg')?.setAttribute('viewBox',afterBox);
}
function renderGuide(){
  const q=$('net-search').value.toLowerCase(),nets=connectionGuide(doc).filter(n=>[n.net,...n.pins.map(p=>p.component+'.'+p.pin)].join(' ').toLowerCase().includes(q));
  const items=nets.slice(0,150).map(n=>{const item=node('div','','net-item');item.append(node('strong',n.net),node('p',n.pins.map(p=>p.component+'.'+p.pin).join(' ↔ ')));for(const id of [...new Set(n.pins.map(p=>p.componentId))].slice(0,8)){const c=doc.draft.components.find(c=>c.id===id);item.append(action('Inspect '+c.label,()=>select(id,true)));}return item;});
  if(nets.length>150)items.push(node('p',`Showing 150 of ${nets.length} matching nets. Refine search; the exported guide includes all nets.`,'hint'));if(!nets.length)items.push(node('p','No matching assigned nets.','hint'));$('net-guide').replaceChildren(...items);
}
function render(){
  if(!doc)return;$('export-wokwi').hidden=platformOf(doc.draft)!=='wokwi';if(!part())selected=doc.draft.components[0]?.id||null;$('project-name').textContent=doc.draft.title;$('goal').value=doc.goal;$('undo').disabled=!past.length;$('redo').disabled=!future.length;
  $('before-count').textContent=doc.original.snapshot.components.length+' parts';$('after-count').textContent=doc.draft.components.length+' parts';
  const analysis=draftAnalysis(doc),errors=analysis.findings.filter(f=>f.severity==='error').length,warnings=analysis.findings.filter(f=>f.severity==='warning').length;
  $('result-summary').textContent=`${errors} errors · ${warnings} warnings in supported static checks`;
  $('result-scope').textContent=`${analysis.supported}/${doc.draft.components.length} components recognized by static rules. All ${doc.draft.components.length} components are retained in the diagram until you explicitly add, replace or remove one. All supported rules are enabled. Zero findings does not verify project function or part suitability.`;
  const native=analyze(doc.original.snapshot,correctionProfile(doc.original.profile)).findings.filter(f=>f.rule==='native');
  $('native-pending').textContent=platformOf(doc.draft)!=='tinkercad' ? platformLabel(doc.draft)+' simulator diagnostics are not read. Use the exported proposal or connection guide and verify behavior in the original simulator.' : `${native.length} original Tinkercad simulator finding(s) remain unverified. Rebuild the reviewed proposal in Tinkercad and restart simulation.`;
  $('source-info').textContent=`${doc.original.snapshot.source} · ${new Date(doc.original.snapshot.capturedAt).toLocaleString()}. This workspace uses a captured source, not a live simulator.`;
  $('source-hash').textContent='SHA-256 source: '+doc.original.provenance.designHash;$('load-latest').hidden=!latestSource;
  const changes=differences(doc),changeNodes=changes.slice(0,shownChanges).map(d=>{const item=node('article','','change-item');item.append(node('span',d.kind,'kind'),node('h3',d.title),node('p',d.detail));if(doc.draft.components.some(c=>c.id===d.componentId))item.append(action('Show in figure',()=>select(d.componentId,true)));return item;});
  if(!changes.length)changeNodes.push(node('p','The draft matches the captured project. Generate supported improvements or edit a selected part.','hint'));if(changes.length>shownChanges)changeNodes.push(action(`Show more changes (${changes.length-shownChanges} remaining)`,()=>{shownChanges+=150;render();}));$('changes').replaceChildren(...changeNodes);
  const findings=[...analysis.findings,...native.map(f=>({...f,title:'Simulation not reverified: '+f.title}))];const items=findings.slice(0,shownFindings).map(f=>{const item=node('article','',`decision-item ${f.severity}`);item.append(node('span',f.severity,'kind'),node('h3',f.title),node('p',f.evidence),node('p',f.fix));for(const id of f.componentIds){const c=doc.draft.components.find(c=>c.id===id);if(c)item.append(action('Inspect '+c.label,()=>select(id,true)));}return item;});
  if(!findings.length)items.push(node('p','No supported static findings remain. Simulation, intended function, component ratings and physical placement still require verification.','hint'));if(findings.length>shownFindings)items.push(action('Show more unresolved findings',()=>{shownFindings+=100;render();}));$('unresolved').replaceChildren(...items);
  renderInspector();renderDiagrams();renderGuide();
}
function submit(id,fn){$(id).addEventListener('submit',event=>{event.preventDefault();void perform(fn);});}
$('part-search').addEventListener('input',()=>{if(doc)renderSelect();});$('selected-part').addEventListener('change',()=>select($('selected-part').value,true));
$('target-part').addEventListener('change',renderTargetPins);$('replacement-type').addEventListener('change',renderMapping);$('add-type').addEventListener('change',renderAddValue);$('net-search').addEventListener('input',()=>{if(doc)renderGuide();});
$('goal').addEventListener('change',()=>{if(doc)commit({...doc,goal:$('goal').value.slice(0,2000)},'Project-purpose note saved with the draft.');});
submit('placement-form',()=>commit(movePart(doc,selected,Number($('position-x').value),Number($('position-y').value))));
submit('resistance-form',()=>commit(setResistance(doc,selected,Number($('part-resistance').value))));
submit('connection-form',()=>commit(connectPin(doc,selected,Number($('source-pin').value),$('target-part').value,Number($('target-pin').value))));
$('disconnect').addEventListener('click',()=>perform(()=>commit(disconnectPin(doc,selected,Number($('source-pin').value)))));
submit('replace-form',()=>{const mapping=[...$('pin-mapping').querySelectorAll('select')].map(s=>s.value===''?null:Number(s.value));commit(replacePart(doc,selected,$('replacement-type').value,mapping,{resistance:$('replacement-resistance').value===''?null:Number($('replacement-resistance').value)}));});
submit('add-form',()=>{const next=addPart(doc,$('add-type').value,{resistance:$('add-resistance').value===''?null:Number($('add-resistance').value)});selected=next.draft.components.at(-1).id;focus=true;commit(next,'Component added to the draft. Connect its pins in the inspector.');});
$('remove-part').addEventListener('click',()=>perform(()=>commit(removePart(doc,selected))));
$('improve').addEventListener('click',()=>perform(()=>{const resistance=$('suggested-resistance').value===''?null:Number($('suggested-resistance').value);const result=improveVisual({...doc,goal:$('goal').value.slice(0,2000)},{resistance,forwardLED:$('forward-led').checked,arrangeParts:$('arrange-parts').checked});focus=false;commit(result.document,'Generated a proposal for this entire project. Review changed pins and unresolved findings. '+result.deferred.join(' '));}));
$('arrange').addEventListener('click',()=>perform(()=>{focus=false;commit({...doc,layout:arrange(doc.draft)},'Arranged the connection diagram. Physical Wokwi placement is unchanged.');}));
$('undo').addEventListener('click',()=>{if(!past.length)return;future.push(doc);doc=past.pop();sequence++;render();void persist();});$('redo').addEventListener('click',()=>{if(!future.length)return;past.push(doc);doc=future.pop();sequence++;render();void persist();});
$('reset').addEventListener('click',()=>perform(async()=>{const next=await newVisualDocument(doc.original);next.id=doc.id;commit(next,'Reset the draft to its captured source. Undo can restore your previous changes.');}));
$('load-latest').addEventListener('click',()=>perform(async()=>{if(!latestSource)return;const next=await newVisualDocument(latestSource);next.id=doc.id;latestSource=null;commit(next,'Started a draft from the newer source. Undo retains the previous proposal.');}));
$('focus-part').addEventListener('click',()=>{focus=true;renderDiagrams();});$('fit').addEventListener('click',()=>{focus=false;renderDiagrams();});
function zoom(scale){for(const id of ['before-diagram','after-diagram']){const svg=$(id).querySelector('svg');if(!svg)continue;const b=svg.viewBox.baseVal,w=Math.max(120,Math.min(1000000,b.width*scale)),h=Math.max(100,Math.min(1000000,b.height*scale));svg.setAttribute('viewBox',`${b.x+(b.width-w)/2} ${b.y+(b.height-h)/2} ${w} ${h}`);}}
$('zoom-in').addEventListener('click',()=>zoom(.7));$('zoom-out').addEventListener('click',()=>zoom(1/.7));
$('save-now').addEventListener('click',()=>perform(()=>persist()));
$('export-wokwi').addEventListener('click',()=>perform(()=>{download('diagram.json',JSON.stringify(exportDiagram(doc.original.snapshot,doc.draft),null,2),'application/json');notice('Exported diagram.json. Save a copy of your Wokwi project, replace its diagram.json with this file, then run simulation and check again.');}));
$('export-json').addEventListener('click',()=>perform(()=>download('circuit-check-visual-draft.json',JSON.stringify({schema:1,type:'circuit-check-visual-project',document:doc,changes:differences(doc),analysis:draftAnalysis(doc),connections:connectionGuide(doc),limits:VISUAL_LIMITS},null,2),'application/json')));
$('export-guide').addEventListener('click',()=>perform(()=>download('circuit-check-connection-guide.txt',repairText(doc),'text/plain;charset=utf-8')));
$('export-svg').addEventListener('click',()=>perform(()=>download('circuit-check-annotated-repair.svg',renderRepairSheet(doc),'image/svg+xml')));
$('export-png').addEventListener('click',()=>perform(async()=>{
  const button=$('export-png');button.disabled=true;const url=URL.createObjectURL(new Blob([renderRepairSheet(doc)],{type:'image/svg+xml'}));
  try{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Could not render this figure. Download the SVG version instead.'));image.src=url;});
    const size=rasterDimensions(image.naturalWidth,image.naturalHeight),canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image export is unavailable; download the SVG figure instead.');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size.width,size.height);ctx.drawImage(image,0,0,size.width,size.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('PNG export could not complete. Download the SVG figure instead.');download('circuit-check-annotated-repair.png',blob,'image/png');notice(`Exported ${size.width} × ${size.height} PNG image. Use SVG for fully zoomable labels on large projects.`);
  }finally{URL.revokeObjectURL(url);button.disabled=false;}
}));
// Diagram interactions use delegated handlers so every rerender remains editable.
for(const id of ['before-diagram','after-diagram'])$(id).addEventListener('click',event=>{const g=event.target.closest('[data-component-id]');if(g)select(g.dataset.componentId,false);});
$('after-diagram').addEventListener('keydown',event=>{const g=event.target.closest('[data-component-id]');if(!g)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();select(g.dataset.componentId,false);return;}const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!delta)return;event.preventDefault();const p=doc.layout.find(p=>p.id===g.dataset.componentId),step=event.shiftKey?50:10;selected=p.id;perform(()=>commit(movePart(doc,p.id,Math.max(30,p.x+delta[0]*step),Math.max(30,p.y+delta[1]*step))));const replacement=[...$('after-diagram').querySelectorAll('[data-component-id]')].find(n=>n.dataset.componentId===selected);replacement?.focus();});
let drag=null;
function world(svg,event){return new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());}
$('after-diagram').addEventListener('pointerdown',event=>{if(event.button!==0)return;const g=event.target.closest('[data-component-id]'),svg=event.target.closest('svg');if(!g||!svg)return;const p=doc.layout.find(p=>p.id===g.dataset.componentId);drag={id:p.id,start:world(svg,event),position:{...p},svg,g,pointer:event.pointerId,moved:false};$('after-diagram').setPointerCapture(event.pointerId);});
$('after-diagram').addEventListener('pointermove',event=>{if(!drag||drag.pointer!==event.pointerId)return;const p=world(drag.svg,event),x=Math.max(30,Math.min(1000000,drag.position.x+p.x-drag.start.x)),y=Math.max(30,Math.min(1000000,drag.position.y+p.y-drag.start.y));drag.next={x,y};drag.moved=Math.abs(x-drag.position.x)+Math.abs(y-drag.position.y)>3;if(drag.moved)drag.g.setAttribute('transform',`translate(${x} ${y})`);});
$('after-diagram').addEventListener('pointerup',event=>{if(!drag||drag.pointer!==event.pointerId)return;const d=drag;drag=null;if(d.moved){selected=d.id;perform(()=>commit(movePart(doc,d.id,d.next.x,d.next.y)));}});
$('after-diagram').addEventListener('pointercancel',()=>{drag=null;if(doc)renderDiagrams();});
window.addEventListener('beforeunload',event=>{if(sequence!==savedSequence){event.preventDefault();event.returnValue='';}});
$('version').textContent='v'+chrome.runtime.getManifest().version;$('limits').textContent=VISUAL_LIMITS;
for(const b of document.querySelectorAll('button'))b.disabled=true;
try{const loaded=await loadVisualProject(projectId);doc=loaded.document;latestSource=loaded.latestSource;revision=doc.revision;selected=doc.draft.components[0]?.id||null;for(const b of document.querySelectorAll('button'))b.disabled=false;render();$('save-state').textContent='Saved on this device · revision '+revision;if(latestSource)notice('A newer circuit capture is available. Your existing visual draft was preserved; use Source and coverage to start from the newer capture.');}catch(e){notice(e.message,true);$('project-name').textContent='No captured project';$('save-state').textContent='Open the visual workspace from the extension panel.';}
