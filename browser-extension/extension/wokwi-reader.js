// Self-contained MAIN-world function. No writes, network or diagram getters.
export function readWokwi() {
  if(location.origin!=='https://wokwi.com'||!location.pathname.startsWith('/projects/'))return null;
  try{
    const projects=new Set(),seen=new Set(),stack=[];
    for(const node of [...document.querySelectorAll('main, #__next, body, button, [role="tab"]')].slice(0,600)){const key=Object.keys(node).find(k=>k.startsWith('__reactFiber$'));if(key)stack.push(node[key]);}
    let examined=0;
    while(stack.length&&examined++<30000){const f=stack.pop();if(!f||seen.has(f))continue;seen.add(f);
      // Committed props only: pending props can retain a different revision.
      for(const candidate of [f.memoizedProps?.project,f.memoizedProps?.value])if(candidate&&Array.isArray(candidate.files)&&candidate.files.some(file=>file?.name==='diagram.json'&&typeof file.content==='string'))projects.add(candidate);
      if(f.return)stack.push(f.return);if(f.child)stack.push(f.child);if(f.sibling)stack.push(f.sibling);
    }
    // Wokwi supplies both its live state-tree instance and a serialized server
    // snapshot to React. They are different objects for the same circuit.
    // Prefer the instance exposing the inspected editor actions, without calling
    // those actions (or the mutating diagram getter).
    const routeId=location.pathname.match(/^\/projects\/(\d+)(?:\/|$)/)?.[1];
    let candidates=[...projects];
    const live=candidates.filter(c=>typeof c.findFile==='function'&&typeof c.syncDiagram==='function');
    if(live.length)candidates=live;
    if(routeId&&candidates.length){candidates=candidates.filter(c=>String(c.id)===routeId);if(!candidates.length)throw Error('The loaded project does not match this Wokwi URL. Wait for the intended editor to load.');}
    // Identical wrappers are harmless. Conflicting live instances stay an error;
    // never fall back to an older saved copy when current JSON is invalid.
    const distinct=new Map();
    for(const c of candidates){const identity=String(c.id||c.tempId||location.pathname),file=c.files.find(f=>f.name==='diagram.json');if(file.content.length>2097152)throw Error('diagram.json exceeds 2 MB.');distinct.set(JSON.stringify([identity,file.content]),c);}
    if(distinct.size>1)throw Error('Conflicting live project data was found. Wait for Wokwi to finish loading and check again.');
    const project=[...distinct.values()][0];let content,mode;
    if(project){content=project.files.find(f=>f.name==='diagram.json').content;mode='project-file';}
    else{const models=window.monaco?.editor?.getModels?.().filter(m=>/(?:^|\/)diagram\.json$/.test(m.uri?.path||''))||[];if(models.length>1)throw Error('Multiple diagram.json models found. Reload the project.');if(models.length===1){content=models[0].getValue();mode='monaco-file';}}
    if(content===undefined)return {schema:1,error:'Open the diagram.json tab in Wokwi and Check circuit again. If reading remains unavailable, open or paste diagram.json in this panel.'};
    if(content.length>2097152)throw Error('diagram.json exceeds 2 MB.');
    const diagram=JSON.parse(content);if(!diagram||!Array.isArray(diagram.parts)||!Array.isArray(diagram.connections))throw Error('diagram.json needs parts and connections arrays.');
    return {schema:1,diagram,designId:String(project?.id||project?.tempId||location.pathname).slice(0,200),title:String(project?.name||document.title).slice(0,200),source:'Wokwi live diagram.json · simulator diagnostics not read',captureMode:mode,capturedAt:new Date().toISOString()};
  }catch(error){return {schema:1,error:'Wokwi diagram could not be read: '+String(error.message||error).slice(0,600)};}
}
export function locateWokwi(ids,expectedDesignId=null) {
  if(location.origin!=='https://wokwi.com')return {found:false};
  const selected=new Set(Array.isArray(ids)?ids:[ids]);let count=0;
  for(const node of document.querySelectorAll('[data-part-id], [data-id]')){if(!selected.has(node.getAttribute('data-part-id')||node.getAttribute('data-id')))continue;const b=node.getBoundingClientRect();if(!b.width||!b.height)continue;
    const marker=document.createElement('div');marker.style.cssText=`position:fixed;pointer-events:none;z-index:2147483647;outline:4px solid #be123c;border-radius:5px;left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px`;document.documentElement.append(marker);setTimeout(()=>marker.remove(),3000);count++;
  }
  return {found:count>0,count};
}
