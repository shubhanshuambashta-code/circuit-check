import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDiagram } from '../extension/wokwi.js';
import { analyze } from '../extension/analyzer.js';
for(const [type,pin] of [['wokwi-arduino-uno','8'],['wokwi-arduino-nano','A0'],['wokwi-arduino-mega','53'],['wokwi-esp32-devkit-v1','D23'],['board-esp32-devkit-c-v4','23'],['wokwi-pi-pico','GP15']]){
 test(type+' GPIO polarity follows actual normalized A/C wiring',()=>{
  const diagram={version:1,parts:[{id:'u',type},{id:'led',type:'wokwi-led'},{id:'r',type:'wokwi-resistor',attrs:{value:'220'}}],connections:[['u:'+pin,'r:1','red'],['r:2','led:C','green'],['led:A','u:GND.1','black']]};
  const bad=analyze(normalizeDiagram(diagram));assert.ok(bad.findings.some(f=>f.id==='reversed-led'));assert.equal(bad.ledPaths,1);
  diagram.connections[1][1]='led:A';diagram.connections[2][0]='led:C';
  assert.deepEqual(analyze(normalizeDiagram(diagram)).findings,[]);
 });
}
test('ESP32 input-only pins are not assumed to drive an LED',()=>{
 const raw={version:1,parts:[{id:'u',type:'wokwi-esp32-devkit-v1'},{id:'led',type:'wokwi-led'}],connections:[['u:34','led:C','red'],['led:A','u:GND.1','black']]};
 assert.equal(analyze(normalizeDiagram(raw)).ledPaths,0);
});
