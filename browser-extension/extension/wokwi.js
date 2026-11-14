// Wokwi v1 diagrams. Only explicit wires and known MCU ground aliases are merged.
export const BOARD_TYPES = new Set(['wokwi-arduino-uno','wokwi-arduino-nano','wokwi-arduino-mega','wokwi-esp32-devkit-v1','board-esp32-devkit-c-v4','wokwi-pi-pico','board-pi-pico-w','board-pi-pico-2','board-pi-pico-2w']);
const simple = {'wokwi-resistor':['1','2'],'wokwi-led':['A','C']};
const models = {'wokwi-resistor':'resistor','wokwi-led':'led2'};
const clone = value => JSON.parse(JSON.stringify(value));
export function validateDiagram(raw) {
  if(!raw || typeof raw!=='object' || Array.isArray(raw) || raw.version!==1 || !Array.isArray(raw.parts) || !Array.isArray(raw.connections))throw Error('Expected a Wokwi version 1 diagram with parts and connections arrays.');
  if(JSON.stringify(raw).length>2097152 || raw.parts.length>500 || raw.connections.length>10000)throw Error('Diagram limit: 2 MB, 500 parts and 10,000 connections.');
  const ids=new Map();
  for(const p of raw.parts){
    if(!p || typeof p.id!=='string' || !p.id || p.id.length>150 || p.id.includes(':') || p.id.startsWith('$') || ids.has(p.id))throw Error('Part IDs must be unique nonempty strings without colons or a leading $.');
    if(typeof p.type!=='string' || !p.type || p.type.length>200)throw Error('Every part needs a type.');
    if(p.attrs!==undefined && (!p.attrs || typeof p.attrs!=='object' || Array.isArray(p.attrs) || Object.values(p.attrs).some(v=>typeof v!=='string')))throw Error('Part attributes must be an object of strings.');
    for(const k of ['left','top','rotate'])if(p[k]!==undefined && (typeof p[k]!=='number'||!Number.isFinite(p[k])))throw Error('Invalid part coordinate or rotation.');
    ids.set(p.id,p);
  }
  for(const w of raw.connections){
    if(!Array.isArray(w)||w.length<3||w.length>4||typeof w[2]!=='string'||(w[3]!==undefined&&(!Array.isArray(w[3])||w[3].some(s=>typeof s!=='string'))))throw Error('Each connection needs two endpoints, a color and an optional route array.');
    for(const ep of w.slice(0,2)){
      if(typeof ep!=='string'||ep.length>300||!ep.includes(':'))throw Error('Invalid wire endpoint.');
      const i=ep.indexOf(':'),id=ep.slice(0,i),pin=ep.slice(i+1);if(!pin||pin.length>150)throw Error('Wire endpoints need a pin name.');
      if(id==='$serialMonitor'&&['TX','RX'].includes(pin))continue;
      const p=ids.get(id);if(!p)throw Error('Wire references missing part '+id+'.');
      if(simple[p.type]&&!simple[p.type].includes(pin))throw Error('Unknown '+p.type+' pin '+pin+'.');
    }
  }
  return clone(raw);
}
export function normalizeDiagram(raw,meta={}) {
  const diagram=validateDiagram(raw),parent=new Map(),wired=new Set(),pins=new Map();
  const find=x=>{if(!parent.has(x))parent.set(x,x);let r=x;while(parent.get(r)!==r)r=parent.get(r);while(x!==r){let n=parent.get(x);parent.set(x,r);x=n;}return r;};
  const union=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent.set(b,a);};
  const pin=(id,name)=>{if(!pins.has(id))pins.set(id,new Set());pins.get(id).add(name);find(id+':'+name);};
  for(const p of diagram.parts)for(const n of simple[p.type]||[])pin(p.id,n);
  for(const w of diagram.connections)for(const ep of w.slice(0,2)){let i=ep.indexOf(':');pin(ep.slice(0,i),ep.slice(i+1));wired.add(ep);}
  for(const w of diagram.connections)union(w[0],w[1]);
  for(const p of diagram.parts)if(BOARD_TYPES.has(p.type)){const g=[...(pins.get(p.id)||[])].filter(n=>/^GND(?:[.\d_-].*)?$/.test(n));for(const n of g.slice(1))union(p.id+':'+g[0],p.id+':'+n);}
  const groups=new Map();for(const x of wired){let r=find(x);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(x);}
  const names=new Map([...groups].map(([r,ps])=>[r,'net-'+[...ps].sort()[0]]));
  const terminals=id=>[...(pins.get(id)||[])].map(name=>({name,key:name,net:names.get(find(id+':'+name))||null,hasBreadboardPin:false}));
  const components=diagram.parts.map(p=>{
    const v=p.type==='wokwi-resistor'?(p.attrs?.value??'1000'):null;
    const resistance=v!==null&&/^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?\s*$/i.test(v)&&Number.isFinite(Number(v))?Number(v):null;
    return {id:p.id,label:p.id,typeName:p.type,model:models[p.type]||p.type,terminals:terminals(p.id),properties:Object.entries(p.attrs||{}).filter(([n])=>['color','voltage','capacitance'].includes(n)).map(([name,value])=>({name,value,prefix:'',unit:''})),resistance,native:[],nativeSupported:false,nested:false,position:{x:p.left||0,y:p.top||0,angle:p.rotate||0}};
  });
  if(pins.has('$serialMonitor'))components.push({id:'$serialMonitor',label:'Serial Monitor',typeName:'Wokwi serial monitor',model:'serial-monitor',terminals:terminals('$serialMonitor'),properties:[],resistance:null,native:[],nativeSupported:false,nested:false,position:null});
  if(components.length>500)throw Error('The serial monitor counts toward the 500 component limit.');
  return {schema:1,platform:'wokwi',title:meta.title||'Wokwi diagram',designId:meta.designId||'diagram-file',source:meta.source||'Wokwi diagram.json file',captureMode:meta.captureMode||'file',imported:!!meta.imported,editable:false,simulation:'unknown',components,netCount:names.size,wireCount:diagram.connections.length,diagram,capturedAt:new Date().toISOString()};
}
const memberships=s=>{const out=new Map();for(const c of s.components)for(const p of c.terminals)if(p.net){if(!out.has(p.net))out.set(p.net,[]);out.get(p.net).push(c.id+':'+p.name);}return new Map([...out].map(([net,pins])=>[net,[...new Set(pins)].sort()]));};
export function exportDiagram(original,draft) {
  if(!original.diagram)throw Error('This review has no source diagram.json. Capture or import the Wokwi diagram first.');
  const diagram=validateDiagram(original.diagram),oldParts=new Map(diagram.parts.map(p=>[p.id,p])),oldComponents=new Map(original.components.map(c=>[c.id,c]));
  const newLeft=Math.max(0,...diagram.parts.map(p=>p.left||0))+400,newTop=Math.min(0,...diagram.parts.map(p=>p.top||0));let added=0;
  const nativeType=c=>({resistor:'wokwi-resistor',led2:'wokwi-led'}[c.model]||c.model);
  diagram.parts=draft.components.filter(c=>c.id!=='$serialMonitor').map(c=>{
    const old=oldParts.get(c.id),before=oldComponents.get(c.id),same=old&&before?.model===c.model;
    const template=same?old:diagram.parts.find(p=>nativeType(c)===p.type);
    const p=template?clone(template):{type:nativeType(c),attrs:{},left:0,top:0};p.id=c.id;p.type=same?old.type:nativeType(c);p.attrs=p.attrs||{};
    if(old){p.left=old.left??0;p.top=old.top??0;p.rotate=old.rotate??0;}else{p.left=newLeft+added++*180;p.top=newTop;}
    if(c.model==='resistor'){if(c.resistance===null)throw Error('Choose a numeric resistance before exporting '+c.id+'.');p.attrs.value=String(c.resistance);}
    for(const prop of c.properties||[])if(['color','voltage','capacitance'].includes(prop.name))p.attrs[prop.name]=prop.value;
    return p;
  });
  const oldNets=memberships(original),nets=memberships(draft),signature=pins=>JSON.stringify(pins),unchanged=new Set(),oldSignatures=new Set([...oldNets.values()].map(signature));
  for(const [net,pins] of nets)if(oldSignatures.has(signature(pins)))unchanged.add(net);
  const endpointNet=new Map();for(const [net,pins] of nets)for(const pin of pins)endpointNet.set(pin,net);
  diagram.connections=diagram.connections.filter(w=>{const a=endpointNet.get(w[0]);return a&&a===endpointNet.get(w[1])&&unchanged.has(a);});
  for(const [net,pins] of nets)if(!unchanged.has(net))for(const pin of pins.slice(1))diagram.connections.push([pins[0],pin,'green',[]]);
  const result=validateDiagram(diagram),roundTrip=memberships(normalizeDiagram(result)),actual=new Set([...roundTrip.values()].filter(p=>p.length>1).map(signature)),expected=new Set([...nets.values()].filter(p=>p.length>1).map(signature));
  if(actual.size!==expected.size || [...actual].some(p=>!expected.has(p)))throw Error('This draft splits pins that are internally joined in Wokwi. Reconnect the board ground aliases before exporting.');
  return result;
}
