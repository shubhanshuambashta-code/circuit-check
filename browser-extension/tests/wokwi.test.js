import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDiagram,validateDiagram,exportDiagram} from '../extension/wokwi.js';
import {readWokwi} from '../extension/wokwi-reader.js';
import {analyze} from '../extension/analyzer.js';
import {createRun} from '../extension/review.js';
import {newVisualDocument,improveVisual,connectPin,disconnectPin,setResistance} from '../extension/visual-model.js';
import vm from 'node:vm';
const diagram=()=>({version:1,author:'A',editor:'wokwi',serialMonitor:{display:'always'},parts:[{id:'uno',type:'wokwi-arduino-uno',top:-50,left:30,attrs:{}},{id:'led',type:'wokwi-led',attrs:{color:'blue'}},{id:'r',type:'wokwi-resistor',attrs:{value:'220'}}],connections:[['uno:5V','led:A','red',['v12']],['led:C','r:1','green',[]],['r:2','uno:GND.1','black',[]]]});
const rules=raw=>analyze(normalizeDiagram(raw)).findings.map(f=>f.rule);
test('Wokwi positive LED path and preserved source metadata round trip',()=>{
 const raw=diagram(),s=normalizeDiagram(raw);assert.deepEqual(rules(raw),[]);assert.equal(s.components[2].resistance,220);
 const out=exportDiagram(s,s);assert.deepEqual(out.connections,raw.connections);assert.deepEqual(out.serialMonitor,raw.serialMonitor);assert.equal(out.parts[0].top,-50);assert.equal(out.parts[1].attrs.color,'blue');
});
test('Wokwi supply short across different MCU ground pins is detected',()=>{
 const raw=diagram();raw.connections.push(['uno:GND.2','uno:5V','red',[]]);assert.ok(rules(raw).includes('supplyShort'));
});
test('ESP32 and Pico rail shorts are recognized without generalizing to custom boards',()=>{
 for(const [type,rail] of [['wokwi-esp32-devkit-v1','3V3'],['board-esp32-devkit-c-v4','5V'],['wokwi-pi-pico','3V3']]){const raw={version:1,parts:[{id:'b',type}],connections:[['b:'+rail,'b:GND.1','red']]};assert.ok(rules(raw).includes('supplyShort'));raw.parts[0].type='board-custom';assert.ok(!rules(raw).includes('supplyShort'));}
});
test('LED reversal and missing resistor use actual A and C pins',()=>{
 const raw=diagram();raw.connections=[['uno:5V','led:C','red'],['led:A','uno:GND.1','black']];assert.ok(rules(raw).includes('ledPolarity'));assert.ok(rules(raw).includes('ledResistance'));
});
test('floating known pin and zero resistance remain findings',()=>{
 const raw=diagram();raw.parts[2].attrs.value='0';assert.ok(rules(raw).includes('resistance'));raw.connections.pop();assert.ok(rules(raw).includes('openPins'));
});
test('omitted resistor value uses documented 1000 ohm default; invalid values have partial coverage',()=>{
 const raw=diagram();raw.parts[2].attrs={};assert.equal(normalizeDiagram(raw).components[2].resistance,1000);raw.parts[2].attrs.value='220k';const a=analyze(normalizeDiagram(raw));assert.equal(a.coverage.find(c=>c.id==='resistance').status,'not_checked');
});
test('GPIO paths are checked structurally without claiming their firmware state',()=>{
 const raw=diagram();raw.connections[0][0]='uno:13';const a=analyze(normalizeDiagram(raw));assert.equal(a.ledPaths,1);assert.equal(a.coverage.find(c=>c.id==='ledPolarity').status,'evaluated');assert.equal(a.coverage.find(c=>c.id==='firmware').status,'not_checked');assert.deepEqual(a.findings,[]);
 raw.parts.push({id:'x',type:'custom'});raw.connections.push(['x:1','led:C','green']);
 assert.equal(analyze(normalizeDiagram(raw)).ledPaths,0);
});
test('breadboards are retained with explicitly partial internal connectivity coverage',()=>{
 const raw=diagram();raw.parts.push({id:'bb',type:'wokwi-breadboard'});raw.connections=[['uno:5V','bb:1t.a','red'],['bb:1t.b','led:A','red'],['led:C','uno:GND.1','black']];const a=analyze(normalizeDiagram(raw));assert.equal(a.ledPaths,0);assert.equal(a.coverage.find(c=>c.id==='internalConnections').status,'partial');
});
test('serial monitor pseudo endpoints survive export without becoming parts',()=>{
 const raw=diagram();raw.connections.push(['uno:TX','$serialMonitor:RX','']);const s=normalizeDiagram(raw),out=exportDiagram(s,s);assert.equal(s.components.length,4);assert.equal(out.parts.length,3);assert.deepEqual(out.connections,raw.connections);
});
test('invalid JSON shapes, duplicates, absent endpoints and known invalid pins fail closed',()=>{
 for(const change of [r=>r.version=2,r=>r.parts.push(r.parts[0]),r=>r.connections.push(['missing:1','uno:5V','red']),r=>r.connections[0][1]='led:anode',r=>r.parts[0].attrs=[]]){const raw=diagram();change(raw);assert.throws(()=>validateDiagram(raw));}
});
test('source diagram is retained through reviews and visual serialization',async()=>{
 const raw=diagram(),run=await createRun(normalizeDiagram(raw)),doc=await newVisualDocument(run);assert.deepEqual(run.snapshot.diagram,raw);assert.deepEqual(doc.original.snapshot.diagram,raw);assert.equal(run.snapshot.simulation,'unknown');assert.equal(run.analysis.coverage.find(c=>c.id==='native').status,'not_checked');
});
test('resistor edits export only to a separate diagram and source does not mutate',async()=>{
 const raw=diagram(),run=await createRun(normalizeDiagram(raw)),doc=await newVisualDocument(run),changed=setResistance(doc,'r',470),out=exportDiagram(doc.original.snapshot,changed.draft);assert.equal(out.parts.find(p=>p.id==='r').attrs.value,'470');assert.deepEqual(out.connections,raw.connections);assert.equal(raw.parts[2].attrs.value,'220');assert.deepEqual(rules(out),[]);
});
test('repair proposal inserts a native Wokwi resistor and survives electrical recheck',async()=>{
 const raw=diagram();raw.parts.pop();raw.connections=[['uno:5V','led:A','red'],['led:C','uno:GND.1','black']];const doc=await newVisualDocument(await createRun(normalizeDiagram(raw))),improved=improveVisual(doc,{resistance:330}).document,out=exportDiagram(doc.original.snapshot,improved.draft);assert.equal(out.parts.length,3);assert.equal(out.parts.find(p=>p.type==='wokwi-resistor').attrs.value,'330');assert.deepEqual(rules(out),[]);assert.equal(raw.parts.length,2);
});
test('rewiring export disconnects selected pin while preserving other old-net members',async()=>{
 const raw=diagram(),doc=await newVisualDocument(await createRun(normalizeDiagram(raw))),idx=doc.draft.components.find(c=>c.id==='led').terminals.findIndex(p=>p.name==='A'),changed=disconnectPin(doc,'led',idx),out=exportDiagram(doc.original.snapshot,changed.draft);assert.ok(!out.connections.some(w=>w.slice(0,2).includes('led:A')));assert.ok(rules(out).includes('openPins'));
});
test('review design hash changes when an unsupported native attribute changes',async()=>{
 const raw=diagram();raw.parts.push({id:'sensor',type:'wokwi-dht22',attrs:{temperature:'25'}});const before=await createRun(normalizeDiagram(raw));raw.parts[3].attrs.temperature='35';const after=await createRun(normalizeDiagram(raw));assert.notEqual(before.provenance.designHash,after.provenance.designHash);
});
test('native export refuses to split internally joined MCU ground aliases',()=>{
 const raw=diagram();raw.connections.push(['uno:GND.2','r:2','black']);const original=normalizeDiagram(raw),draft=structuredClone(original);draft.components.find(c=>c.id==='uno').terminals.find(p=>p.name==='GND.2').net='draft-split';draft.components.find(c=>c.id==='led').terminals.find(p=>p.name==='A').net='draft-split';assert.throws(()=>exportDiagram(original,draft),/internally joined/);
});
function readFixture(content,opts={}){
 const project={id:'123',name:'Fixture',files:[{name:'diagram.json',content}]};
 Object.defineProperty(project,'diagram',{get(){throw Error('Must never call mutating diagram getter');}});
 const fiber={memoizedProps:{project}},node={'__reactFiber$fixture':fiber};
 const ctx={location:{origin:'https://wokwi.com',pathname:'/projects/123'},document:{querySelectorAll:()=>opts.absent?[]:[node],title:'Wokwi'},window:{},Set,JSON};return vm.runInNewContext('('+readWokwi.toString()+')()',ctx);
}
test('live reader reads current project file without invoking diagram getter',()=>{
 const r=readFixture(JSON.stringify(diagram()));assert.equal(r.designId,'123');assert.equal(r.captureMode,'project-file');assert.equal(r.diagram.parts.length,3);
});
test('invalid live editor data cannot fall back to stale saved project data',()=>{assert.match(readFixture('{').error,/could not be read/);assert.match(readFixture('',{absent:true}).error,/Open the diagram/);});

function candidate(content,{id='42',live=false}={}){const c={id,files:[{name:'diagram.json',content}]};if(live){c.findFile=()=>{throw Error('Reader must not call editor methods');};c.syncDiagram=c.findFile;}Object.defineProperty(c,'diagram',{get(){throw Error('Reader must not invoke diagram getter');}});return c;}
function readCandidates(models,{pending=null,path='/projects/42'}={}){const fibers=models.map(project=>({memoizedProps:{project}}));for(let i=1;i<fibers.length;i++)fibers[i-1].child=fibers[i];if(pending)fibers[0].pendingProps={project:pending};const node={'__reactFiber$regression':fibers[0]},ctx={location:{origin:'https://wokwi.com',pathname:path},document:{querySelectorAll:()=>[node],title:'Test'},window:{}};return vm.runInNewContext('('+readWokwi.toString()+')()',ctx);}
test('saved project props and a live editor instance do not count as two circuits',()=>{const text=JSON.stringify(diagram());assert.equal(readCandidates([candidate(text),candidate(text,{live:true})]).diagram.parts.length,3);});
test('unsaved live wiring wins over a serialized saved copy and reveals an open pin',()=>{const saved=diagram(),edited=diagram();edited.connections.pop();const r=readCandidates([candidate(JSON.stringify(saved)),candidate(JSON.stringify(edited),{live:true})]);assert.deepEqual(JSON.parse(JSON.stringify(r.diagram)),edited);assert.ok(rules(r.diagram).includes('openPins'));});
test('invalid JSON in the live model never falls back to a clean saved copy',()=>{const r=readCandidates([candidate(JSON.stringify(diagram())),candidate('{',{live:true})]);assert.match(r.error,/could not be read/);assert.equal(r.diagram,undefined);});
test('identical live wrappers are deduplicated, but conflicting live instances fail closed',()=>{const text=JSON.stringify(diagram());assert.ok(readCandidates([candidate(text,{live:true}),candidate(text,{live:true})]).diagram);const edited=diagram();edited.parts[2].attrs.value='0';assert.match(readCandidates([candidate(text,{live:true}),candidate(JSON.stringify(edited),{live:true})]).error,/Conflicting live/);});
test('pending React props cannot override the committed editor model',()=>{const edited=diagram();edited.connections.pop();const r=readCandidates([candidate(JSON.stringify(diagram()),{live:true})],{pending:candidate(JSON.stringify(edited),{live:true})});assert.equal(r.diagram.connections.length,3);});
test('numeric project URL selects the matching live model and rejects stale route data',()=>{const text=JSON.stringify(diagram());assert.equal(readCandidates([candidate(text,{live:true,id:'41'}),candidate(text,{live:true,id:'42'})]).designId,'42');assert.match(readCandidates([candidate(text,{live:true,id:'41'}),candidate(text,{id:'42'})]).error,/does not match/);});
