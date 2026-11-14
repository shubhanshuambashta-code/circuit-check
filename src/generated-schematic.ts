export interface SchematicPin {name:string;net:string|null}
export interface SchematicPart {id:string;label:string;model:string;value:string;pins:SchematicPin[]}
export interface SchematicSource {title:string;source:string;parts:SchematicPart[];notes:string[]}
export const SCHEMATIC_NOTE='Generated from the available pin and net connections, not recovered from the original schematic. Open and unfinished circuits are supported: unconnected pins stay marked ×, and missing wires are not added. Matching net labels show recorded net membership, not proof of a closed or fully routed circuit. Review component symbols, values, pin roles and missing connections before use. This drawing does not verify circuit operation or firmware and does not change your source circuit.';
type Row=Record<string,unknown>;
const isRow=(v:unknown):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v);
const row=(v:unknown):Row=>isRow(v)?v:{};
function text(v:unknown,fallback=''):string {if(v===undefined||v===null)return fallback;if(typeof v!=='string'&&typeof v!=='number')throw Error('Expected a pin, component or net label.');const s=String(v);if(s.length>1000)throw Error('Circuit labels must be at most 1,000 characters.');if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s))throw Error('Circuit labels contain unsupported control characters.');return s;}
function bounded(source:SchematicSource):SchematicSource {
 if(!source.parts.length)throw Error('No electrical components were found. Import circuit connections, not an image or PDF.');
 if(source.parts.length>500||source.parts.reduce((n,p)=>n+p.pins.length,0)>5000)throw Error('Schematic limit: 500 components and 5,000 pins.');
 if(!source.parts.some(p=>p.pins.length))throw Error('No pin connections are available. Run board checks or import a circuit with explicit connections.');
 const ids=new Set<string>();for(const p of source.parts){if(!p.id||ids.has(p.id))throw Error('Component IDs must be unique.');ids.add(p.id);}
 return source;
}
export function schematicFromGeometry(geometry:unknown,title='Current circuit'):SchematicSource {
 const objects=row(geometry).objects;if(!Array.isArray(objects)||objects.length>50000)throw Error('PCB connectivity is unavailable. Run circuit checks first.');
 const groups=new Map<string,SchematicPart>();
 const components=new Map(objects.filter(o=>row(o).kind==='component').map(o=>[text(row(o).id),row(o)]));
 for(const item of objects){const o=row(item);if(o.kind!=='pad'||!text(o.pad))continue;
  const id=text(o.parent_id)||text(o.reference);if(!id)throw Error('A PCB pad has no component identity. Its connections cannot be reconstructed.');
  if(!groups.has(id)){const c=components.get(id)||{};groups.set(id,{id,label:text(o.reference,id),model:'pcb-component',value:text(c.value),pins:[]});}
  const part=groups.get(id)!,name=text(o.pad),net=o.net===null||o.net===undefined||o.net===''?null:text(o.net);
  const existing=part.pins.find(p=>p.name===name);
  if(existing&&existing.net!==net)throw Error(part.label+' has conflicting net assignments for pad '+name+'. Review the PCB before generating.');
  if(!existing)part.pins.push({name,net});
 }
 return bounded({title,source:'PCB pad net assignments',parts:[...groups.values()],notes:['Generic component blocks retain PCB pad numbers. A PCB does not establish symbol identity or anode/cathode pin roles.','Net assignments describe intended connectivity; unconnected copper and missing tracks remain possible. Mechanical pads without electrical pin numbers are omitted.']});
}
function fromSnapshot(raw:Row):SchematicSource {
 if(!Array.isArray(raw.components)||raw.components.length>500)throw Error('Expected a Circuit Check snapshot with components.');
 if(raw.adapterNotes!==undefined&&(!Array.isArray(raw.adapterNotes)||raw.adapterNotes.length>30||raw.adapterNotes.some(note=>typeof note!=='string')))throw Error('Invalid source notes.');
 const parts=raw.components.map(item=>{const c=row(item);if(!Array.isArray(c.terminals)||c.terminals.length>5000)throw Error('Each component needs a bounded terminal list.');
  return {id:text(c.id),label:text(c.label,text(c.id)),model:text(c.model),value:text(c.value)|| (typeof c.resistance==='number'&&Number.isFinite(c.resistance)?c.resistance+' Ω':''),pins:c.terminals.map(item=>{const p=row(item);return {name:text(p.name,'?'),net:p.net===null||p.net===undefined||p.net===''?null:text(p.net)};})};
 });
 return bounded({title:text(raw.title,'Imported circuit'),source:text(raw.source,'Circuit Check captured pin connections'),parts,notes:[...((raw.adapterNotes as string[]|undefined)||[]).map(note=>text(note)),...(raw.topologyComplete===false?['The source marks its connectivity as incomplete. Uncaptured connections are not reconstructed.']:[]),'Unknown symbols use labelled pin blocks. Unconnected pins are marked open; they are not automatically repaired.']});
}
function fromWokwi(raw:Row):SchematicSource {
 if(!Array.isArray(raw.parts)||raw.parts.length>500||!Array.isArray(raw.connections)||raw.connections.length>10000)throw Error('Expected a Wokwi diagram with at most 500 parts and 10,000 connections.');
 const parts=raw.parts.map(item=>row(item)),ids=new Set<string>(),pins=new Map<string,Set<string>>(),parent=new Map<string,string>(),wired=new Set<string>();
 const find=(x:string):string=>{if(!parent.has(x))parent.set(x,x);let root=x;while(parent.get(root)!==root)root=parent.get(root)!;while(x!==root){const next=parent.get(x)!;parent.set(x,root);x=next;}return root;};
 const union=(a:string,b:string)=>parent.set(find(a),find(b));
 const endpoint=(x:unknown)=>{const value=text(x),split=value.indexOf(':');if(split<=0||split===value.length-1)throw Error('Each wire needs a component:pin endpoint.');const id=value.slice(0,split),pin=value.slice(split+1);if(!ids.has(id)&&id!=='$serialMonitor')throw Error('Wire references missing component '+id+'.');if(!pins.has(id))pins.set(id,new Set());pins.get(id)!.add(pin);find(value);return value;};
 for(const p of parts){const id=text(p.id);if(!id||id.includes(':')||ids.has(id))throw Error('Wokwi component IDs must be unique and cannot contain colons.');ids.add(id);pins.set(id,new Set());
  for(const pin of p.type==='wokwi-led'?['A','C']:p.type==='wokwi-resistor'?['1','2']:[])pins.get(id)!.add(pin);
 }
 for(const item of raw.connections){if(!Array.isArray(item)||item.length<2)throw Error('Invalid Wokwi wire.');const a=endpoint(item[0]),b=endpoint(item[1]);wired.add(a);wired.add(b);union(a,b);}
 const knownBoards=new Set(['wokwi-arduino-uno','wokwi-arduino-nano','wokwi-arduino-mega','wokwi-esp32-devkit-v1','board-esp32-devkit-c-v4','wokwi-pi-pico','board-pi-pico-w','board-pi-pico-2','board-pi-pico-2w']);
 for(const p of parts)if(knownBoards.has(text(p.type))){const id=text(p.id),grounds=[...pins.get(id)!].filter(n=>/^GND(?:[.\d_-].*)?$/.test(n));for(const pin of grounds.slice(1))union(id+':'+grounds[0],id+':'+pin);}
 const names=new Map<string,string>();for(const x of wired){const root=find(x),name=names.get(root);if(!name||x<name)names.set(root,x);}
 const output=[...parts,...(pins.has('$serialMonitor')?[{id:'$serialMonitor',type:'Serial monitor'}]:[])].map(p=>{const id=text(p.id),type=text(p.type);return {id,label:id,model:type,value:type==='wokwi-resistor'?text(row(p.attrs).value,'1000')+' Ω':'',pins:[...pins.get(id)||[]].map(name=>({name,net:names.get(find(id+':'+name))||null}))};});
 return bounded({title:'Imported Wokwi circuit',source:'Wokwi explicit wires',parts:output,notes:['Only explicit wires and recognized board ground aliases are joined. Breadboard strips, switches, internal module connections and unlisted pins require review.']});
}
export function importSchematicSource(input:unknown):SchematicSource {
 if(!isRow(input))throw Error('Import a Wokwi diagram.json or a Circuit Check JSON report.');
 if(input.format==='circuitcheck-generated-schematic'&&Array.isArray(input.components))return fromSnapshot({...input,components:input.components.map(c=>({...row(c),terminals:row(c).pins}))});
 const snapshot=row(row(input.run).snapshot||input.snapshot);
 if(Array.isArray(snapshot.components))return fromSnapshot(snapshot);
 if(Array.isArray(input.components))return fromSnapshot(input);
 if(input.version===1&&Array.isArray(input.parts))return fromWokwi(input);
 const revision=row(row(input.project).revision||input.revision),result=row(revision.result||input.result);
 if(input.geometry||result.geometry)return schematicFromGeometry(input.geometry||result.geometry,text(input.title,'Imported PCB circuit'));
 throw Error('No supported circuit connectivity found. Use Wokwi diagram.json or an exported Circuit Check report, not an image or PDF.');
}
const escape=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const short=(s:string,n=25)=>s.length>n?s.slice(0,n-1)+'…':s;
export function renderSchematic(source:SchematicSource):{svg:string;netlist:string;partCount:number;netCount:number;pinCount:number;openPinCount:number;singlePinNetCount:number;openPins:{component:string;label:string;pin:string;pinIndex:number}[]} {
 bounded(source);
 const netNames=[...new Set(source.parts.flatMap(p=>p.pins.flatMap(pin=>pin.net===null?[]:[pin.net])))].sort();
 const labels=new Map(netNames.map((name,i)=>[name,'N'+(i+1)])),width=1680;let y=130;const symbols:string[]=[];
 const t=(x:number,y:number,s:string,size=14,extra='')=>`<text x="${x}" y="${y}" font-size="${size}" ${extra}>${escape(s)}</text>`;
 const line=(x:number,y:number,x2:number,_y2:number)=>`<path d="M${x} ${y}H${x2}"/>`;
 for(let i=0;i<source.parts.length;i+=3){const parts=source.parts.slice(i,i+3),height=Math.max(...parts.map(p=>Math.max(140,100+Math.ceil(p.pins.length/2)*28)));
  for(let col=0;col<parts.length;col++){
   const part=parts[col],x=col*550+30,cy=y+92;
   const anode=part.pins.find(p=>/^(A|anode)$/i.test(p.name)),cathode=part.pins.find(p=>/^(C|K|cathode)$/i.test(p.name));
   const led=/^(wokwi-led|led2?|led_(red|green|blue|yellow|orange|white))$/i.test(part.model)&&anode&&cathode&&part.pins.length===2;
   const resistor=/^(wokwi-resistor|resistor)$/i.test(part.model)&&part.pins.length===2;
   const pins=led?[anode!,cathode!]:part.pins;
   let body=t(x+255,y+15,short(part.label,42),17,'text-anchor="middle" font-weight="700"')+t(x+255,y+38,short(part.value||part.model,50),12,'text-anchor="middle" fill="#536a7a"');
   if(resistor){body+=`<path d="M${x+165} ${cy}h50l8 -13 12 26 12 -26 12 26 12 -26 12 26 8 -13h54" fill="none"/>`;}
   else if(led){body+=line(x+165,cy,x+345,cy)+`<path d="M${x+240} ${cy-16}l28 16 -28 16zM${x+268} ${cy-18}v36M${x+270} ${cy-25}l18 -18m-9 0h9v9M${x+287} ${cy-14}l18 -18m-9 0h9v9" fill="none"/>`;}
   else body+=`<rect x="${x+165}" y="${y+58}" width="180" height="${height-80}" rx="3" fill="#f7faf9"/>`;
   if(!pins.length)body+=t(x+255,y+98,'No captured pins',12,'text-anchor="middle"');
   pins.forEach((p,index)=>{const right=index%2===1,py=y+92+Math.floor(index/2)*28,start=right?x+345:x+80,end=right?x+430:x+165,label=right?x+435:x+75;
    body+=line(start,py,end,py)+t(right?x+337:x+173,py-7,short(p.name,18),12,`text-anchor="${right?'end':'start'}"`);
    if(p.net===null)body+=`<path d="M${right?end-4:start-4} ${py-4}l8 8m-8 0l8 -8" stroke="#a34d25"/>`+t(label,py+5,'open',12,`fill="#a34d25" text-anchor="${right?'start':'end'}"`);
    else body+=t(label,py+5,labels.get(p.net)!,14,`fill="#007c6c" font-weight="700" text-anchor="${right?'start':'end'}"`);
   });
   symbols.push(`<g data-component="${escape(part.id)}"><title>${escape(part.label+' — '+part.model)}</title>${body}</g>`);
  }y+=height+30;
 }
 const legendStart=y+20;const legend=netNames.map((name,i)=>t(40+(i%3)*550,legendStart+35+Math.floor(i/3)*26,labels.get(name)+' = '+short(name,54),12));
 const height=legendStart+80+Math.ceil(netNames.length/3)*26;
 const openPins=source.parts.flatMap(part=>part.pins.flatMap((pin,index)=>pin.net===null?[{component:part.id,label:part.label,pin:pin.name,pinIndex:index}]:[]));
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="schematic-title schematic-desc"><title id="schematic-title">Generated schematic: ${escape(source.title)}</title><desc id="schematic-desc">${escape(SCHEMATIC_NOTE)}</desc><rect width="100%" height="100%" fill="white"/><g font-family="Segoe UI,Arial,sans-serif" fill="#163446" stroke="none">${t(35,40,'Generated schematic · '+short(source.title,100),25,'font-weight="700"')}${t(35,70,'Recorded net membership · '+openPins.length+' unconnected pins marked × · missing wires are not added',15)}${t(35,96,'Open circuits are supported. Review symbols and pins; this is not proof of a closed or fully routed circuit.',13)}</g><g font-family="Segoe UI,Arial,sans-serif" fill="#163446" stroke="#294654" stroke-width="1.8">${symbols.join('')}</g><g font-family="Segoe UI,Arial,sans-serif" fill="#163446">${t(35,legendStart,'Net label key · full connection names are retained in the JSON netlist',16,'font-weight="700"')}${legend.join('')}</g></svg>`;
 // Text must not inherit the symbol stroke; diagrams remain legible when exported.
 const clean=svg.replaceAll('<text ','<text stroke="none" ');
 const nets=netNames.map(name=>({label:labels.get(name),name,pins:[] as {component:string;pin:string;pinIndex:number}[]})),byName=new Map(nets.map(net=>[net.name,net]));
 for(const part of source.parts)part.pins.forEach((pin,index)=>{if(pin.net!==null)byName.get(pin.net)!.pins.push({component:part.id,pin:pin.name,pinIndex:index})});
 const singlePinNetCount=nets.filter(net=>net.pins.length===1).length;
 return {svg:clean,netlist:JSON.stringify({format:'circuitcheck-generated-schematic',version:1,title:source.title,source:source.source,note:SCHEMATIC_NOTE,notes:source.notes,openPins,singlePinNetCount,nets,components:source.parts},null,2),partCount:source.parts.length,netCount:netNames.length,pinCount:source.parts.reduce((n,p)=>n+p.pins.length,0),openPinCount:openPins.length,singlePinNetCount,openPins};
}
