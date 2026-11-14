import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun } from '../extension/review.js';
import { DEFAULT_PROFILE } from '../extension/profiles.js';
import { buildCorrectionPlan, correctionStatus } from '../extension/correction.js';
const component = (id, model, pins, resistance = null) => ({id, label:id, model, typeName:model,
  terminals:pins.map(([name,net]) => ({name,net})), properties:[], native:[], resistance});
const scene = () => ({schema:1, designId:'correction-fixture', title:'Correction fixture', source:'Test fixture', editable:true,
  simulation:'stopped', wireCount:3, components:[
    component('B1','battery9V',[['+','vcc'],['-','gnd']]),
    component('D1','led2',[['anode','vcc'],['cathode','mid']]),
    component('R1','resistor',[['1','mid'],['2','gnd']],0)]});
const profile = minimum => ({...structuredClone(DEFAULT_PROFILE), minLedResistance:minimum});
test('selected positive replacement produces a separate zero-finding static candidate without changing the source', async () => {
  const run = await createRun(scene()), original = structuredClone(run);
  const plan = await buildCorrectionPlan(run,{replacementResistance:470});
  assert.deepEqual(run,original);assert.equal(plan.changes.length,1);
  assert.deepEqual([plan.changes[0].before,plan.changes[0].after],[0,470]);
  assert.equal(plan.remaining.length,0);assert.equal(plan.candidate.analysis.findings.length,0);
  assert.equal(plan.baseDesignHash,run.provenance.designHash);
  assert.equal(correctionStatus(plan.candidate.snapshot,run.profile).simulationIncluded,false);
});
test('without an explicit value or project threshold, a zero-ohm resistor stays an unresolved repair', async () => {
  const plan = await buildCorrectionPlan(await createRun(scene()));
  assert.equal(plan.changes.length,0);assert.ok(plan.remaining.some(f=>f.rule==='resistance'));
});
test('project minimum creates a targeted correction and keeps all original profile switches unchanged', async () => {
  const raw=scene();raw.components[2].resistance=100;
  const p=profile(330);p.checks.ledMinimum=false;
  const run=await createRun(raw,p),plan=await buildCorrectionPlan(run);
  assert.equal(run.analysis.findings.length,0);assert.equal(plan.before.analysis.findings.length,1);
  assert.equal(plan.changes[0].after,330);assert.equal(plan.remaining.length,0);assert.equal(run.profile.checks.ledMinimum,false);
});
test('series resistor changes are combined and recalculated rather than applying a minimum to every resistor', async () => {
  const raw=scene();raw.components[2].terminals[1].net='more';raw.components.push(component('R2','resistor',[['1','more'],['2','gnd']],0));
  const plan=await buildCorrectionPlan(await createRun(raw,profile(1000)),{replacementResistance:100});
  assert.equal(plan.changes.length,2);assert.equal(new Set(plan.changes.map(c=>c.componentId)).size,2);
  assert.equal(plan.changes.reduce((n,c)=>n+c.after,0),1000);assert.equal(plan.remaining.length,0);
  plan.changes.forEach(c=>assert.equal(c.before,0));
});
test('supply shorts block apply and remain visible even when another repair can clear static warnings', async () => {
  const raw=scene();raw.components.push(component('B2','battery9V',[['+','short'],['-','short']]));
  const plan=await buildCorrectionPlan(await createRun(raw),{replacementResistance:470});
  assert.equal(plan.blockers.length,1);assert.equal(plan.changes.length,1);assert.ok(plan.remaining.some(f=>f.rule==='supplyShort'));
});
test('reversed LEDs, absent resistors and open pins remain concrete manual tasks', async () => {
  const raw=scene();raw.components=raw.components.slice(0,2);raw.components[1].terminals=[{name:'anode',net:'gnd'},{name:'cathode',net:'vcc'}];
  raw.components.push(component('C1','capacitor',[['1',null],['2',null]]));
  const plan=await buildCorrectionPlan(await createRun(raw),{replacementResistance:470});
  assert.equal(plan.changes.length,0);
  for(const rule of ['ledPolarity','ledResistance','openPins'])assert.ok(plan.remaining.some(f=>f.rule===rule));
});
test('stopping a candidate simulation never clears the original simulator fault from the correction task list', async () => {
  const raw=scene();raw.simulation='running';raw.components[1].native=[{kind:'breakdown',reason:'Maximum current exceeded'}];raw.components[1].nativeSupported=true;
  const run=await createRun(raw),plan=await buildCorrectionPlan(run,{replacementResistance:470});
  assert.ok(plan.remaining.some(f=>f.rule==='native'));assert.equal(plan.candidate.snapshot.simulation,'stopped');
  assert.equal(correctionStatus(raw,run.profile,{live:true}).simulationIncluded,true);
});
test('verification counts hidden rules and never treats imported or saved evidence as current', () => {
  const p=profile(null);Object.keys(p.checks).forEach(k=>p.checks[k]=false);
  const raw=scene(),status=correctionStatus(raw,p,{live:true});
  assert.equal(status.warnings,2);assert.equal(status.clear,false);assert.equal(status.current,true);
  raw.imported=true;assert.equal(correctionStatus(raw,p,{live:true}).current,false);
  assert.equal(correctionStatus(scene(),p).current,false);
});
test('negative, zero, nonfinite, out-of-range and nonnumeric automatic replacement values are rejected', async () => {
  const run=await createRun(scene());
  for(const value of [0,-1,NaN,Infinity,1e10,'470'])await assert.rejects(buildCorrectionPlan(run,{replacementResistance:value}),/replacement resistance/);
});
test('known negative resistors can be replaced but no new static finding is accepted', async () => {
  const raw=scene();raw.components[2].resistance=-5;
  const plan=await buildCorrectionPlan(await createRun(raw),{replacementResistance:470});assert.equal(plan.changes[0].after,470);
  const incomplete=scene();incomplete.components[2].resistance=-5;
  const conservative=await buildCorrectionPlan(await createRun(incomplete,profile(1000)),{replacementResistance:100});
  assert.equal(conservative.changes.length,0);assert.ok(conservative.remaining.some(f=>f.rule==='resistance'));
});
