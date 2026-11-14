import { analyze } from './analyzer.js';
import { correctionProfile } from './correction.js';
import { arrange, isBoard, partHeight, differences, draftAnalysis, connectionGuide, VISUAL_LIMITS } from './visual-model.js';
export const escapeXML = value => String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const short=(text,max=28)=>String(text).length>max?String(text).slice(0,max-1)+'…':String(text);
function icon(c) {
  if(/^resistor$/i.test(c.model))return '<path d="M65 0h12l5-9 9 18 9-18 9 18 9-18 5 9h12"/>';
  if(/^led/i.test(c.model))return '<path d="M66 0h20m0-12v24l24-12zm26-13v26m0-13h22m-25-15 12-12m-12 7 12-12"/>';
  if(/battery|coincell/i.test(c.model))return '<path d="M66 0h24m0-15v30m10-23v16m0-8h34"/><text x="74" y="-12">+</text>';
  if(/capacitor/i.test(c.model))return '<path d="M66 0h25m0-14v28m11-28v28m0-14h32"/>';
  if(/motor/i.test(c.model))return '<circle cx="100" cy="0" r="17"/><text x="94" y="5">M</text><path d="M65 0h18m34 0h18"/>';
  if(isBoard(c))return '<rect x="64" y="-16" width="72" height="30" rx="3"/><path d="M74-8v14m12-14v14m12-14v14m12-14v14m12-14v14"/>';
  return '<rect x="75" y="-15" width="50" height="30" rx="4"/><path d="M65-8h10m-10 16h10m50-16h10m-10 16h10"/>';
}
export function renderDiagram(snapshot,layout,{title='Circuit diagram',selectedId=null,changes=[],analysis=null,interactive=false,focus=false}={}) {
  const e=escapeXML,positions=new Map([...arrange(snapshot),...layout].map(p=>[p.id,p]));
  const flagged=new Set((analysis?.findings||[]).flatMap(f=>f.componentIds));
  const added=new Set(changes.filter(d=>d.kind==='added').map(d=>d.componentId));
  const revised=new Set(changes.filter(d=>d.kind!=='layout').map(d=>d.componentId));
  const badNets=new Set();for(const f of analysis?.findings||[])if(f.rule==='supplyShort')for(const c of snapshot.components.filter(c=>f.componentIds.includes(c.id)))for(const p of c.terminals)if(f.pins.includes(p.name)&&p.net)badNets.add(p.net);
  const vertices=new Map();const cards=[];
  for(const c of snapshot.components){
    const p=positions.get(c.id),height=partHeight(c),x=Number(p?.x)||80,y=Number(p?.y)||80;
    const names=new Map();for(const pin of c.terminals)names.set(pin.name,(names.get(pin.name)||0)+1);
    const pins=isBoard(c)?[]:c.terminals.map((pin,index)=>({pin,index,label:pin.name+(names.get(pin.name)>1?' ['+(index+1)+']':''),px:x+(index%2?200:0),py:y+64+Math.floor(index/2)*22}));
    for(const pin of pins){if(!pin.pin.net)continue;if(!vertices.has(pin.pin.net))vertices.set(pin.pin.net,[]);vertices.get(pin.pin.net).push({...pin,componentId:c.id});}
    const stroke=c.id===selectedId?'#155bc5':flagged.has(c.id)?'#b23a37':added.has(c.id)?'#16745e':revised.has(c.id)?'#b66a10':'#b6c5ce';
    const fill=added.has(c.id)?'#edf8f3':revised.has(c.id)?'#fff7e8':'#ffffff';
    cards.push(`<g transform="translate(${x} ${y})" data-component-id="${e(c.id)}" ${interactive?'tabindex="0" role="button"':''} aria-label="${e(c.label+'; '+c.typeName+'; select to inspect pins')}" class="part"><title>${e(c.label+' · '+c.model)}</title><rect width="200" height="${height}" rx="9" fill="${fill}" stroke="${stroke}" stroke-width="${c.id===selectedId?3:1.5}"/><text x="12" y="22" font-size="13" font-weight="700" fill="#183446">${e(short(c.label,25))}</text><text x="12" y="41" font-size="10" fill="#536a7a">${e(short(c.resistance!==null?c.resistance+' Ω · '+c.typeName:c.typeName||c.model,31))}</text><g transform="translate(0 ${isBoard(c)?72:Math.max(68,Math.min(height-24,90))})" fill="none" stroke="#315968" stroke-width="1.8">${icon(c)}</g>${pins.map(t=>`<circle cx="${t.index%2?200:0}" cy="${t.py-y}" r="4" fill="${t.pin.net?'#315968':'#ffffff'}" stroke="${t.pin.net?'#315968':'#b23a37'}"/><text x="${t.index%2?190:10}" y="${t.py-y+4}" text-anchor="${t.index%2?'end':'start'}" font-size="10" fill="#24404e">${e(short(t.label,18))}</text>`).join('')}${isBoard(c)?`<text x="12" y="100" font-size="9" fill="#536a7a">${c.terminals.length} holes/pins · strips collapsed</text>`:''}${added.has(c.id)?'<text x="158" y="22" font-size="9" fill="#16745e">NEW</text>':''}</g>`);
  }
  const paths=[],labels=[];let index=0;
  for(const [net,pins]of vertices){if(pins.length<2)continue;const junction={x:pins.reduce((s,p)=>s+p.px,0)/pins.length,y:Math.min(...pins.map(p=>p.py))-25-(index%5)*12};
    const color=badNets.has(net)?'#b23a37':pins.some(p=>added.has(p.componentId))?'#16745e':pins.some(p=>revised.has(p.componentId))?'#b66a10':'#65839c';
    for(const p of pins){const stub=p.px+(p.index%2?14:-14);paths.push(`<path d="M${p.px} ${p.py}H${stub}V${junction.y}H${junction.x}" fill="none" stroke="${color}" stroke-width="1.7" opacity=".85"/>`);}
    paths.push(`<circle cx="${junction.x}" cy="${junction.y}" r="3" fill="${color}"/>`);
    labels.push(`<text x="${junction.x+5}" y="${junction.y-5}" font-size="9" fill="${color}">${e(short(net,22))}</text>`);index++;
  }
  const maxX=Math.max(900,...snapshot.components.map(c=>(positions.get(c.id)?.x||80)+260)),maxY=Math.max(430,...snapshot.components.map(c=>(positions.get(c.id)?.y||80)+partHeight(c)+70));
  const selected=snapshot.components.find(c=>c.id===selectedId),sp=selected&&positions.get(selected.id);
  const box=focus&&sp?[Math.max(0,sp.x-160),Math.max(0,sp.y-90),520,Math.max(330,partHeight(selected)+180)]:[0,0,maxX,maxY];
  const caption=isBoard(snapshot.components.find(c=>isBoard(c))||{model:'',typeName:''})?'Breadboard strip memberships are represented as shared electrical nets; physical holes are not reconstructed.':'Derived from component pin-to-net memberships. Crossing lines join only at a shared labelled net.';
  const gridId=interactive?'draft-grid':'source-grid';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(' ')}" data-full-box="0 0 ${maxX} ${maxY}" role="${interactive?'group':'img'}" aria-label="${e(title)}"><title>${e(title)}</title><desc>${e(caption)} This diagram is not simulated. It shows ${snapshot.components.length} components.</desc><style>text{font-family:Segoe UI,Arial,sans-serif}.part:focus{outline:none}.part:focus>rect{stroke:#155bc5;stroke-width:4}.part{cursor:${interactive?'grab':'default'}}</style><defs><pattern id="${gridId}" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#cfdde1"/></pattern></defs><rect x="0" y="0" width="${maxX}" height="${maxY}" fill="#f6fafb"/><rect x="0" y="0" width="${maxX}" height="${maxY}" fill="url(#${gridId})"/>${paths.join('')}${cards.join('')}${labels.join('')}</svg>`;
}
function wrap(text,max=110){const words=String(text).split(/\s+/),lines=[];let line='';for(let word of words){while(word.length>max){if(line){lines.push(line);line='';}lines.push(word.slice(0,max));word=word.slice(max);}if(line.length+word.length+1>max){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);return lines;}
export function rasterDimensions(width,height){if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Invalid figure dimensions.');const scale=Math.min(1,16000/width,16000/height,Math.sqrt(16000000/(width*height)));return{width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale)),scale};}
export function renderRepairSheet(doc){
  const e=escapeXML,original=analyze(doc.original.snapshot,correctionProfile(doc.original.profile)),analysis=draftAnalysis(doc),changes=differences(doc);
  const source=renderDiagram(doc.original.snapshot,doc.originalLayout,{title:'Captured original',analysis:original}).replace('<svg ','<svg x="30" y="130" width="940" height="620" ');
  const proposed=renderDiagram(doc.draft,doc.layout,{title:'Proposed draft',analysis,changes}).replaceAll('source-grid','export-draft-grid').replace('<svg ','<svg x="1030" y="130" width="940" height="620" ');
  const lines=[];const add=(text,heading=false)=>{for(const line of wrap(text,heading?95:170))lines.push({text:line,heading});};
  add('CHANGES TO REVIEW',true);if(!changes.length)add('The draft matches the captured source.');for(const c of changes){add(c.kind.toUpperCase()+': '+c.title);add(c.detail);}
  add('UNRESOLVED SUPPORTED FINDINGS',true);if(!analysis.findings.length)add('No supported static findings remain; intended behavior, physical placement, ratings and simulation still need verification.');for(const f of analysis.findings){add(f.severity.toUpperCase()+': '+f.title);add(f.evidence);add('Next step: '+f.fix);}
  add('ORIGINAL SIMULATOR FINDINGS — NOT REVERIFIED',true);const native=original.findings.filter(f=>f.rule==='native');if(!native.length)add('No original simulator flags were captured. This is not a new simulation result.');for(const f of native)add(f.title+': '+f.evidence);
  add('EXACT PROPOSED CONNECTION GROUPS',true);add('All pins listed on the same named net are electrically connected. Breadboard hole aliases are collapsed. Line crossings alone do not create a connection.');for(const n of connectionGuide(doc))add(n.net+': '+n.pins.map(p=>p.component+'.'+p.pin).join(' ↔ '));
  add('SCOPE AND SOURCE',true);add(VISUAL_LIMITS);if(doc.goal)add('Project-purpose note: '+doc.goal);add('Source design: '+doc.original.snapshot.designId);add('Source SHA-256: '+doc.original.provenance.designHash);
  let y=850;const annotations=lines.map(l=>{y+=l.heading?38:22;return `<text x="35" y="${y}" font-family="Segoe UI,Arial,sans-serif" font-size="${l.heading?19:15}" font-weight="${l.heading?700:400}" fill="#183446">${e(l.text)}</text>`;}).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="${y+60}" viewBox="0 0 2000 ${y+60}" role="img" aria-label="${e(doc.draft.title+' — annotated circuit repair proposal')}"><title>${e(doc.draft.title)} — annotated repair proposal</title><rect width="2000" height="${y+60}" fill="#ffffff"/><text x="35" y="45" font-family="Segoe UI,Arial,sans-serif" font-size="28" font-weight="700" fill="#183446">${e(doc.draft.title)} · visual repair proposal</text><text x="35" y="78" font-family="Segoe UI,Arial,sans-serif" font-size="16" fill="#536a7a">Captured original and editable proposal. Not simulated; not automatically applied to Wokwi.</text><text x="35" y="115" font-family="Segoe UI,Arial,sans-serif" font-size="20" font-weight="700" fill="#183446">ORIGINAL · ${doc.original.snapshot.components.length} parts</text><text x="1035" y="115" font-family="Segoe UI,Arial,sans-serif" font-size="20" font-weight="700" fill="#116457">PROPOSED · ${doc.draft.components.length} parts</text>${source}${proposed}<text x="35" y="790" font-family="Segoe UI,Arial,sans-serif" font-size="16" fill="#536a7a">Blue-grey: existing · Orange: revised · Teal: added · Red: unresolved supported finding</text><text x="35" y="825" font-family="Segoe UI,Arial,sans-serif" font-size="17" fill="#183446">Draft: ${analysis.findings.filter(f=>f.severity==='error').length} errors · ${analysis.findings.filter(f=>f.severity==='warning').length} warnings in supported static checks. All diagram labels and connection groups follow below.</text>${annotations}</svg>`;
}
