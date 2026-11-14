import { platformOf } from './platforms.js';
import { analyze } from './analyzer.js';
import { validateSnapshot, createRun, stable } from './review.js';
import { correctionProfile } from './correction.js';

export const VISUAL_LIMITS = 'This is an editable connection diagram, not a simulator or a physical breadboard drawing. Proposals cover proven simple LED paths and explicitly chosen resistor values. Unknown wiring, ratings, firmware and placement need review. Wokwi proposals can be exported as diagram.json. Other simulator proposals use the figure and connection guide; supported live resistor edits are available separately in the panel.';
export const isBoard = c => /breadboard|annotation/i.test(c.model+' '+c.typeName);
const isLED = c => /^led2?$|^led_(?:red|green|blue|yellow|orange|white)$/i.test(c.model);
const point = n => typeof n === 'number' && Number.isFinite(n) && n >= 30 && n <= 1000000;
const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 1e9;
export const partHeight = c => isBoard(c) ? 110 : Math.max(130, 80+Math.ceil(c.terminals.length/2)*22);
export function arrange(snapshot) {
  // Variable-size cards: pin-heavy ICs reserve enough vertical space.
  const parts=[...snapshot.components].sort((a,b)=>Number(isBoard(a))-Number(isBoard(b)));
  const layout=[];let y=80;
  for(let i=0;i<parts.length;i+=3){const row=parts.slice(i,i+3);row.forEach((c,j)=>layout.push({id:c.id,x:80+j*310,y}));y+=Math.max(...row.map(partHeight))+110;}
  return layout;
}
function sourceLayout(snapshot) {
  // Wokwi physical coordinates are not a schematic layout. Separate cards so
  // omitted positions and tightly packed breadboard parts remain inspectable.
  if(snapshot.diagram||snapshot.sourceDocument)return arrange(snapshot);
  const fallback=new Map(arrange(snapshot).map(p=>[p.id,p]));
  const placed=snapshot.components.filter(c=>c.position);
  const minX=placed.length?Math.min(...placed.map(c=>c.position.x)):0,minY=placed.length?Math.min(...placed.map(c=>c.position.y)):0;
  return snapshot.components.map(c=>c.position?{id:c.id,x:Math.min(30000,80+(c.position.x-minX)*2),y:Math.min(30000,80+(c.position.y-minY)*2)}:fallback.get(c.id));
}
export async function newVisualDocument(run) {
  const original=await createRun(run.snapshot,run.profile,{name:run.name});
  const draft=validateSnapshot(original.snapshot,true);draft.source='Circuit Check visual draft · not simulated';draft.simulation='stopped';draft.wireCount=null;draft.components.forEach(c=>c.native=[]);
  const layout=sourceLayout(original.snapshot);
  return {schema:1,id:crypto.randomUUID(),revision:0,original,draft,originalLayout:layout,layout:structuredClone(layout),goal:'',createdAt:new Date().toISOString()};
}
export async function validateVisualDocument(raw,{imported=false}={}) {
  if(!raw||raw.schema!==1||typeof raw.id!=='string'||raw.id.length>100||!raw.original?.snapshot)throw Error('Invalid visual project.');
  const original=await createRun(raw.original.snapshot,raw.original.profile,{name:raw.original.name,imported});
  const draft=validateSnapshot(raw.draft,true);
  if(draft.platform!==original.snapshot.platform || draft.designId!==original.snapshot.designId)throw Error('Draft and source design IDs do not match.');
  draft.simulation='stopped';draft.source='Circuit Check visual draft · not simulated';draft.wireCount=null;draft.components.forEach(c=>c.native=[]);
  const layout=(items,snapshot)=>{
    if(!Array.isArray(items)||items.length>500)throw Error('Invalid visual placement data.');
    const ids=new Set(snapshot.components.map(c=>c.id)),seen=new Set();
    for(const p of items){if(!p||!ids.has(p.id)||seen.has(p.id)||!point(p.x)||!point(p.y))throw Error('Invalid or duplicate diagram position.');seen.add(p.id);}
    const fallback=arrange(snapshot);return snapshot.components.map(c=>{const p=items.find(p=>p.id===c.id)||fallback.find(p=>p.id===c.id);return{id:c.id,x:p.x,y:p.y};});
  };
  return {schema:1,id:imported?crypto.randomUUID():raw.id,revision:Number.isSafeInteger(raw.revision)&&raw.revision>=0?raw.revision:0,
    original,draft,layout:layout(raw.layout,draft),originalLayout:layout(raw.originalLayout,original.snapshot),goal:typeof raw.goal==='string'?raw.goal.slice(0,2000):'',createdAt:typeof raw.createdAt==='string'?raw.createdAt.slice(0,80):new Date().toISOString()};
}
export function draftAnalysis(doc) {
  return analyze(doc.draft,correctionProfile(doc.original.profile));
}
function finish(doc,snapshot,layout=doc.layout) {
  snapshot.capturedAt=new Date().toISOString();snapshot.simulation='stopped';snapshot.imported=true;snapshot.editable=false;snapshot.wireCount=null;
  snapshot.components.forEach(c=>c.native=[]);
  const draft=validateSnapshot(snapshot,true);draft.source='Circuit Check visual draft · not simulated';
  return {...doc,draft,layout};
}
function getPart(snapshot,id) {const c=snapshot.components.find(c=>c.id===id);if(!c)throw Error('Select an existing component.');return c;}
function getPin(c,index) {if(!Number.isInteger(index)||index<0||index>=c.terminals.length)throw Error('Select a valid pin.');return c.terminals[index];}
function uniqueNet(snapshot) {const nets=new Set(snapshot.components.flatMap(c=>c.terminals.map(p=>p.net)));let i=1;while(nets.has('draft-net-'+i))i++;return 'draft-net-'+i;}
function uniqueId(snapshot) {let i=1;while(snapshot.components.some(c=>c.id==='draft-part-'+i))i++;return 'draft-part-'+i;}
export function movePart(doc,id,x,y) {
  getPart(doc.draft,id);if(!point(x)||!point(y))throw Error('Diagram coordinates must be between 30 and 1,000,000.');
  return {...doc,layout:doc.layout.map(p=>p.id===id?{id,x,y}:p)};
}
export function connectPin(doc,id,pinIndex,targetId,targetIndex) {
  if(id===targetId&&pinIndex===targetIndex)throw Error('Choose a different target pin.');
  const s=structuredClone(doc.draft),from=getPin(getPart(s,id),pinIndex),target=getPin(getPart(s,targetId),targetIndex);
  const net=target.net||uniqueNet(s);from.net=net;target.net=net;
  return finish(doc,s);
}
export function disconnectPin(doc,id,pinIndex) {
  const s=structuredClone(doc.draft);getPin(getPart(s,id),pinIndex).net=null;return finish(doc,s);
}
export function setResistance(doc,id,value) {
  if(!positive(value))throw Error('Choose a positive resistance up to 1,000,000,000 Ω.');
  const s=structuredClone(doc.draft),c=getPart(s,id);if(!/^resistor$/i.test(c.model))throw Error('Select a resistor.');
  c.resistance=value;c.properties=c.properties.filter(p=>p.name.toLowerCase()!=='resistance');c.properties.push({name:'resistance',value:String(value),unit:'ohm',prefix:'none'});return finish(doc,s);
}
const basic=[
  {key:'basic-resistor',label:'Resistor',model:'resistor',pins:['1','2']},
  {key:'basic-led',label:'LED',model:'led2',pins:['anode','cathode']},
  {key:'basic-battery',label:'9 V battery',model:'battery9v',pins:['+','-']},
  {key:'basic-capacitor',label:'Capacitor',model:'capacitor',pins:['1','2']},
  {key:'basic-polarized',label:'Polarized capacitor',model:'capacitor_polarized',pins:['+','-']},
  {key:'basic-motor',label:'DC motor',model:'dc_motor',pins:['+','-']}
];
export function catalog(doc) {
  const choices=platformOf(doc.draft)==='wokwi' ? basic.slice(0,2).map(c=>c.key==='basic-led'?{...c,pins:['A','C']}:c) : basic;
  return [...choices.map(c=>({...c,properties:[]})),...doc.original.snapshot.components.filter(c=>!isBoard(c)).map((c,i)=>({key:'project-'+i,label:c.typeName+' · '+c.label+' (project type)',model:c.model,pins:c.terminals.map(p=>p.name),properties:structuredClone(c.properties),resistance:c.resistance}))];
}
export function replacePart(doc,id,template,mapping,{resistance=null}={}) {
  const allowed=catalog(doc).find(c=>c.key===template);if(!allowed)throw Error('Choose an available component type.');
  const s=structuredClone(doc.draft),c=getPart(s,id),used=new Set();
  if(!Array.isArray(mapping)||mapping.length!==allowed.pins.length)throw Error('Review the pin mapping for the replacement component.');
  const terminals=allowed.pins.map((name,i)=>{const old=mapping[i];if(old!==null&&(!Number.isInteger(old)||old<0||old>=c.terminals.length||used.has(old)))throw Error('Each original pin can be mapped only once.');if(old!==null)used.add(old);return{name,key:name,net:old===null?null:c.terminals[old].net,hasBreadboardPin:false};});
  if(/^resistor$/i.test(allowed.model)&&!positive(resistance))throw Error('Choose a positive value for the replacement resistor.');
  c.model=allowed.model;c.typeName=allowed.label;c.terminals=terminals;c.properties=structuredClone(allowed.properties||[]);c.resistance=/^resistor$/i.test(c.model)?resistance:null;c.nested=false;c.nativeSupported=false;
  if(c.resistance!==null){c.properties=c.properties.filter(p=>p.name.toLowerCase()!=='resistance');c.properties.push({name:'resistance',value:String(c.resistance),prefix:'none',unit:'ohm'});}
  return finish(doc,s);
}
export function addPart(doc,template,{resistance=null}={}) {
  if(doc.draft.components.length>=500)throw Error('The visual workspace supports up to 500 components.');
  const type=catalog(doc).find(c=>c.key===template);if(!type)throw Error('Choose an available component type.');
  if(/^resistor$/i.test(type.model)&&!positive(resistance))throw Error('Choose a positive value for the new resistor.');
  const s=structuredClone(doc.draft),id=uniqueId(s);
  s.components.push({id,label:type.label+' · added',typeName:type.label,model:type.model,terminals:type.pins.map(name=>({name,key:name,net:null,hasBreadboardPin:false})),
    resistance:/^resistor$/i.test(type.model)?resistance:null,properties:/^resistor$/i.test(type.model)?[{name:'resistance',value:String(resistance),prefix:'none',unit:'ohm'}]:structuredClone(type.properties||[]),native:[],nativeSupported:false,nested:false,position:null});
  const positions=arrange(s),last=positions.find(p=>p.id===id);return finish(doc,s,[...doc.layout,last]);
}
export function removePart(doc,id) {
  getPart(doc.draft,id);const s=structuredClone(doc.draft);s.components=s.components.filter(c=>c.id!==id);return finish(doc,s,doc.layout.filter(p=>p.id!==id));
}
export function improveVisual(doc,{resistance=null,forwardLED=false,arrangeParts=true}={}) {
  if(resistance!==null&&!positive(resistance))throw Error('Enter a positive resistor value or leave it empty.');
  let next=doc;const deferred=[];
  if(resistance!==null)for(const c of [...next.draft.components])if(/^resistor$/i.test(c.model)&&c.resistance!==null&&c.resistance<=0)next=setResistance(next,c.id,resistance);
  if(forwardLED)for(const f of draftAnalysis(next).findings.filter(f=>f.rule==='ledPolarity')){
    const s=structuredClone(next.draft),led=getPart(s,f.componentIds[0]);
    const a=led.terminals.find(p=>/^(anode|a)$/i.test(p.name)),k=led.terminals.find(p=>/^(cathode|c|k)$/i.test(p.name));
    if(a&&k){[a.net,k.net]=[k.net,a.net];next=finish(next,s);}
  }
  if(resistance!==null)for(const f of draftAnalysis(next).findings.filter(f=>f.rule==='ledResistance')){
    const led=next.draft.components.find(c=>c.id===f.componentIds[0]);if(!led||!isLED(led))continue;
    const anodeIndex=led.terminals.findIndex(p=>/^(anode|a)$/i.test(p.name));if(anodeIndex<0||!led.terminals[anodeIndex].net)continue;
    if(next.draft.components.length>=500){deferred.push('Component limit reached: add the LED resistor after removing an unused draft part.');continue;}
    const oldNet=led.terminals[anodeIndex].net;const added=addPart(next,'basic-resistor',{resistance});const newId=added.draft.components.at(-1).id;
    const s=structuredClone(added.draft),newNet=uniqueNet(s),part=getPart(s,newId);part.terminals[0].net=oldNet;part.terminals[1].net=newNet;getPart(s,led.id).terminals[anodeIndex].net=newNet;
    next=finish(added,s);
  }
  // Increase a proven path to the user's configured total, not every resistor.
  for(let pass=0;pass<500;pass++){
    const f=draftAnalysis(next).findings.find(f=>f.rule==='ledMinimum');if(!f)break;
    const rs=f.componentIds.map(id=>next.draft.components.find(c=>c.id===id)).filter(c=>c?.model.toLowerCase()==='resistor'&&c.resistance!==null&&c.resistance>=0);
    const total=rs.reduce((n,c)=>n+c.resistance,0),value=rs[0]?rs[0].resistance+doc.original.profile.minLedResistance-total:null;
    if(!rs.length||!positive(value)||value<=rs[0].resistance)break;next=setResistance(next,rs[0].id,value);
  }
  if(arrangeParts)next={...next,layout:arrange(next.draft)};
  return {document:next,deferred};
}
export function differences(doc) {
  const before=new Map(doc.original.snapshot.components.map(c=>[c.id,c])),after=new Map(doc.draft.components.map(c=>[c.id,c]));
  const oldPos=new Map(doc.originalLayout.map(p=>[p.id,p])),pos=new Map(doc.layout.map(p=>[p.id,p]));const out=[];
  for(const [id,c]of after){const a=before.get(id);if(!a){out.push({kind:'added',componentId:id,title:'Add '+c.label,detail:`${c.model}${c.resistance!==null?' · '+c.resistance+' Ω':''}`});continue;}
    if(a.model!==c.model)out.push({kind:'replaced',componentId:id,title:c.label+': replace component',detail:`${a.typeName||a.model} → ${c.typeName||c.model}. Check the new part’s ratings and pinout.`});
    if(a.resistance!==c.resistance)out.push({kind:'value',componentId:id,title:c.label+': change resistance',detail:`${a.resistance??'none'} Ω → ${c.resistance??'none'} Ω`});
    if(stable(a.terminals.map(p=>[p.name,p.key,p.net]))!==stable(c.terminals.map(p=>[p.name,p.key,p.net])))out.push({kind:'rewired',componentId:id,title:c.label+': revise connections',detail:c.terminals.map(p=>`${p.name} → ${p.net||'unconnected'}`).join('; ')});
    if(stable(oldPos.get(id))!==stable(pos.get(id)))out.push({kind:'layout',componentId:id,title:c.label+': move in diagram',detail:'Connection diagram placement only; actual breadboard holes and mechanical fit are not verified.'});
  }
  for(const [id,c]of before)if(!after.has(id))out.push({kind:'removed',componentId:id,title:'Remove '+c.label,detail:'Remove only if this part is not required for the intended circuit.'});
  return out;
}
export function connectionGuide(doc) {
  const nets=new Map();for(const c of doc.draft.components.filter(c=>!isBoard(c))){const names=new Map();for(const p of c.terminals)names.set(p.name,(names.get(p.name)||0)+1);for(const [index,p] of c.terminals.entries()){if(!p.net)continue;if(!nets.has(p.net))nets.set(p.net,[]);nets.get(p.net).push({componentId:c.id,component:c.label,pin:p.name+(names.get(p.name)>1?' [terminal '+(index+1)+']':''),pinIndex:index,pinKey:p.key||''});}}
  return [...nets].map(([net,pins])=>({net,pins}));
}
export function repairText(doc) {
  const analysis=draftAnalysis(doc);return ['CIRCUIT CHECK — VISUAL REPAIR GUIDE',doc.draft.title,'Source design: '+doc.original.snapshot.designId,'Source hash: '+doc.original.provenance.designHash,'',VISUAL_LIMITS,'','PROPOSED CHANGES',...differences(doc).map(d=>d.title+'\n  '+d.detail),'','PROPOSED NET CONNECTIONS',...connectionGuide(doc).map(n=>n.net+': '+n.pins.map(p=>p.component+'.'+p.pin).join(' ↔ ')),'','UNRESOLVED SUPPORTED FINDINGS',...analysis.findings.map(f=>f.severity.toUpperCase()+': '+f.title+'\n  '+f.evidence+'\n  '+f.fix),'','Original simulator faults remain unverified until the changed circuit is rebuilt and simulation restarted.',...analyze(doc.original.snapshot,correctionProfile(doc.original.profile)).findings.filter(f=>f.rule==='native').map(f=>f.title+': '+f.evidence)].join('\n');
}
