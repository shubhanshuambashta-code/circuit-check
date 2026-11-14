import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, compareRuns, reviewStatus, previewResistance, reportHTML, validateSnapshot, explainFinding, canonicalComponents } from '../extension/review.js';
import { DEFAULT_PROFILE, validateProfile } from '../extension/profiles.js';
import { analyze } from '../extension/analyzer.js';
const pin=(name,net)=>({name,net});
const component=(id,model,terminals,extra={})=>({id,label:id,model,typeName:model,terminals,resistance:null,properties:[],native:[],...extra});
const snapshot=()=>({schema:1,designId:'fixture',title:'Test design',source:'Test fixture',components:[component('B1','battery9V',[pin('+','vcc'),pin('-','gnd')]),component('D1','led2',[pin('anode','vcc'),pin('cathode','mid')]),component('R1','resistor',[pin('1','mid'),pin('2','gnd')],{resistance:0,properties:[{name:'resistance',value:'0',unit:'ohm',prefix:'none'}]})],simulation:'stopped',wireCount:3,capturedAt:'2026-11-04T00:00:00Z',editable:true});
test('canonical source and evidence hashes survive generated net labels and collection order',async()=>{
 const a=snapshot(),b=structuredClone(a);b.components.reverse();b.components.forEach(c=>{c.terminals.reverse();c.terminals.forEach(p=>{p.net='renamed-'+p.net;});});
 const [one,two]=await Promise.all([createRun(a),createRun(b)]);
 assert.equal(one.provenance.designHash,two.provenance.designHash);
 const first=new Map(one.analysis.findings.map(f=>[f.id,f.evidenceHash]));
 two.analysis.findings.forEach(f=>assert.equal(first.get(f.id),f.evidenceHash));
});
test('saved exception stays visible and requires review after scoped evidence changes',async()=>{
 const one=await createRun(snapshot()),finding=one.analysis.findings.find(f=>f.id==='resistance-R1');
 const notes=[{findingId:finding.id,kind:'exception',evidenceHash:finding.evidenceHash,body:'Intentional link'}];
 assert.equal(reviewStatus(notes,finding),'accepted_exception');
 const raw=snapshot();raw.components[2].label='Renamed resistor';const two=await createRun(raw);
 assert.equal(reviewStatus(notes,two.analysis.findings.find(f=>f.id===finding.id)),'needs_review');
 assert.ok(two.analysis.findings.some(f=>f.id===finding.id));
 notes.push({findingId:finding.id,kind:'reopen',evidenceHash:finding.evidenceHash});assert.equal(reviewStatus(notes,finding),'open');
});
test('a changed net membership invalidates a scoped exception even when the component pin names stay unchanged',async()=>{
 const raw=snapshot();raw.components[0].terminals[1].net='vcc';const first=await createRun(raw),f=first.analysis.findings.find(f=>f.rule==='supplyShort');
 const notes=[{findingId:f.id,kind:'exception',evidenceHash:f.evidenceHash}];
 raw.components.push(component('Z1','custom',[pin('x','vcc')]));const next=await createRun(raw);
 assert.equal(reviewStatus(notes,next.analysis.findings.find(f=>f.id===notes[0].findingId)),'needs_review');
});
test('large shared nets have bounded canonical size instead of quadratic pin membership expansion',()=>{
 const raw=snapshot();raw.components=[component('BB1','',Array.from({length:10000},(_,i)=>pin('hole-'+i,'shared')),{typeName:'Breadboard'})];
 assert.ok(JSON.stringify(canonicalComponents(raw)).length<3_000_000);
});
test('comparison distinguishes missing findings from a verified fix when coverage/profile changes',async()=>{
 const one=await createRun(snapshot());const p=structuredClone(DEFAULT_PROFILE);p.checks.resistance=false;
 const two=await createRun(snapshot(),p);const comparison=compareRuns(one,two);
 assert.equal(comparison.comparable,false);assert.ok(comparison.notReported.some(f=>f.id==='resistance-R1'));assert.match(comparison.note,/not verified fixes/);
});
test('stopping simulation cannot verify disappearance of a native fault',async()=>{
 const raw=snapshot();raw.simulation='running';raw.components[1].native=[{kind:'breakdown',reason:'LED overcurrent'}];
 const before=await createRun(raw);raw.simulation='stopped';const after=await createRun(raw);
 assert.equal(compareRuns(before,after).comparable,false);assert.ok(compareRuns(before,after).notReported.some(f=>f.rule==='native'));
});
test('a branched LED path losing coverage is not treated as a verified disappearance',async()=>{
 const raw=snapshot(),before=await createRun(raw);
 raw.components.push(component('X1','custom',[pin('a','mid'),pin('b','gnd')]));const after=await createRun(raw);
 assert.equal(after.analysis.coverage.find(c=>c.id==='ledResistance').status,'partial');assert.equal(compareRuns(before,after).comparable,false);
});
test('comparison records value changes, movement and pin-net membership changes',async()=>{
 const a=snapshot();a.components[2].position={x:1,y:2,angle:0};const b=structuredClone(a);
 b.components[2].position.x=10;b.components[2].resistance=470;b.components[2].properties[0].value='470';b.components[1].terminals[0].net='gnd';
 const delta=compareRuns(await createRun(a),await createRun(b));
 assert.ok(delta.components.moved.includes('R1'));assert.ok(delta.components.changed.includes('R1'));assert.ok(delta.components.rewired.includes('D1'));
});
test('custom minimum is explicit project evidence and disabled rules remain in coverage',()=>{
 const raw=snapshot();raw.components[2].resistance=100;
 const profile=structuredClone(DEFAULT_PROFILE);profile.minLedResistance=220;profile.source='Lab worksheet';profile.checks.openPins=false;
 const result=analyze(raw,profile),f=result.findings.find(f=>f.id==='profile-led-D1');
 assert.match(f.evidence,/100 Ω/);assert.match(f.evidence,/Lab worksheet/);assert.equal(result.coverage.find(r=>r.id==='openPins').status,'disabled');
 assert.throws(()=>validateProfile({constraints:{track_width:0.2}}),/Unknown profile field/);
 assert.throws(()=>validateProfile({...profile,minLedResistance:Infinity}),/positive number/);
});
test('repair preview is a separate static result, and zero restore requires explicit restore mode',async()=>{
 const base=await createRun(snapshot()),original=JSON.stringify(base);
 const preview=await previewResistance(base,'R1',470);
 assert.equal(JSON.stringify(base),original);assert.equal(preview.candidate.snapshot.components[2].resistance,470);
 assert.ok(!preview.candidate.analysis.findings.some(f=>f.id==='resistance-R1'));assert.match(preview.note,/No simulation/);
 await assert.rejects(previewResistance(preview.candidate,'R1',0));
 assert.equal((await previewResistance(preview.candidate,'R1',0,{restore:true})).candidate.snapshot.components[2].resistance,0);
});
test('HTML report escapes project names, comments and questions and includes provenance',async()=>{
 const raw=snapshot();raw.title='<script>alert(1)</script>';const run=await createRun(raw),f=run.analysis.findings[0];
 const html=reportHTML(run,[{findingId:f.id,kind:'comment',body:'<img src=x onerror=alert(1)>',createdAt:'now',evidenceHash:f.evidenceHash}]);
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.match(html,/&lt;script&gt;/);assert.ok(html.includes(run.provenance.designHash));
 assert.match(html,/Content-Security-Policy/);
});
test('import validation rejects duplicate IDs and labels imported snapshots as uneditable',()=>{
 const raw=snapshot();const imported=validateSnapshot(raw,true);assert.equal(imported.editable,false);assert.equal(imported.imported,true);
 raw.components.push(raw.components[0]);assert.throws(()=>validateSnapshot(raw),/unique/);
});
test('evidence guide never pretends to call an AI model or approves complete circuits',async()=>{
 const run=await createRun(snapshot()),f=run.analysis.findings[0];
 assert.match(explainFinding(f,'Is the circuit safe?').answer,/cannot establish/);
 assert.equal(explainFinding(f,'Why?').answer,f.evidence);assert.match(explainFinding(f,'How can I verify?').answer,/simulation/i);
 assert.match(explainFinding(f).mode,/no AI/);
});
