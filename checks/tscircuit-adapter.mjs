// CircuitCheck adapter; upstream checks are MIT, copyright 2024 tscircuit Inc.
import {createHash} from 'node:crypto';
import {source_component_base,source_pin_attributes,source_port,source_net,source_trace,any_circuit_element} from 'circuit-json';

export const ADAPTER_VERSION='circuitcheck-tscircuit/1';
const own=(o,key)=>Object.hasOwn(o,key);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function label(value,context,{empty=false}={}){
 if(typeof value!=='string'||value.length>1000||(!empty&&!value)||/[\u0000-\u001f]/.test(value))throw Error(`Invalid ${context}.`);
 return value;
}
const id=(kind,...values)=>kind+'_'+createHash('sha256').update(JSON.stringify(values)).digest('hex').slice(0,24);

export function unwrapCapture(value){
 const capture=value?.run?.snapshot??value?.snapshot??value;
 if(!object(capture)||capture.schema!==1||!Array.isArray(capture.components)||!capture.components.length||capture.components.length>500)throw Error('Expected a schema:1 Circuit Check capture with 1–500 components.');
 return capture;
}

export function adaptCapture(value){
 const capture=unwrapCapture(value),circuitJson=[],sourceMap=Object.create(null),components=[],ports=[],nets=new Map(),seen=new Set();
 let pinCount=0;
 for(const original of capture.components){
  if(!object(original))throw Error('Invalid captured component.');
  const componentId=label(original.id,'component identifier');
  if(seen.has(componentId))throw Error('Captured component identifiers must be unique.');seen.add(componentId);
  if(!Array.isArray(original.terminals)||(pinCount+=original.terminals.length)>5000)throw Error('Expected at most 5,000 captured pins.');
  const sourceComponentId=id('cc_component',componentId),name=typeof original.label==='string'&&original.label?label(original.label,'component label'):'Unnamed component';
  // simple_pinout is a structural pin container, never an inferred chip or role.
  const declaredChip=original.ftype==='simple_chip';
  const component=source_component_base.parse({type:'source_component',source_component_id:sourceComponentId,name,ftype:declaredChip?'simple_chip':'simple_pinout'});
  const info={componentId,sourceComponentId,name,declaredChip,pinInventoryComplete:original.pinInventoryComplete===true,pinAttributesComplete:original.pinAttributesComplete===true,requiresPower:original.requiresPower===true,requiresGround:original.requiresGround===true,ports:[]};
  sourceMap[sourceComponentId]={component_id:componentId,reference:name};
  const keys=new Set();
  original.terminals.forEach((pin,index)=>{
   if(!object(pin))throw Error('Invalid captured pin.');
   const key=own(pin,'key')&&pin.key!==''?label(pin.key,'pin key'):`index:${index}`;
   if(keys.has(key))throw Error('Pin keys must be unique within a component.');keys.add(key);
   const pinName=typeof pin.name==='string'&&pin.name?label(pin.name,'pin name'):'Unnamed pin';
   const knownNet=own(pin,'net');
   if(knownNet&&pin.net!==null&&typeof pin.net!=='string')throw Error('Pin nets must be explicit strings or null.');
   if(typeof pin.net==='string')label(pin.net,'net identifier');
   const attributes=pin.attributes??{};
   if(!object(attributes))throw Error('Pin attributes must be an object.');
   if(Object.keys(attributes).some(key=>!own(source_pin_attributes.shape,key)))throw Error('Unsupported pin attribute. Use the documented Circuit JSON pin-attribute names.');
   // Do not coerce null, strings or unknown flags into known electrical facts.
   for(const [key,value] of Object.entries(attributes)){
    if(key==='provides_voltage'||key==='requires_voltage'){
     if(typeof value!=='number'||!Number.isFinite(value))throw Error('Voltage checks require explicit finite numeric volts.');
    }else if(value===null||value===undefined)throw Error('Omit unknown pin attributes; null is not a known pin specification.');
   }
   const parsed=source_pin_attributes.parse(attributes),sourcePortId=id('cc_port',componentId,key);
   const port=source_port.parse({type:'source_port',source_port_id:sourcePortId,source_component_id:sourceComponentId,name:pinName,...parsed});
   circuitJson.push(port);ports.push({port,component:info,knownNet,key,index,net:knownNet?pin.net:null});info.ports.push(port);
   sourceMap[sourcePortId]={component_id:componentId,reference:name,pin_key:key,pin_name:pinName,pin_index:index,net:knownNet?pin.net:null,net_known:knownNet};
   if(knownNet&&pin.net!==null&&pin.net!==''){
    if(!nets.has(pin.net))nets.set(pin.net,[]);nets.get(pin.net).push(sourcePortId);
   }
  });
  if(original.internalConnections!==undefined){
   if(!Array.isArray(original.internalConnections)||original.internalConnections.length>500)throw Error('Invalid explicit internal pin connections.');
   component.internally_connected_source_port_ids=original.internalConnections.map(group=>{
    if(!Array.isArray(group)||group.length<2||new Set(group).size!==group.length||group.some(key=>!keys.has(key)))throw Error('Internal connections must reference distinct existing pin keys.');
    return group.map(key=>id('cc_port',componentId,key));
   });
  }
  circuitJson.push(component);components.push(info);
 }
 for(const [name,members] of nets){
  const netId=id('cc_net',name);circuitJson.push(source_net.parse({type:'source_net',source_net_id:netId,name,member_source_group_ids:[]}));
  sourceMap[netId]={net:name};
  // A single named pin is not proof of a connection to anything else.
  if(members.length>1)circuitJson.push(source_trace.parse({type:'source_trace',source_trace_id:id('cc_membership',name),connected_source_port_ids:members,connected_source_net_ids:[netId]}));
 }
 if(capture.connections!==undefined){
  if(!Array.isArray(capture.connections)||capture.connections.length>5000)throw Error('Expected at most 5,000 explicit connections.');
  const wireIds=new Set();
  for(const wire of capture.connections){
   if(!object(wire)||!object(wire.from)||!object(wire.to))throw Error('Connections need from/to componentId and pinKey endpoints.');
   const endpoints=[wire.from,wire.to].map(endpoint=>{
    const found=ports.find(p=>p.component.componentId===endpoint.componentId&&p.key===endpoint.pinKey);
    if(!found)throw Error('Connection refers to a missing captured endpoint.');return found.port.source_port_id;
   });
   const wireId=wire.id===undefined?id('cc_wire',...endpoints):id('cc_wire',label(wire.id,'connection identifier'));
   if(endpoints[0]===endpoints[1])throw Error('A captured wire must join distinct endpoints; a self-loop does not establish connectivity.');
   if(wireIds.has(wireId))throw Error('Connection identifiers must be unique.');wireIds.add(wireId);
   circuitJson.push(source_trace.parse({type:'source_trace',source_trace_id:wireId,connected_source_port_ids:endpoints,connected_source_net_ids:[]}));
   sourceMap[wireId]={connection_id:wire.id??null,endpoints:endpoints.map(p=>sourceMap[p])};
  }
 }
 // Validate the emitted subset against the installed, pinned union schema too.
 for(const element of circuitJson)any_circuit_element.parse(element);
 return {circuitJson,sourceMap,components,ports,topologyComplete:capture.topologyComplete===true,source:typeof capture.source==='string'?capture.source:'Captured Circuit Check input',capture};
}
