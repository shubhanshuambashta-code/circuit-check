import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readTinkercad } from '../extension/reader.js';
import { analyze } from '../extension/analyzer.js';
const set = values => ({forEach: f => values.forEach(v=>f(v)),size:()=>values.length});
const map = values => ({forEach:f=>values.forEach((v,k)=>f(k,v))});
const terminal = (name,net) => ({getSchematicName:()=>name,getBreadboardDescription:()=>({name}),net:()=>net});
const net = () => { const n={getHighestNet:()=>n};return n; };
function device(id,model,terminals,extra={}) {
 return {id,name:()=>String(id),getDescription:()=>({device:{base:'D',name:'LED',simulation_model:model}}),terminals:map(terminals),properties:map([]),getPropertyValue:()=>null,breadboard:()=>({dynamicModel:{breakdown:()=>false,warning:()=>false}}),...extra};
}
function read(devices,{type='breadboard',state=0,url='https://www.tinkercad.com/embed/example'}={}){
 const circuit={devices:set(devices),wires:set([]),circuit_type:()=>type};
 const gui={root:{circuit,editorModel:{breadboard:()=>({simulatorState:()=>state})}},app:{meta_data:{docid:'example',name:'Example'}}};
 return JSON.parse(JSON.stringify(vm.runInNewContext('('+readTinkercad.toString()+')()', {window:{gui},location:{href:url,pathname:'/embed/example'},document:{title:'Example'},Date})));
}
test('adapter respects HashMap key/value order and actual shared net identity',()=>{
 const supply=net(),ground=net();
 const result=read([device(1,'led2',[terminal('anode',supply),terminal('cathode',ground)]),device(2,'resistor',[terminal('1',supply),terminal('2',null)])]);
 assert.equal(result.components.length,2);assert.equal(result.components[0].label,'D1');
 assert.equal(result.netCount,2);assert.equal(result.components[0].terminals[0].net,result.components[1].terminals[0].net);assert.equal(result.components[1].terminals[1].net,null);
});
test('highest net identity merges breadboard subnet aliases',()=>{
 const highest=net();const alias={getHighestNet:()=>highest};
 const result=read([device(1,'led2',[terminal('anode',highest),terminal('cathode',alias)])]);
 assert.equal(result.netCount,1);assert.equal(result.components[0].terminals[0].net,result.components[0].terminals[1].net);
});
test('simulation state and native breakdown reason are read',()=>{
 const result=read([device(1,'led2',[],{breadboard:()=>({dynamicModel:{breakdown:()=>({breakdown:true,reason:'Too much current'}),warning:()=>false}})})],{state:1});
 assert.equal(result.simulation,'running');assert.equal(result.components[0].native[0].reason,'Too much current');
});
test('unknown editor, model shapes and non-Tinkercad domains fail closed',()=>{
 assert.equal(read([],{type:'pcb'}),null);assert.equal(read([],{url:'https://www.tinkercad.com.evil.example/'}),null);
 assert.match(read([{}]).error,/Unsupported/);
});
test('Tinkercad editor subdomain is supported but similarly named external hosts are rejected',()=>{
 assert.equal(read([],{url:'https://editor.tinkercad.com/embed/example'}).schema,1);
 assert.equal(read([],{url:'https://editor.tinkercad.com.evil.example/embed/example'}),null);
 assert.equal(read([],{url:'https://evil.tinkercad.com/embed/example'}),null);
});

test('captured Arduino GPIO wiring detects a reversed LED through breadboard aliases',()=>{
 const ground=net(),drive=net(),middle=net(),alias={getHighestNet:()=>ground};
 const parts=[device(1,'ArduinoUnoRev3',[terminal('GND1',ground),terminal('GND2',alias),terminal('8',drive)]),device(2,'led2',[terminal('anode',alias),terminal('cathode',middle)]),device(3,'resistor',[terminal('1',middle),terminal('2',drive)],{getPropertyValue:()=>220})];
 assert.ok(analyze(read(parts)).findings.some(f=>f.id==='reversed-2'));
 parts[1]=device(2,'led2',[terminal('anode',middle),terminal('cathode',ground)]);
 assert.deepEqual(analyze(read(parts)).findings,[]);
});
