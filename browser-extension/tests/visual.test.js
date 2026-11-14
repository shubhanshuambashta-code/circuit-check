import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../extension/review.js';
import {DEFAULT_PROFILE} from '../extension/profiles.js';
import {newVisualDocument,validateVisualDocument,draftAnalysis,arrange,partHeight,movePart,connectPin,disconnectPin,replacePart,addPart,removePart,improveVisual,differences,connectionGuide,repairText} from '../extension/visual-model.js';
import {renderDiagram,renderRepairSheet,rasterDimensions} from '../extension/visual-svg.js';
const c=(id,model,pins,extra={})=>({id,label:id,model,typeName:model,terminals:pins.map(([name,net])=>({name,net})),properties:[],native:[],resistance:null,...extra});
const source=()=>({schema:1,designId:'visual-project',title:'Full project',source:'Test fixture',editable:true,simulation:'stopped',wireCount:4,components:[c('B1','battery9v',[['+','positive'],['-','return']]),c('D1','led2',[['anode','return'],['cathode','positive']])]});
const document=async(raw=source(),p=DEFAULT_PROFILE)=>newVisualDocument(await createRun(raw,p));
test('visual draft preserves all project components, including unknown ICs, and does not mutate the captured source',async()=>{
 const raw=source();raw.components.push(c('U1','customIC',[['VCC','positive'],['GND','return'],['OUT','signal']]));const original=structuredClone(raw),doc=await document(raw);
 assert.equal(doc.draft.components.length,3);assert.deepEqual(raw,original);assert.equal(doc.draft.imported,true);assert.equal(doc.draft.editable,false);assert.equal(doc.draft.wireCount,null);assert.equal(doc.original.snapshot.editable,true);
 const svg=renderDiagram(doc.draft,doc.layout);for(const id of ['B1','D1','U1'])assert.ok(svg.includes('data-component-id="'+id+'"'));
});
test('moving one selected pin leaves all other members of the old net connected',async()=>{
 const raw=source();raw.components.push(c('U1','custom',[['x','return'],['y','signal']]));const doc=await document(raw),next=connectPin(doc,'D1',0,'U1',1);
 assert.equal(next.draft.components[1].terminals[0].net,'signal');assert.equal(next.draft.components[0].terminals[1].net,'return');assert.equal(next.draft.components[2].terminals[0].net,'return');assert.equal(doc.draft.components[1].terminals[0].net,'return');
 assert.ok(differences(next).some(d=>d.kind==='rewired'&&d.componentId==='D1'));
});
test('connecting two unassigned pins creates a unique net; disconnect is explicit and index-based',async()=>{
 const raw=source();raw.components.push(c('__proto__','custom',[['same',null],['same',null],['z','draft-net-1']]));let doc=await document(raw);doc=connectPin(doc,'__proto__',0,'__proto__',1);
 assert.equal(doc.draft.components[2].terminals[0].net,'draft-net-2');assert.equal(doc.draft.components[2].terminals[1].net,'draft-net-2');
 doc=disconnectPin(doc,'__proto__',0);assert.equal(doc.draft.components[2].terminals[0].net,null);assert.equal(doc.draft.components[2].terminals[1].net,'draft-net-2');
 assert.throws(()=>connectPin(doc,'D1',0,'D1',0),/different target/);assert.throws(()=>disconnectPin(doc,'D1',999),/valid pin/);
});
test('replacement requires an explicit valid pin mapping and preserves unrelated components',async()=>{
 const doc=await document(),next=replacePart(doc,'D1','basic-resistor',[1,null],{resistance:330});
 assert.equal(next.draft.components[1].model,'resistor');assert.equal(next.draft.components[1].resistance,330);assert.equal(next.draft.components[1].terminals[0].net,'positive');assert.equal(next.draft.components[1].terminals[1].net,null);assert.deepEqual(next.draft.components[0],doc.draft.components[0]);
 assert.throws(()=>replacePart(doc,'D1','basic-led',[0,0]),/only once/);assert.throws(()=>replacePart(doc,'D1','basic-led',[0]),/pin mapping/);assert.throws(()=>replacePart(doc,'D1','basic-resistor',[0,1],{resistance:0}),/positive/);
});
test('project-specific component types retain their actual pin names for replacement mapping',async()=>{
 const raw=source();raw.components.push(c('U1','specialController',[['RESET','reset'],['VCC','positive'],['GND','return']]));const doc=await document(raw),next=replacePart(doc,'D1','project-2',[null,1,0]);
 assert.deepEqual(next.draft.components[1].terminals.map(p=>p.name),['RESET','VCC','GND']);assert.equal(next.draft.components[1].terminals[0].net,null);assert.equal(next.draft.components[1].model,'specialController');
});
test('missing parts are added with new IDs and open pins; removal is confined to the draft',async()=>{
 const doc=await document(),next=addPart(doc,'basic-resistor',{resistance:220});assert.equal(next.draft.components.length,3);assert.equal(doc.draft.components.length,2);assert.equal(next.draft.components[2].id,'draft-part-1');assert.ok(next.draft.components[2].terminals.every(p=>p.net===null));assert.equal(next.layout.length,3);
 const removed=removePart(next,'B1');assert.equal(removed.draft.components.length,2);assert.ok(differences(removed).some(d=>d.kind==='removed'&&d.componentId==='B1'));assert.equal(doc.original.snapshot.components.length,2);
});
test('automatic visual improvements reverse a proven LED and insert a chosen series resistor in the full project',async()=>{
 const doc=await document(),before=structuredClone(doc);const {document:next}=improveVisual(doc,{resistance:470,forwardLED:true});
 assert.deepEqual(doc,before);assert.equal(next.draft.components.length,3);assert.equal(draftAnalysis(next).findings.length,0);assert.equal(next.draft.components[2].resistance,470);assert.ok(differences(next).some(d=>d.kind==='added'));assert.ok(differences(next).some(d=>d.kind==='rewired'));
 const connections=connectionGuide(next);assert.ok(connections.some(n=>n.pins.some(p=>p.componentId==='B1'&&p.pin==='+')&&n.pins.some(p=>p.componentId==='draft-part-1')));
});
test('an LED reversal is never assumed when the forward-operation choice is absent',async()=>{
 const next=improveVisual(await document(),{resistance:470}).document;assert.ok(draftAnalysis(next).findings.some(f=>f.rule==='ledPolarity'));assert.equal(next.draft.components[2].terminals[0].net,'return');assert.equal(next.draft.components[2].terminals[1].net,next.draft.components[1].terminals[0].net);
});
test('no universal resistor is guessed and ambiguous complex paths are left for review',async()=>{
 const doc=await document(),next=improveVisual(doc,{forwardLED:true}).document;assert.equal(next.draft.components.length,2);assert.ok(draftAnalysis(next).findings.some(f=>f.rule==='ledResistance'));
 const raw=source();raw.components[1].terminals[0].net='mid';raw.components.push(c('U1','unknown',[['a','mid'],['b','return']]));const complex=improveVisual(await document(raw),{resistance:470,forwardLED:true}).document;
 assert.equal(complex.draft.components.length,3);assert.equal(complex.draft.components[2].model,'unknown');assert.equal(draftAnalysis(complex).ledPaths,0);
});
test('a supply short remains visible rather than being hidden by a fabricated corrected connection',async()=>{
 const raw=source();raw.components[0].terminals[1].net='positive';const next=improveVisual(await document(raw),{resistance:470,forwardLED:true}).document;assert.ok(draftAnalysis(next).findings.some(f=>f.rule==='supplyShort'));
});
test('a corrected LED path remains evaluated when many other components share the recognized supply rails',async()=>{
 const raw=source();raw.components.push(c('U1','unknownIC',[['VCC','positive'],['GND','return'],['signal','out']]));
 const next=improveVisual(await document(raw),{resistance:470,forwardLED:true}).document;
 assert.equal(next.draft.components.length,4);assert.equal(next.draft.components[2].model,'unknownIC');assert.equal(draftAnalysis(next).ledPaths,1);assert.ok(draftAnalysis(next).coverage.some(c=>c.id==='ledPolarity'&&c.status==='evaluated'));assert.equal(draftAnalysis(next).findings.length,0);
});
test('configured resistance minimums are totals along a proven path',async()=>{
 const raw=source();raw.components[1].terminals=[{name:'anode',net:'mid'},{name:'cathode',net:'return'}];raw.components.push(c('R1','resistor',[['1','positive'],['2','mid']],{resistance:100}));const p={...structuredClone(DEFAULT_PROFILE),minLedResistance:330};const next=improveVisual(await document(raw,p),{}).document;assert.equal(next.draft.components[2].resistance,330);assert.equal(draftAnalysis(next).findings.length,0);
});
test('placement changes affect diagram positions only and variable-sized cards arrange without overlap',async()=>{
 const raw=source();for(let i=0;i<30;i++)raw.components.push(c('U'+i,'customIC',Array.from({length:i*2+2},(_,n)=>['p'+n,'net'+n])));const doc=await document(raw),layout=arrange(doc.draft),byId=new Map(doc.draft.components.map(c=>[c.id,c]));
 for(let i=0;i<layout.length;i++)for(let j=i+1;j<layout.length;j++){const a=layout[i],b=layout[j];assert.ok(a.x+200<=b.x||b.x+200<=a.x||a.y+partHeight(byId.get(a.id))<=b.y||b.y+partHeight(byId.get(b.id))<=a.y);}
 const moved=movePart(doc,'B1',150,300);assert.deepEqual(moved.draft,doc.draft);assert.ok(differences(moved).some(d=>d.kind==='layout'));assert.throws(()=>movePart(doc,'B1',NaN,300),/coordinates/);assert.throws(()=>movePart(doc,'B1',-1,300),/coordinates/);
});
test('all components and non-breadboard pins are represented; breadboard aliases are explicitly collapsed',async()=>{
 const raw=source();raw.components.push(c('U1','chip',Array.from({length:70},(_,i)=>['pin-'+i,'net-'+i])));raw.components.push(c('BB','breadboard',Array.from({length:10000},(_,i)=>['hole-'+i,'positive'])));
 const doc=await document(raw),svg=renderDiagram(doc.draft,arrange(doc.draft));assert.equal((svg.match(/data-component-id=/g)||[]).length,4);assert.ok(svg.includes('pin-69'));assert.ok(svg.includes('10000 holes/pins'));assert.ok(svg.length<100000);
});
test('exported figure and guide retain proposed connections, unresolved warnings and original native faults even if review rules disabled',async()=>{
 const raw=source();raw.simulation='running';raw.components[1].native=[{kind:'breakdown',reason:'Overcurrent fixture'}];const p=structuredClone(DEFAULT_PROFILE);p.checks.native=false;const doc=await document(raw,p);
 const svg=renderRepairSheet(doc),guide=repairText(doc);assert.match(svg,/UNRESOLVED SUPPORTED FINDINGS/);assert.match(svg,/EXACT PROPOSED CONNECTION GROUPS/);assert.match(svg,/Overcurrent fixture/);assert.match(guide,/Overcurrent fixture/);assert.match(svg,/Not simulated/);assert.match(svg,/Source SHA-256/);assert.ok(connectionGuide(doc).some(n=>n.net==='positive'));
});
test('untrusted labels, model names and net identifiers cannot create SVG script or external resources',async()=>{
 const raw=source();raw.title='</text><script>alert(1)</script>';raw.components[0].label='" onload="x<foreignObject>';raw.components[0].terminals[0].net='<script>net</script>';const doc=await document(raw),svg=renderRepairSheet(doc);
 assert.ok(!/<script|<foreignObject/i.test(svg));const tagSyntax=[...svg.matchAll(/<[^>]+>/g)].map(m=>m[0].replace(/"[^"]*"/g,'""')).join('');assert.ok(!/\sonload=|\shref=/i.test(tagSyntax));assert.ok(svg.includes('&lt;script&gt;'));assert.ok(svg.includes('&quot;'));assert.ok(!svg.includes('undefined'));assert.ok(!svg.includes('NaN'));
});
test('visual import validation recomputes source findings and rejects duplicate placements or a different design',async()=>{
 const raw=await document();raw.original.analysis.findings=[];const validated=await validateVisualDocument(raw,{imported:true});assert.ok(validated.original.analysis.findings.length);assert.equal(validated.original.snapshot.imported,true);assert.notEqual(validated.id,raw.id);
 const duplicate=structuredClone(raw);duplicate.layout.push(duplicate.layout[0]);await assert.rejects(validateVisualDocument(duplicate),/duplicate/);
 const other=structuredClone(raw);other.draft.designId='different';await assert.rejects(validateVisualDocument(other),/do not match/);
});
test('PNG export dimensions bound memory and browser canvas dimensions for large annotated projects',()=>{
 for(const [w,h]of [[2000,1500],[2000,100000],[100000,2000]]){const size=rasterDimensions(w,h);assert.ok(size.width<=16000&&size.height<=16000&&size.width*size.height<=16000000);assert.ok(size.width>0&&size.height>0);}
 assert.throws(()=>rasterDimensions(Infinity,100),/dimensions/);
});
test('duplicate pin names retain distinct terminal indices and source keys in the annotated connection guide',async()=>{
 const raw=source();raw.components.push(c('U1','custom',[['GND','return'],['GND','other']],{}));const doc=await document(raw),nets=connectionGuide(doc),pins=nets.flatMap(n=>n.pins).filter(p=>p.componentId==='U1');
 assert.deepEqual(pins.map(p=>p.pin),['GND [terminal 1]','GND [terminal 2]']);assert.deepEqual(pins.map(p=>p.pinIndex),[0,1]);assert.match(renderDiagram(doc.draft,doc.layout),/GND \[2\]/);
});
