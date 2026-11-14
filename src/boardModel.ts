import type {BoardObject,Finding,Geometry,Preview} from './api';

// Self-contained GLB meshes. Package shapes are illustrative when no native model exists.
export function boardModel(geometry:Geometry,preview:Preview|undefined,components:boolean,selectedIds:string[]=[],changes:{object:BoardObject;status:string}[]=[],findings:Finding[]=[]){
 const objects=geometry.objects,all=objects.flatMap(o=>o.points),bounds=preview?.bounds_mm||[Math.min(...all.map(p=>p[0])),Math.min(...all.map(p=>p[1])),Math.max(...all.map(p=>p[0])),Math.max(...all.map(p=>p[1]))];
 const [x0,y0,x1,y1]=bounds,cx=(x0+x1)/2,cy=(y0+y1)/2;
 const colors=[[.025,.28,.17,1],[.08,.085,.095,1],[.72,.74,.76,1],[.72,.48,.1,1],[.62,.43,.25,1],[.08,.24,.35,1],[1,.65,.08,1],[.12,.8,.48,1],[.95,.25,.24,1],[.4,.55,1,1],[.95,.12,.15,1],[1,.55,.05,1]];
 const severities=new Map<string,string>();
 for(const f of findings)if(!f.excluded&&f.source!=='KiCad ERC')for(const id of f.board_object_ids||[]){if(severities.get(id)!=='error')severities.set(id,f.severity)}
 let override:number|undefined;
 const groups=colors.map(()=>({positions:[] as number[],normals:[] as number[]}));
 const triangle=(a:number[],b:number[],c:number[],material:number)=>{material=override??material;const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n)||1;for(const p of [a,b,c]){groups[material].positions.push(p[0]-cx,p[2],cy-p[1]);groups[material].normals.push(n[0]/l,n[2]/l,-n[1]/l)}};
 const box=(x:number,y:number,z:number,w:number,d:number,h:number,m:number)=>{const p=[[x-w/2,y-d/2,z],[x+w/2,y-d/2,z],[x+w/2,y+d/2,z],[x-w/2,y+d/2,z],[x-w/2,y-d/2,z+h],[x+w/2,y-d/2,z+h],[x+w/2,y+d/2,z+h],[x-w/2,y+d/2,z+h]];for(const [a,b,c,d] of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]){triangle(p[a],p[b],p[c],m);triangle(p[a],p[c],p[d],m)}};
 box(cx,cy,-1.6,x1-x0,y1-y0,1.6,0);
 for(const o of objects){
  const change=changes.find(c=>c.object.id===o.id)?.status;
  override=selectedIds.includes(o.id)?6:change==='added'?7:change==='removed'?8:change?9:severities.get(o.id)==='error'?10:severities.get(o.id)==='warning'?11:undefined;
  const back=o.layer?.toUpperCase().startsWith('B.'),z=back?-1.67:.07;
  if(o.kind==='pad'&&o.points.length>=3){for(let i=1;i<o.points.length-1;i++)triangle([...o.points[0],z],[...o.points[i],z],[...o.points[i+1],z],3)}
  if(o.kind==='track')for(let i=1;i<o.points.length;i++){const a=o.points[i-1],b=o.points[i],l=Math.hypot(b[0]-a[0],b[1]-a[1])||1,w=Math.max(o.width||.2,.15)/2,dx=-(b[1]-a[1])/l*w,dy=(b[0]-a[0])/l*w;const p=[[a[0]+dx,a[1]+dy,z],[b[0]+dx,b[1]+dy,z],[b[0]-dx,b[1]-dy,z],[a[0]-dx,a[1]-dy,z]];triangle(p[0],p[1],p[2],3);triangle(p[0],p[2],p[3],3)}
  if(o.kind!=='component'||!components||!o.reference)continue;
  // Pad envelopes avoid incorporating reference/value text into package dimensions.
  const pads=objects.filter(p=>p.kind==='pad'&&p.reference===o.reference),pts=(pads.length?pads.flatMap(p=>p.points):o.points);
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2,w=Math.max(.5,Math.max(...xs)-Math.min(...xs)),d=Math.max(.5,Math.max(...ys)-Math.min(...ys));
  const base=back?-1.6:0,part=(px:number,py:number,pz:number,pw:number,pd:number,ph:number,m:number)=>box(px,py,back?base-pz-ph:base+pz,pw,pd,ph,m);
  if(/^[RC]\d/i.test(o.reference)){
   const horizontal=w>=d,length=Math.max(w,d),width=Math.min(w,d)*.85,body=length*.58,height=/^C/i.test(o.reference)?1:.65;
   part(x,y,.15,horizontal?body:width,horizontal?width:body,height,/^C/i.test(o.reference)?4:1);
   for(const side of [-1,1])part(x+(horizontal?side*length*.36:0),y+(horizontal?0:side*length*.36),.1,horizontal?length*.25:width,horizontal?width:length*.25,height*.85,2);
  }else if(/^J\d/i.test(o.reference)){
   part(x,y,.1,w+1,d+1,2.3,1);
   for(const p of pads){const px=p.points.reduce((s,v)=>s+v[0],0)/p.points.length,py=p.points.reduce((s,v)=>s+v[1],0)/p.points.length;part(px,py,2.4,.55,.55,3.7,3)}
  }else{
   part(x,y,.3,w*.72,d*.72,1.8,1);
   for(const p of pads){const px=p.points.reduce((s,v)=>s+v[0],0)/p.points.length,py=p.points.reduce((s,v)=>s+v[1],0)/p.points.length;part(px,py,.12,Math.max(.25,(Math.max(...p.points.map(v=>v[0]))-Math.min(...p.points.map(v=>v[0])))*.8),Math.max(.25,(Math.max(...p.points.map(v=>v[1]))-Math.min(...p.points.map(v=>v[1])))*.8),.25,2)}
   part(x-w*.2,y-d*.2,2.11,.45,.45,.02,2);
  }
 }
 const chunks:Float32Array[]=[],views:object[]=[],accessors:object[]=[],primitives:object[]=[];let offset=0;
 for(let m=0;m<groups.length;m++){const g=groups[m];if(!g.positions.length)continue;const indices:number[]=[];for(const values of [g.positions,g.normals]){const data=new Float32Array(values);views.push({buffer:0,byteOffset:offset,byteLength:data.byteLength});chunks.push(data);offset+=data.byteLength;const index=accessors.length;indices.push(index);accessors.push({bufferView:views.length-1,componentType:5126,count:values.length/3,type:'VEC3',...(indices.length===1?{min:[0,1,2].map(i=>Math.min(...values.filter((_,j)=>j%3===i))),max:[0,1,2].map(i=>Math.max(...values.filter((_,j)=>j%3===i)))}:{})})}primitives.push({attributes:{POSITION:indices[0],NORMAL:indices[1]},material:m})}
 const doc={asset:{version:'2.0',generator:'CircuitCheck representative package preview'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives}],materials:colors.map((c,i)=>({doubleSided:true,pbrMetallicRoughness:{baseColorFactor:c,metallicFactor:i===2||i===3?.75:.05,roughnessFactor:i===2||i===3?.3:.65}})),buffers:[{byteLength:offset}],bufferViews:views,accessors};
 const json=new TextEncoder().encode(JSON.stringify(doc)),size=Math.ceil(json.length/4)*4,glb=new ArrayBuffer(28+size+offset),bytes=new Uint8Array(glb),header=new DataView(glb);header.setUint32(0,0x46546c67,true);header.setUint32(4,2,true);header.setUint32(8,glb.byteLength,true);header.setUint32(12,size,true);header.setUint32(16,0x4e4f534a,true);bytes.fill(32,20,20+size);bytes.set(json,20);header.setUint32(20+size,offset,true);header.setUint32(24+size,0x004e4942,true);let cursor=28+size;for(const c of chunks){bytes.set(new Uint8Array(c.buffer),cursor);cursor+=c.byteLength}return new Blob([glb],{type:'model/gltf-binary'});
}
