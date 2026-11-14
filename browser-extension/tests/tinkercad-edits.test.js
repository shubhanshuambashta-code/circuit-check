import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readTinkercad } from '../extension/reader.js';
import { validateSnapshot } from '../extension/review.js';
function scene({mode=1,simulation=0}={}){
 let resistance=0,recordings=0,stops=0,sets=0;
 const net1={getHighestNet(){return this;}},net2={getHighestNet(){return this;}};
 const terminals=[{getSchematicName:()=>'1',getBreadboardDescription:()=>({name:'1'}),net:()=>net1},{getSchematicName:()=>'2',getBreadboardDescription:()=>({name:'2'}),net:()=>net2}];
 const device={id:'R1',name:()=>'1',getDescription:()=>({device:{name:'Resistor',base:'R',simulation_model:'resistor'}}),terminals:{forEach:f=>terminals.forEach((p,i)=>f(i,p))},properties:{forEach:f=>f('r',{name:'resistance',unit:'ohm',prefix:'none',value:String(resistance)})},getPropertyValue:()=>resistance,breadboard:()=>({}),setProperty:(name,show,value,prefix)=>{assert.deepEqual([name,show,prefix],['resistance',null,'none']);sets++;resistance=value;}};
 const circuit={devices:{forEach:f=>f(device)},wires:{forEach(){}},circuit_type:()=>'breadboard'};
 const gui={mode,root:{circuit,rec:()=>{recordings++;},stopRec:()=>{stops++;},editorModel:{breadboard:()=>({simulatorState:()=>simulation})}},app:{meta_data:{name:'Edit fixture',docid:'fixture'}}};
 const context=vm.createContext({window:{gui},location:{href:'https://www.tinkercad.com/things/fixture/editel',pathname:'/things/fixture/editel'},document:{title:'Fixture'},Date});
 context.reader=vm.runInContext('('+readTinkercad.toString()+')',context);
 return {read:()=>context.reader(),apply:request=>context.reader(request),change:value=>{resistance=value;},stats:()=>({resistance,recordings,stops,sets})};
}
test('approved resistor edit records one undoable operation and rereads the actual property',()=>{
 const s=scene(),expected=validateSnapshot(JSON.parse(JSON.stringify(s.read())));
 const result=s.apply({type:'set-resistance',expected,componentId:'R1',value:470});
 assert.equal(result.edit.applied,true);assert.equal(result.components[0].resistance,470);assert.deepEqual(s.stats(),{resistance:470,recordings:1,stops:1,sets:1});
});
test('preview guard survives Chromium dictionary-key reordering during script argument transport',()=>{
 const s=scene();
 const sort=value=>Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])])):value;
 const expected=sort(validateSnapshot(JSON.parse(JSON.stringify(s.read()))));
 const result=s.apply({type:'set-resistance',expected,componentId:'R1',value:220});assert.equal(result.edit.applied,true);assert.equal(s.stats().sets,1);
});
test('stale preview, read-only viewer, running simulation and wrong design cannot write',()=>{
 const stale=scene(),expected=stale.read();stale.change(220);assert.equal(stale.apply({type:'set-resistance',expected,componentId:'R1',value:470}).edit.applied,false);assert.equal(stale.stats().sets,0);
 for(const s of[scene({mode:0}),scene({simulation:1})]){const result=s.apply({type:'set-resistance',expected:s.read(),componentId:'R1',value:470});assert.equal(result.edit.applied,false);assert.equal(s.stats().sets,0);}
 const wrong=scene(),snapshot=JSON.parse(JSON.stringify(wrong.read()));snapshot.designId='other';assert.equal(wrong.apply({type:'set-resistance',expected:snapshot,componentId:'R1',value:470}).edit.applied,false);assert.equal(wrong.stats().sets,0);
});
test('restore can return the selected resistor to zero without allowing an ordinary zero-value edit',()=>{
 const s=scene();s.change(470);let expected=s.read();assert.equal(s.apply({type:'set-resistance',expected,componentId:'R1',value:0}).edit.applied,false);
 expected=s.read();assert.equal(s.apply({type:'set-resistance',expected,componentId:'R1',value:0,restore:true}).edit.applied,true);assert.equal(s.stats().resistance,0);
});
