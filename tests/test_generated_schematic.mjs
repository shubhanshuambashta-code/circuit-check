import test from 'node:test';
import assert from 'node:assert/strict';
import {importSchematicSource,schematicFromGeometry,renderSchematic} from '../src/generated-schematic.ts';
const diagram=()=>({version:1,parts:[{id:'uno',type:'wokwi-arduino-uno'},{id:'r',type:'wokwi-resistor',attrs:{value:'220'}},{id:'led',type:'wokwi-led'}],connections:[['uno:8','r:1','red'],['r:2','led:A','green'],['led:C','uno:GND.1','black']]});
test('explicit Wokwi connections become matching net-labelled pins without source mutation',()=>{
 const input=diagram(),before=JSON.stringify(input),source=importSchematicSource(input),result=renderSchematic(source),nets=JSON.parse(result.netlist).nets;
 assert.equal(result.partCount,3);assert.equal(result.pinCount,6);assert.equal(result.netCount,3);assert.ok(nets.some(n=>n.pins.some(p=>p.component==='r'&&p.pin==='2')&&n.pins.some(p=>p.component==='led'&&p.pin==='A')));assert.equal(JSON.stringify(input),before);
});
test('disconnected pins stay open and do not merge into a fictitious net',()=>{
 const input=diagram();input.connections.splice(1,1);const source=importSchematicSource(input),result=renderSchematic(source);
 assert.equal(source.parts.find(p=>p.id==='led').pins.find(p=>p.name==='A').net,null);assert.equal(result.netCount,2);assert.match(result.svg,/>open<\/text>/);
});
test('recognized board ground aliases merge but breadboard internal holes are not guessed',()=>{
 const input=diagram();input.parts.push({id:'other',type:'wokwi-resistor'});input.connections.push(['other:1','uno:GND.2','black']);
 const source=importSchematicSource(input),ground=source.parts.find(p=>p.id==='led').pins.find(p=>p.name==='C').net;
 assert.equal(source.parts.find(p=>p.id==='other').pins[0].net,ground);
 input.parts.push({id:'bb',type:'wokwi-breadboard'});input.connections.push(['other:2','bb:1t.a','green'],['led:A','bb:1t.b','green']);
 const bb=importSchematicSource(input).parts.find(p=>p.id==='bb');assert.notEqual(bb.pins[0].net,bb.pins[1].net);
});
test('extension reports preserve actual pin roles, net zero, duplicate pin names and unknown parts',()=>{
 const source=importSchematicSource({run:{snapshot:{title:'Tinkercad',schema:1,components:[{id:'x',label:'X1',model:'unknown',terminals:[{name:'1',net:'0'},{name:'1',net:'signal'},{name:'open',net:null}]}]}}});
 const output=renderSchematic(source);assert.equal(output.pinCount,3);assert.equal(output.netCount,2);assert.equal(JSON.parse(output.netlist).components[0].pins[0].net,'0');assert.match(output.svg,/open/);
});
test('PCB-only sources use pad identities, do not infer diode polarity, and deduplicate physical copies of a pin',()=>{
 const geometry={objects:[{id:'f',kind:'component',reference:'D1',value:'LED'},{id:'p1',kind:'pad',parent_id:'f',reference:'D1',pad:'1',net:'VCC'},{id:'p2',kind:'pad',parent_id:'f',reference:'D1',pad:'1',net:'VCC'},{id:'p3',kind:'pad',parent_id:'f',reference:'D1',pad:'2',net:null}]};
 const source=schematicFromGeometry(geometry);assert.equal(source.parts[0].pins.length,2);assert.equal(source.parts[0].model,'pcb-component');assert.equal(source.parts[0].value,'LED');
 geometry.objects[2].net='GND';assert.throws(()=>schematicFromGeometry(geometry),/conflicting net assignments/);
});
test('generated JSON can be reopened with identical component pin/net connectivity',()=>{
 const first=importSchematicSource(diagram()),output=renderSchematic(first),again=importSchematicSource(JSON.parse(output.netlist));
 assert.deepEqual(again.parts,first.parts);assert.equal(renderSchematic(again).netCount,output.netCount);
});
test('SVG escapes script and markup in labels, IDs, values and net names',()=>{
 const source=importSchematicSource({components:[{id:'"><script>alert(1)</script>',label:'<img src=x onerror=alert(1)>',model:'unknown',value:'<script>',terminals:[{name:'<path>',net:'<script>'}]}]});
 const output=renderSchematic(source);assert.ok(!output.svg.includes('<script>'));assert.ok(!output.svg.includes('<img'));assert.match(output.svg,/&lt;img/);assert.match(output.svg,/&lt;script/);
});
test('missing parts, duplicate IDs, non-connectivity JSON and over-sized sources fail with useful errors',()=>{
 const missing=diagram();missing.connections[0][0]='missing:1';assert.throws(()=>importSchematicSource(missing),/missing component/);
 const duplicate=diagram();duplicate.parts.push(duplicate.parts[0]);assert.throws(()=>importSchematicSource(duplicate),/unique/);
 assert.throws(()=>importSchematicSource({title:'screenshot'}),/connectivity/);assert.throws(()=>schematicFromGeometry({objects:[]}),/No electrical components/);
 assert.throws(()=>importSchematicSource({components:Array.from({length:501},(_,i)=>({id:String(i),terminals:[]}))}),/components/);
});
test('invalid XML control characters are rejected before creating an SVG download',()=>{
 assert.throws(()=>importSchematicSource({components:[{id:'x',label:'bad\u0000label',terminals:[{name:'1',net:'signal'}]}]}),/control characters/);
});
test('completely disconnected components still generate with zero nets and every pin open',()=>{
 const source=importSchematicSource({version:1,parts:[{id:'led',type:'wokwi-led'},{id:'r',type:'wokwi-resistor'}],connections:[]}),output=renderSchematic(source);
 assert.equal(output.partCount,2);assert.equal(output.netCount,0);assert.equal(output.openPinCount,4);assert.equal(output.singlePinNetCount,0);assert.equal(JSON.parse(output.netlist).openPins.length,4);
 assert.equal((output.svg.match(/>open<\/text>/g)||[]).length,4);assert.equal(source.parts.every(part=>part.pins.every(pin=>pin.net===null)),true);
});
test('a single-pin named net is a review case and is not rewritten as a confirmed open pin',()=>{
 const output=renderSchematic(importSchematicSource({components:[{id:'J1',model:'connector',terminals:[{name:'1',net:'external'}]}]}));
 assert.equal(output.openPinCount,0);assert.equal(output.singlePinNetCount,1);assert.equal(JSON.parse(output.netlist).components[0].pins[0].net,'external');
});
test('PCB pads without net assignments produce an all-open schematic without shorting them together',()=>{
 const source=schematicFromGeometry({objects:[{id:'p1',parent_id:'f',reference:'R1',kind:'pad',pad:'1',net:''},{id:'p2',parent_id:'f',reference:'R1',kind:'pad',pad:'2',net:null}]}),output=renderSchematic(source);
 assert.equal(output.openPinCount,2);assert.equal(output.netCount,0);assert.equal(output.partCount,1);assert.equal(JSON.parse(output.netlist).nets.length,0);
});
