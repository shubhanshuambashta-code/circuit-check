import {useEffect,useState,type RefObject} from 'react';
import {setCameraDirection} from './review3d';

interface Camera extends HTMLElement {loaded?:boolean;getCameraOrbit:()=>{theta:number;phi:number;radius:number}}
const colors={X:'#ff8c8e',Y:'#8ce3ad',Z:'#8cbfff'};
export default function AxisGizmo({viewer,source,cameraGroup,boardAxes=true}:{viewer:RefObject<HTMLElement|null>;source:string;cameraGroup?:string;boardAxes?:boolean}){
 const [orbit,setOrbit]=useState({theta:Math.PI*35/180,phi:Math.PI*55/180}),[ready,setReady]=useState(false);
 useEffect(()=>{const el=viewer.current as Camera|null;if(!el)return;let frame=0;
  const read=()=>{frame=0;const o=el.getCameraOrbit();setReady(!!el.loaded);setOrbit(old=>Math.abs(old.theta-o.theta)+Math.abs(old.phi-o.phi)<.0001?old:{theta:o.theta,phi:o.phi})};
  const update=()=>{if(!frame)frame=requestAnimationFrame(read)};
  el.addEventListener('camera-change',update);el.addEventListener('load',update);update();
  return()=>{cancelAnimationFrame(frame);el.removeEventListener('camera-change',update);el.removeEventListener('load',update)};
 },[viewer,source]);
 // Board coordinates: X/Y lie on the PCB, Z points above it. GLB itself is Y-up.
 const axes:{name:'X'|'Y'|'Z';vector:number[]}[]=boardAxes?[{name:'X',vector:[1,0,0]},{name:'Y',vector:[0,0,-1]},{name:'Z',vector:[0,1,0]}]:[{name:'X',vector:[1,0,0]},{name:'Y',vector:[0,1,0]},{name:'Z',vector:[0,0,1]}];
 const {theta,phi}=orbit,right=[Math.cos(theta),0,-Math.sin(theta)],up=[-Math.cos(phi)*Math.sin(theta),Math.sin(phi),-Math.cos(phi)*Math.cos(theta)],view=[Math.sin(phi)*Math.sin(theta),Math.cos(phi),Math.sin(phi)*Math.cos(theta)],dot=(a:number[],b:number[])=>a.reduce((s,v,i)=>s+v*b[i],0);
 const aim=(vector:number[])=>setCameraDirection(viewer.current,cameraGroup,Math.hypot(vector[0],vector[2])<.0001?0:Math.atan2(vector[0],vector[2]),Math.acos(vector[1]));
 return <div className="axis-gizmo" role="group" aria-label="3D camera axes" onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
  <span className="axis-gizmo-caption">{boardAxes?'Board axes':'Model axes'}</span>
  <svg viewBox="0 0 100 82" aria-hidden="true"><circle cx="50" cy="42" r="3" fill="#a8c9be"/>{[...axes].sort((a,b)=>dot(a.vector,view)-dot(b.vector,view)).map(axis=>{const x=dot(axis.vector,right)*28,y=-dot(axis.vector,up)*28;return <g key={axis.name} stroke={colors[axis.name]}><g onClick={()=>ready&&aim(axis.vector.map(v=>-v))}><line x1="50" y1="42" x2={50-x*.65} y2={42-y*.65} strokeDasharray="3 3" opacity=".45"/><circle cx={50-x*.65} cy={42-y*.65} r="3" fill={colors[axis.name]} opacity=".5"/></g><g data-axis-tip={axis.name} onClick={()=>ready&&aim(axis.vector)}><line x1="50" y1="42" x2={50+x} y2={42+y} strokeWidth="2"/><circle cx={50+x} cy={42+y} r="4" fill={colors[axis.name]}/><text x={50+x*1.28} y={46+y*1.28} textAnchor="middle" fill={colors[axis.name]} stroke="none" fontSize="12" fontWeight="700">{axis.name}</text></g></g>})}</svg>
  <div className="axis-gizmo-buttons">{[1,-1].flatMap(sign=>axes.map(axis=>{const vector=axis.vector.map(v=>v*sign),label=`${sign===1?'+':'−'}${axis.name}`;return <button key={label} disabled={!ready} aria-label={`View from ${sign===1?'positive':'negative'} ${axis.name} axis`} aria-pressed={dot(vector,view)>.999} title={`Look toward the board from ${label}${boardAxes&&axis.name==='Z'?(sign===1?' (top)':' (bottom)'):''}`} style={{color:colors[axis.name]}} onClick={()=>aim(vector)}>{label}</button>}))}</div>
  <button className="axis-gizmo-home" disabled={!ready} aria-label="Reset 3D orientation" onClick={()=>setCameraDirection(viewer.current,cameraGroup)}>Home</button>
 </div>;
}
