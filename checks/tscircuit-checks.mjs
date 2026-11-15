import * as upstream from '@tscircuit/checks';
import {getSourcePortConnectivityMapFromCircuitJson} from 'circuit-json-to-connectivity-map';
import {adaptCapture,ADAPTER_VERSION} from './tscircuit-adapter.mjs';

export const ENGINE='@tscircuit/checks',ENGINE_VERSION='0.0.279',SCHEMA_VERSION='0.0.550';
export const RULES=['checkPinMustBeConnected','checkAllPinsInComponentAreUnderspecified','checkNoPowerPinDefined','checkNoGroundPinDefined','checkSourcePinVoltageCompatibility'];
const descriptions={
 checkPinMustBeConnected:['Required pin connectivity','A pin explicitly marked as requiring a connection has no captured external or declared internal connection.','Connect the pin according to the component documentation, or correct its explicit requirement. Missing wiring is not added automatically.'],
 checkAllPinsInComponentAreUnderspecified:['Chip pin specifications','The captured chip declares a complete pin-attribute inventory, but none of its pins has a specification. This is missing documentation, not proof of an electrical fault.','Supply verified pin attributes from the component documentation.'],
 checkNoPowerPinDefined:['Declared chip power pins','This chip explicitly declares that it requires power, but its complete captured pin metadata does not identify a required power pin.','Review the verified pin specification and document the intended power pin. No supply voltage is assumed.'],
 checkNoGroundPinDefined:['Declared chip ground pins','This chip explicitly declares that it requires ground, but its complete captured pin metadata does not identify a required ground pin.','Review the verified pin specification and document the intended ground pin. A pin named GND is not automatically treated as ground.'],
 checkSourcePinVoltageCompatibility:['Explicit pin voltage compatibility','Connected pins declare different scalar supply and required voltages. This compares provided metadata; no operating range or tolerance is inferred.','Review the documented supply and input requirements. Correct the connection or metadata and check again.']
};
const unsupported=[['routing','Copper routing, clearances and board placement','PCB copper geometry, layers, outlines and physical constraints are not adapted. Native KiCad DRC remains authoritative.'],['schematic_layout','Schematic layout and styling','Native symbol-body geometry and style constraints are not converted to Circuit JSON.'],['other_rules','Other upstream checks','This integration enables only the five named source connectivity/pin-specification checks. It does not run aggregate routing, placement, switch or other checks.']];
export function unsupportedCoverage(){return unsupported.map(([rule,name,message])=>({id:'tscircuit:'+rule,name:'tscircuit · '+name,engine:ENGINE,engine_version:ENGINE_VERSION,status:'unsupported',evaluation_status:'unsupported',count:null,message,basis:'No guessed geometry, circuit function or physical rules.'}))}

function executionScope(model,rule){
 const {components,ports,circuitJson,topologyComplete}=model;
 let eligible=[],total=0,reason='',input=circuitJson;
 if(rule==='checkPinMustBeConnected'){
  const required=ports.filter(p=>p.port.must_be_connected===true);total=required.length;
  eligible=required.filter(p=>topologyComplete&&p.knownNet);
  reason=!topologyComplete?'An explicitly complete connection capture is required.':'Explicit must_be_connected flags and known net/null assignments are required.';
  const allowed=new Set(eligible.map(p=>p.port.source_port_id));
  input=circuitJson.map(e=>e.type==='source_port'&&!allowed.has(e.source_port_id)?Object.fromEntries(Object.entries(e).filter(([key])=>key!=='must_be_connected')):e);
 }else if(rule==='checkSourcePinVoltageCompatibility'){
  const suppliers=ports.filter(p=>typeof p.port.provides_voltage==='number'),consumers=ports.filter(p=>typeof p.port.requires_voltage==='number');
  total=consumers.length;
  // The check itself traces declared nets/internal connections. Require complete
  // capture and known assignments before interpreting absent/mismatched wiring.
  const connectivity=getSourcePortConnectivityMapFromCircuitJson(circuitJson);
  eligible=topologyComplete&&ports.every(p=>p.knownNet)?consumers.filter(consumer=>{
   if(consumer.port.required_voltage_tolerance!==undefined)return false;
   const net=connectivity.getNetConnectedToId(consumer.port.source_port_id);
   return net!==undefined&&suppliers.some(supplier=>supplier!==consumer&&connectivity.getNetConnectedToId(supplier.port.source_port_id)===net);
  }):[];
  const allowed=new Set(eligible.map(p=>p.port.source_port_id));
  input=circuitJson.map(e=>e.type==='source_port'&&!allowed.has(e.source_port_id)?Object.fromEntries(Object.entries(e).filter(([key])=>key!=='requires_voltage')):e);
  reason='Requires a complete connection capture and connected pins with explicit finite numeric provides_voltage/requires_voltage metadata. Ranges/tolerances are unsupported by this nominal-only adapter. Unpowered or undocumented pins are not reported as passing voltage checks.';
 }else{
  const chips=components.filter(c=>c.declaredChip);total=chips.length;
  eligible=chips.filter(c=>c.pinInventoryComplete&&c.pinAttributesComplete&&c.ports.length>0);
  reason='Requires explicit ftype:simple_chip and complete pin/attribute inventories; unknown component types and omitted metadata are skipped.';
  if(rule==='checkNoPowerPinDefined'||rule==='checkNoGroundPinDefined'){
   eligible=eligible.filter(c=>(rule==='checkNoPowerPinDefined'?c.requiresPower:c.requiresGround)&&c.ports.filter(p=>p.do_not_connect!==true).length>=2);
   if(rule==='checkNoPowerPinDefined')eligible=eligible.filter(c=>!c.ports.filter(p=>p.do_not_connect!==true).every(p=>p.is_passive===true));
   reason+=' Power/ground requirements must be explicitly declared; no requirement is inferred from chip naming.';
  }
  const ids=new Set(eligible.map(c=>c.sourceComponentId));
  input=circuitJson.filter(e=>e.type==='source_component'?ids.has(e.source_component_id):e.type==='source_port'&&ids.has(e.source_component_id));
 }
 return {input,eligible:eligible.length,total,reason};
}

export function runCapturedChecks(value,{implementations=upstream}={}){
 const base={engine:ENGINE,engine_version:ENGINE_VERSION,schema_version:SCHEMA_VERSION,adapter_version:ADAPTER_VERSION,findings:[],coverage:[],circuit_json:[],source_map:{}};
 let model;
 try{model=adaptCapture(value)}catch(error){
  base.coverage=RULES.map(rule=>({id:'tscircuit:'+rule,name:'tscircuit · '+descriptions[rule][0],engine:ENGINE,engine_version:ENGINE_VERSION,status:'failed',evaluation_status:'failed',count:null,message:'Captured input could not be adapted: '+error.message,basis:rule}));
  base.coverage.push(...unsupportedCoverage());return base;
 }
 base.circuit_json=model.circuitJson;base.source_map=model.sourceMap;
 for(const rule of RULES){
  const scope=executionScope(model,rule),row={id:'tscircuit:'+rule,name:'tscircuit · '+descriptions[rule][0],engine:ENGINE,engine_version:ENGINE_VERSION,basis:rule,evaluated_items:scope.eligible,skipped_items:Math.max(0,scope.total-scope.eligible)};
  if(!scope.eligible){base.coverage.push({...row,status:'skipped',evaluation_status:'skipped',count:null,message:scope.reason});continue}
  try{
   const raw=implementations[rule](structuredClone(scope.input));
   if(!Array.isArray(raw))throw Error('Check returned an invalid result.');
   const normalized=raw.map(issue=>{
    const type=issue.type,warning=typeof issue.warning_type==='string'||type?.endsWith('_warning'),error=typeof issue.error_type==='string'||type?.endsWith('_error');
    if(!warning&&!error||typeof issue.message!=='string')throw Error('Check returned an unrecognized diagnostic severity or message.');
    const componentIds=[...new Set([...(issue.source_component_ids||[]),issue.source_component_id].filter(Boolean))];
    const portIds=[...new Set([...(issue.source_port_ids||[]),issue.source_port_id].filter(Boolean))];
    const refs=[...componentIds,...portIds].map(id=>model.sourceMap[id]).filter(Boolean);
    if(!refs.length)throw Error('Diagnostic source identifiers did not map to the captured input.');
    return {rule,severity:warning?'warning':'error',upstream_type:type,evidence:issue.message,explanation:descriptions[rule][1],suggestion:descriptions[rule][2],source_refs:refs,source_component_ids:[...new Set(refs.map(r=>r.component_id).filter(Boolean))],circuit_json_component_ids:componentIds,circuit_json_port_ids:portIds,raw:issue};
   });
   base.findings.push(...normalized);
   base.coverage.push({...row,status:row.skipped_items?'partial':'checked',evaluation_status:'evaluated',count:raw.length,message:`Evaluated ${scope.eligible} captured item(s). ${row.skipped_items?row.skipped_items+' item(s) skipped. ':''}${scope.reason}`});
  }catch(error){base.coverage.push({...row,status:'failed',evaluation_status:'failed',count:null,message:`${rule} failed: ${error.message}. No successful result is established.`})}
 }
 base.coverage.push(...unsupportedCoverage());return base;
}
