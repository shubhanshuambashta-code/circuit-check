import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../extension/analyzer.js';
const pin = (name, net) => ({ name, net });
const component = (id, model, terminals, extra = {}) => ({ id, label: id, model, typeName: model, terminals, resistance: null, native: [], ...extra });
const battery = () => component('B1', 'battery9V', [pin('+', 'vcc'), pin('-', 'gnd')]);
const led = (a = 'vcc', k = 'gnd') => component('D1', 'led2', [pin('anode', a), pin('cathode', k)]);
const resistor = (a, b, value = 470) => component('R1', 'resistor', [pin('1', a), pin('2', b)], { resistance: value });
const scan = (components, extra = {}) => analyze({ schema: 1, components, simulation: 'stopped', ...extra });
const ids = result => result.findings.map(f => f.id);

test('direct supply short reports both exact pins', () => {
  const result = scan([component('B1','battery9V',[pin('+','same'),pin('-','same')])]);
  const finding=result.findings.find(f=>f.id.startsWith('short-'));
  assert.equal(finding.severity,'error');assert.deepEqual(finding.pins,['+','-']);
});
test('disconnected supply pins are not a short',()=>assert.ok(!ids(scan([component('B1','battery9V',[pin('+',null),pin('-',null)])])).some(id=>id.startsWith('short-'))));
test('proper simple LED series path is clear with resistor before or after LED',()=>{
  for(const parts of [[battery(),resistor('vcc','mid'),led('mid','gnd')],[battery(),led('vcc','mid'),resistor('mid','gnd')]]){
    const result=scan(parts);assert.deepEqual(result.findings,[]);assert.equal(result.ledPaths,1);
  }
});
test('reversed LED names its supply endpoints',()=>{
 const r=scan([battery(),resistor('vcc','mid'),led('gnd','mid')]);
 assert.deepEqual(ids(r),['reversed-D1']);assert.match(r.findings[0].evidence,/B1\.\+/);
});
test('missing and zero-ohm limiting resistors are flagged',()=>{
 assert.ok(ids(scan([battery(),led()])).includes('no-resistor-D1'));
 assert.ok(ids(scan([battery(),led('vcc','mid'),resistor('mid','gnd',0)])).includes('no-resistor-D1'));
});
test('a resistor on another parallel branch does not protect the LED',()=>{
 const result=scan([battery(),led(),resistor('vcc','gnd')]);
 assert.equal(result.ledPaths,1);assert.ok(ids(result).includes('no-resistor-D1'));
});
test('unsupported components and another LED halt path inference',()=>{
 for(const other of [component('X1','custom',[pin('1','mid'),pin('2','gnd')]),component('D2','led2',[pin('anode','mid'),pin('cathode','gnd')])]){
  const result=scan([battery(),led('vcc','mid'),other]);assert.equal(result.ledPaths,0);assert.ok(!ids(result).includes('no-resistor-D1'));
 }
});
test('floating and bypassed simple components give warnings; unused Arduino GPIO does not',()=>{
 const result=scan([component('R1','resistor',[pin('1',null),pin('2','vcc')],{resistance:220}),component('D1','led2',[pin('anode','gnd'),pin('cathode','gnd')]),component('U1','ArduinoUnoRev3',[pin('D1',null),pin('GND',null)])]);
 assert.deepEqual(ids(result).sort(),['bypassed-D1','open-R1']);
});
test('native simulation explanations are preserved; stopped simulation suppresses stale flags',()=>{
 const part=component('U1','unknown',[pin('x','vcc')],{native:[{kind:'breakdown',reason:'Current through I/O pin D13 exceeds maximum.'}]});
 const result=scan([part],{simulation:'running'});
 assert.equal(result.findings[0].source,'Tinkercad simulator');assert.equal(result.findings[0].evidence,part.native[0].reason);
 assert.deepEqual(scan([part]).findings,[]);
});
test('Arduino supply-to-ground short is detected; unknown supply models do not get guessed',()=>{
 const terminals=[pin('5V','same'),pin('GND1','same'),pin('D1',null)];
 assert.ok(ids(scan([component('U1','ArduinoUnoRev3',terminals)])).some(id=>id.startsWith('short-')));
 assert.ok(ids(scan([component('U1','arduinoUno',terminals)])).some(id=>id.startsWith('short-')));
 assert.equal(scan([component('U1','mystery',terminals)]).findings.length,0);
});
test('breadboard terminal memberships do not create artificial LED branches',()=>{
 const result=scan([battery(),led('vcc','mid'),resistor('mid','gnd'),component('BB1','',[pin('a1','vcc'),pin('b1','vcc'),pin('a2','mid')],{typeName:'Breadboard'})]);
 assert.equal(result.ledPaths,1);assert.deepEqual(result.findings,[]);
});
test('unavailable data never produces a completed circuit result',()=>{
 assert.equal(analyze(null).supported,0);assert.deepEqual(analyze({schema:1,error:'format changed'}).findings,[]);
 assert.match(analyze(null).limitations[0],/unavailable/);
});

const uno=()=>component('U1','ArduinoUnoRev3',[pin('5V','vcc'),pin('3V3','aux'),pin('GND1','gnd'),pin('GND2','gnd'),pin('D8','gpio'),pin('D9','other-gpio')]);
test('GPIO-driven LED polarity is checked with a resistor on either side',()=>{
 for(const parts of [[led('mid','gnd'),resistor('gpio','mid')],[led('gpio','mid'),resistor('mid','gnd')],[led('vcc','mid'),resistor('mid','gpio')]]){
  const good=scan([uno(),...parts]);assert.deepEqual(good.findings,[]);assert.equal(good.ledPaths,1);
  const reversed=structuredClone(parts);reversed[0].terminals.reverse();[reversed[0].terminals[0].name,reversed[0].terminals[1].name]=['anode','cathode'];
  const bad=scan([uno(),...reversed]);assert.ok(ids(bad).includes('reversed-D1'));assert.equal(bad.ledPaths,1);assert.match(bad.findings[0].evidence,/GPIO|logic output/);
 }
});
test('GPIO current limiting is checked without guessing firmware output state',()=>{
 const result=scan([uno(),led('gpio','gnd')]);assert.ok(ids(result).includes('no-resistor-D1'));
 assert.equal(result.coverage.find(c=>c.id==='firmware').status,'not_checked');
});
test('shared ground aliases and unrelated loads on a rail do not hide reversed GPIO LEDs',()=>{
 const result=scan([uno(),led('gnd','mid'),resistor('mid','gpio'),component('LCD','lcd',[pin('VSS','gnd'),pin('VDD','vcc')])]);
 assert.ok(ids(result).includes('reversed-D1'));
});
test('GPIO-to-GPIO, unknown pins and auxiliary voltage paths remain unverified',()=>{
 for(const net of ['other-gpio','aux','unknown']){
  const result=scan([uno(),led('gpio','mid'),resistor('mid',net)]);
  assert.equal(result.ledPaths,0);assert.ok(!ids(result).includes('reversed-D1'));assert.ok(!ids(result).includes('no-resistor-D1'));
 }
});
test('partial topology and intermediate branches still prevent GPIO path inference',()=>{
 const parts=[uno(),led('gnd','mid'),resistor('mid','gpio')];
 assert.equal(scan(parts,{topologyComplete:false}).ledPaths,0);
 assert.equal(scan([...parts,component('X1','custom',[pin('x','mid')])]).ledPaths,0);
});
test('two parallel LEDs sharing anodes are valid; each needs its own series resistor',()=>{
 const result=scan([uno(),led('vcc','mid'),resistor('mid','gnd'),component('D2','led2',[pin('anode','vcc'),pin('cathode','second')]),component('R2','resistor',[pin('1','second'),pin('2','gnd')],{resistance:470})]);
 assert.deepEqual(result.findings,[]);assert.equal(result.ledPaths,2);
});
