import test from 'node:test';import assert from 'node:assert/strict';
import {platformForUrl,platformOf,captureSnapshot,selectCapture} from '../extension/platforms.js';
import {createRun,compareRuns,validateSnapshot} from '../extension/review.js';
import {normalizeDiagram} from '../extension/wokwi.js';
import {analyze} from '../extension/analyzer.js';
import {newVisualDocument,validateVisualDocument,catalog} from '../extension/visual-model.js';
import {freshWorkspace,ensureProject,importWorkspace,loadWorkspace,WORKSPACE_KEY} from '../extension/workspace.js';
const tc=()=>({schema:1,designId:'same-id',source:'Tinkercad live editor',title:'Fixture',simulation:'running',editable:true,components:[{id:'R1',label:'R1',model:'resistor',typeName:'Resistor',terminals:[{name:'1',net:'a'},{name:'2',net:'b'}],resistance:220,properties:[],native:[{kind:'warning',reason:'Native report'}],nativeSupported:true}]});
const wk=()=>normalizeDiagram({version:1,parts:[{id:'r',type:'wokwi-resistor'}],connections:[]},{designId:'same-id'});
test('URL routing recognizes exact supported HTTPS hosts and rejects deceptive or unrelated URLs',()=>{
 for(const url of ['https://tinkercad.com/things/a','https://www.tinkercad.com/embed/a','https://editor.tinkercad.com/circuit'])assert.equal(platformForUrl(url),'tinkercad');
 assert.equal(platformForUrl('https://wokwi.com/projects/123'),'wokwi');
 for(const url of ['https://wokwi.com','https://wokwi.com.evil.test/projects/1','https://tinkercad.com.evil.test/a','https://evil.test/tinkercad.com','http://wokwi.com/projects/1','file:///x',null])assert.equal(platformForUrl(url),null);
});
test('capture dispatch tags both adapters and rejects errors and ambiguous frames',()=>{
 const tinkercad=selectCapture('tinkercad',[{frameId:0,result:null},{frameId:8,result:tc()}]);assert.equal(tinkercad.frameId,8);assert.equal(tinkercad.snapshot.platform,'tinkercad');
 const wokwi=selectCapture('wokwi',[{frameId:0,result:{schema:1,diagram:wk().diagram,designId:'same-id'}}]);assert.equal(wokwi.snapshot.platform,'wokwi');assert.equal(wokwi.snapshot.editable,false);
 assert.throws(()=>selectCapture('tinkercad',[{result:tc()},{result:tc()}]),/More than one/);assert.throws(()=>selectCapture('wokwi',[{result:{schema:1,error:'Bad JSON'}}]),/Bad JSON/);assert.throws(()=>selectCapture('wokwi',[]),/No circuit/);
});
test('identical design IDs on different sites have independent project and hash identities',async()=>{
 const a=await createRun({...tc(),platform:'tinkercad'}),b=await createRun({...tc(),platform:'wokwi'});assert.equal(a.projectId,'tinkercad:same-id');assert.equal(b.projectId,'wokwi:same-id');assert.notEqual(a.provenance.designHash,b.provenance.designHash);assert.throws(()=>compareRuns(a,b),/same platform and design/);
 const data=freshWorkspace();ensureProject(data,a.snapshot).notes.push({body:'Tinkercad only'});ensureProject(data,b.snapshot);assert.equal(data.projects.length,2);assert.equal(data.projects[1].notes.length,0);
});
test('only Tinkercad reports native simulator flags and Wokwi diagnostics remain unchecked',()=>{
 const a=analyze({...tc(),platform:'tinkercad'}),b=analyze({...tc(),platform:'wokwi'});assert.equal(a.findings[0].source,'Tinkercad simulator');assert.equal(b.findings.filter(f=>f.rule==='native').length,0);assert.equal(b.coverage.find(c=>c.id==='native').status,'not_checked');
});
test('visual drafts cannot be exchanged across platforms even with identical design IDs',async()=>{
 const doc=await newVisualDocument(await createRun({...tc(),platform:'tinkercad'}));doc.draft.platform='wokwi';await assert.rejects(validateVisualDocument(doc),/do not match/);
});
test('visual catalog uses each platform pin names and Wokwi exports only its supported basic parts',async()=>{
 const a=catalog(await newVisualDocument(await createRun(tc()))),b=catalog(await newVisualDocument(await createRun(wk())));
 assert.deepEqual(a.find(c=>c.key==='basic-led').pins,['anode','cathode']);assert.deepEqual(b.find(c=>c.key==='basic-led').pins,['A','C']);assert.ok(a.some(c=>c.key==='basic-battery'));assert.ok(!b.some(c=>c.key==='basic-battery'));
});
test('legacy platform inference preserves old backups and refuses conflicting source diagrams',()=>{
 assert.equal(platformOf(tc()),'tinkercad');const old=wk();delete old.platform;assert.equal(validateSnapshot(old,true).platform,'wokwi');assert.throws(()=>validateSnapshot({...old,platform:'tinkercad'}),/cannot contain/);assert.throws(()=>validateSnapshot({...tc(),platform:'other'}),/Unsupported/);
});
test('one backup imports both former editions into separate project histories',async()=>{
 let memory={};globalThis.chrome={storage:{local:{get:async()=>structuredClone(memory),set:async value=>{memory={...memory,...structuredClone(value)};}}}};
 const oldWokwi=wk();delete oldWokwi.platform;const imported=await importWorkspace({schema:2,projects:[{runs:[{snapshot:tc(),name:'Old Tinkercad'}]},{runs:[{snapshot:oldWokwi,name:'Old Wokwi'}]}]});assert.equal(imported.result,2);const data=await loadWorkspace();assert.deepEqual(data.projects.map(p=>p.id).sort(),['tinkercad:same-id','wokwi:same-id']);assert.ok(data.projects.every(p=>p.runs[0].snapshot.imported&&!p.runs[0].snapshot.editable));assert.ok(memory[WORKSPACE_KEY]);
});
