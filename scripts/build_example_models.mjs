// Rebuild the visual-only example assemblies from official KiCad library meshes.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Box3,Group,MeshStandardMaterial} from 'three';
import {VRMLLoader} from 'three/addons/loaders/VRMLLoader.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {boardModel} from '../src/boardModel.ts';

// GLTFExporter uses the browser FileReader API for Blob conversion.
globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.()})}};
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'public/demo/models'),data=JSON.parse(await fs.readFile(path.join(root,'public/demo/data.json'),'utf8'));
const names={resistor:'R_1206_3216Metric.wrl',ic:'SOIC-16W_7.5x10.3mm_P1.27mm.wrl',header:'PinHeader_1x06_P2.54mm_Vertical.wrl'};
const templates={};
for(const [kind,name] of Object.entries(names)){
 const obj=new VRMLLoader().parse(await fs.readFile(path.join(dir,name),'utf8'),'');
 // KiCad WRL library units are 0.1 inches (2.54 mm).
 obj.scale.setScalar(2.54);
 obj.traverse(mesh=>{if(!mesh.isMesh)return;const old=mesh.material;mesh.material=new MeshStandardMaterial({color:old.color,metalness:old.color.r>.5?.65:.05,roughness:.4,side:2})});
 templates[kind]=obj;
}
const metadata=[];
for(const revision of Object.values(data.revisions)){
 const result=revision.result;if(!result?.geometry)continue;
 const board=result.previews.find(p=>p.kind==='pcb');if(!board)continue;
 const base=await new GLTFLoader().parseAsync(await boardModel(result.geometry,board,false).arrayBuffer(),'');
 const scene=base.scene, [x0,y0,x1,y1]=board.bounds_mm,cx=(x0+x1)/2,cy=(y0+y1)/2;
 const assigned=[];
 for(const object of result.geometry.objects.filter(o=>o.kind==='component'&&o.reference)){
  const kind=object.reference.startsWith('R')?'resistor':object.reference.startsWith('J')?'header':'ic';
  const pads=result.geometry.objects.filter(o=>o.kind==='pad'&&o.reference===object.reference),points=pads.flatMap(p=>p.points);
  const px=(Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))/2,py=(Math.min(...points.map(p=>p[1]))+Math.max(...points.map(p=>p[1])))/2;
  const obj=templates[kind].clone(true);obj.name=object.reference;
  // Library meshes use Z up. The browser scene uses Y up.
  const orientation=new Group();orientation.rotation.x=-Math.PI/2;orientation.rotation.z=Math.PI;orientation.add(obj);
  if(kind==='header')orientation.position.set(px-cx,.1,cy-(py-6.35));else orientation.position.set(px-cx,.1,cy-py);
  scene.add(orientation);assigned.push({reference:object.reference,model:names[kind]});
 }
 const output=await new GLTFExporter().parseAsync(scene,{binary:true});
 await fs.writeFile(path.join(dir,`${revision.id}.glb`),Buffer.from(output));
 metadata.push({revision:revision.id,components:assigned});
 console.log(`${revision.id}: ${assigned.length} library models, ${output.byteLength} bytes`);
}
await fs.writeFile(path.join(dir,'assignments.json'),JSON.stringify({source:'https://github.com/KiCad/kicad-packages3D',license:'CC-BY-SA-4.0 with KiCad design exception',scope:'Visual-only package assignments for a synthetic example; recorded source and engineering checks are unchanged.',revisions:metadata},null,2)+'\n');
