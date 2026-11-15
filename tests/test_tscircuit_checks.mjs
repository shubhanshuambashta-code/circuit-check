import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as upstream from '@tscircuit/checks';
import {any_circuit_element} from 'circuit-json';
import {adaptCapture} from '../checks/tscircuit-adapter.mjs';
import {runCapturedChecks} from '../checks/tscircuit-checks.mjs';
const fixture=name=>JSON.parse(readFileSync(new URL(`../fixtures/captured-checks/${name}.json`,import.meta.url)));
const coverage=(r,rule)=>r.coverage.find(c=>c.id==='tscircuit:'+rule);

test('explicit required floating pin preserves upstream error severity and source identity',()=>{
 const capture=fixture('required-pin-violation'),before=JSON.stringify(capture),adapted=adaptCapture(capture),report=runCapturedChecks(capture);
 const raw=upstream.checkPinMustBeConnected(adapted.circuitJson);assert.equal(raw.length,1);
 const issue=report.findings.find(f=>f.rule==='checkPinMustBeConnected');assert(issue);assert.equal(issue.severity,'error');assert.equal(issue.evidence,raw[0].message);assert.equal(issue.upstream_type,raw[0].type);
 assert(issue.source_refs.some(r=>r.component_id==='controller:original'&&r.pin_key==='signal'));
 assert.equal(JSON.stringify(capture),before);
 assert(report.circuit_json.every(element=>any_circuit_element.safeParse(element).success));
});

test('valid documented circuit evaluates five applicable checks without findings',()=>{
 const report=runCapturedChecks(fixture('valid'));assert.deepEqual(report.findings,[]);
 const evaluated=report.coverage.filter(c=>c.evaluation_status==='evaluated');assert.equal(evaluated.length,5);
 assert(evaluated.every(c=>c.status==='checked'&&c.count===0));
 assert(report.coverage.filter(c=>c.status==='unsupported').every(c=>c.count===null));
});

test('incomplete capture skips missing-data checks rather than passing them',()=>{
 const report=runCapturedChecks(fixture('incomplete'));assert.deepEqual(report.findings,[]);
 assert.equal(report.coverage.filter(c=>c.status==='skipped').length,5);
 assert(report.coverage.every(c=>c.count===null));
});

test('complete explicitly underspecified chip yields upstream warnings without inferring GND',()=>{
 const capture=fixture('underspecified'),report=runCapturedChecks(capture);
 assert.equal(report.findings.length,3);assert(report.findings.every(f=>f.severity==='warning'));
 assert(report.findings.some(f=>f.rule==='checkNoGroundPinDefined'));
 assert(report.circuit_json.filter(e=>e.type==='source_net').every(e=>e.is_ground===undefined&&e.is_power===undefined));
 assert(report.circuit_json.filter(e=>e.type==='source_port').every(e=>e.requires_ground===undefined));
});

test('unknown models and pin names never become inferred chip roles or requirements',()=>{
 const capture={schema:1,topologyComplete:true,components:[{id:'part',label:'U99',model:'processor-5V',terminals:[{name:'GND',net:null},{name:'VCC',net:null}]}]};
 const report=runCapturedChecks(capture);assert.deepEqual(report.findings,[]);
 assert(report.coverage.every(c=>c.status==='skipped'||c.status==='unsupported'));
 assert.equal(report.circuit_json.find(e=>e.type==='source_component').ftype,'simple_pinout');
});

test('pin keys disambiguate duplicate names and survive component reordering',()=>{
 const capture=fixture('valid');capture.components[0].id='original / "id" Ω';
 capture.components[0].terminals[2]={key:'signal-original',name:'VCC',net:null,attributes:{must_be_connected:true}};
 const one=runCapturedChecks(capture);capture.components.reverse();const two=runCapturedChecks(capture);
 const a=one.findings.find(f=>f.rule==='checkPinMustBeConnected'),b=two.findings.find(f=>f.rule==='checkPinMustBeConnected');
 assert.deepEqual(a.circuit_json_port_ids,b.circuit_json_port_ids);
 assert(a.source_refs.some(r=>r.component_id==='original / "id" Ω'&&r.pin_key==='signal-original'));
});

test('single-pin net assignment is not invented external wiring',()=>{
 const capture=fixture('valid');capture.components.pop();const report=runCapturedChecks(capture);
 assert(report.findings.some(f=>f.rule==='checkPinMustBeConnected'&&f.source_refs.some(r=>r.pin_key==='signal')));
});

test('self-loops and empty net identifiers cannot manufacture a connected pin',()=>{
 const capture=fixture('required-pin-violation');capture.connections=[{from:{componentId:'controller:original',pinKey:'signal'},to:{componentId:'controller:original',pinKey:'signal'}}];
 let report=runCapturedChecks(capture);assert(report.coverage.filter(c=>c.status!=='unsupported').every(c=>c.status==='failed'));
 delete capture.connections;capture.components[0].terminals[2].net='';report=runCapturedChecks(capture);
 assert(report.coverage.filter(c=>c.status!=='unsupported').every(c=>c.status==='failed'));
});

test('explicit connection endpoints and declared internal connections are respected',()=>{
 const capture=fixture('required-pin-violation');capture.components[2].terminals[0].net=null;
 capture.connections=[{id:'wire-original',from:{componentId:'controller:original',pinKey:'signal'},to:{componentId:'load:original',pinKey:'1'}}];
 let report=runCapturedChecks(capture);assert(!report.findings.some(f=>f.rule==='checkPinMustBeConnected'));
 assert(Object.values(report.source_map).some(ref=>ref.connection_id==='wire-original'));
 delete capture.connections;capture.components[0].internalConnections=[['signal','supply']];report=runCapturedChecks(capture);
 assert(!report.findings.some(f=>f.rule==='checkPinMustBeConnected'));
});

test('explicit scalar voltage mismatch remains an upstream error; no pair or tolerance is skipped',()=>{
 const capture=fixture('valid');capture.components[0].terminals[0].attributes.requires_voltage=3.3;
 let report=runCapturedChecks(capture);assert(report.findings.some(f=>f.rule==='checkSourcePinVoltageCompatibility'&&f.severity==='error'));
 capture.components[0].terminals[0].net='unpowered';report=runCapturedChecks(capture);
 assert.equal(coverage(report,'checkSourcePinVoltageCompatibility').status,'skipped');
 capture.components[0].terminals[0].net='rail';capture.components[0].terminals[0].attributes.required_voltage_tolerance=0.1;
 report=runCapturedChecks(capture);assert.equal(coverage(report,'checkSourcePinVoltageCompatibility').status,'skipped');
});

test('one failed check has null count and cannot erase results from other checks',()=>{
 const report=runCapturedChecks(fixture('required-pin-violation'),{implementations:{...upstream,checkPinMustBeConnected(){throw Error('fixture check failure')}}});
 const failed=coverage(report,'checkPinMustBeConnected');assert.equal(failed.status,'failed');assert.equal(failed.count,null);assert.match(failed.message,/fixture check failure/);
 assert.equal(coverage(report,'checkNoPowerPinDefined').evaluation_status,'evaluated');
});

test('malformed endpoints and invalid attributes fail adaptation with no passed checks',()=>{
 const capture=fixture('valid');capture.connections=[{from:{componentId:'missing',pinKey:'x'},to:{componentId:'load:original',pinKey:'1'}}];
 let report=runCapturedChecks(capture);assert(report.coverage.filter(c=>c.status!=='unsupported').every(c=>c.status==='failed'&&c.count===null));
 delete capture.connections;capture.components[0].terminals[0].attributes.requires_voltage='unknown';report=runCapturedChecks(capture);
 assert(report.coverage.filter(c=>c.status!=='unsupported').every(c=>c.status==='failed'));
});

test('mixed complete/incomplete chip inventories retain partial scope',()=>{
 const capture=fixture('valid');capture.components.push({id:'unknown-chip',label:'U2',ftype:'simple_chip',terminals:[{key:'1',name:'1',net:null}]});
 const row=coverage(runCapturedChecks(capture),'checkAllPinsInComponentAreUnderspecified');
 assert.equal(row.status,'partial');assert.equal(row.evaluated_items,1);assert.equal(row.skipped_items,1);assert.equal(row.count,0);
});
