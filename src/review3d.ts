import {useEffect,type RefObject} from 'react';
import type {BoardObject,Finding,Geometry} from './api';

export interface Review3DOptions {
 findings?:Finding[];
 severityFindings?:Finding[];
 finding?:Finding;
 highlightIds?:string[];
 onSelectFinding?:(id:string)=>void;
 changes?:{object:BoardObject;status:string}[];
 cameraGroup?:string;
 focusReference?:{reference:string;key:number};
}
export function componentFindings(reference:string,id:string,geometry:Geometry|undefined,findings:Finding[]=[]){
 const ids=new Set([id,...(geometry?.objects.filter(o=>o.reference===reference).map(o=>o.id)||[])]);
 return findings.filter(f=>f.references?.includes(reference)||f.board_object_ids?.some(id=>ids.has(id)));
}
export function selectedObjects(geometry:Geometry|undefined,options:Review3DOptions){
 const ids=new Set(options.highlightIds||options.finding?.board_object_ids||[]);
 return geometry?.objects.filter(o=>ids.has(o.id))||[];
}
interface Camera extends HTMLElement {cameraOrbit:string;cameraTarget:string;getCameraOrbit:()=>{theta:number;phi:number;radius:number};getCameraTarget:()=>{x:number;y:number;z:number};jumpCameraToGoal:()=>void}
const cameras=new Map<string,Set<Camera>>();
export function setCameraDirection(viewer:HTMLElement|null,group?:string,theta?:number,phi?:number){
 if(!viewer)return;const camera=viewer as Camera,peers=group?cameras.get(group):undefined,targets=peers?.size?peers:new Set([camera]);
 const orbit=theta===undefined?'35deg 55deg auto':`${theta}rad ${Math.max(.001,Math.min(Math.PI-.001,phi!))}rad ${camera.getCameraOrbit().radius}m`;
 for(const target of targets){target.cameraOrbit=orbit;if(theta===undefined)target.cameraTarget='auto auto auto';if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)target.jumpCameraToGoal()}
}
// Direct camera events avoid rerendering both assemblies or feeding programmatic moves back.
export function useLinkedCamera(viewer:RefObject<HTMLElement|null>,group:string|undefined,source:string){
 useEffect(()=>{const el=viewer.current as Camera|null;if(!el||!group)return;const peers=cameras.get(group)||new Set<Camera>();peers.add(el);cameras.set(group,peers);
  const sync=(event:Event)=>{if((event as CustomEvent).detail?.source!=='user-interaction')return;const orbit=el.getCameraOrbit(),target=el.getCameraTarget();for(const peer of peers)if(peer!==el){peer.cameraOrbit=`${orbit.theta}rad ${orbit.phi}rad ${orbit.radius}m`;peer.cameraTarget=`${target.x}m ${target.y}m ${target.z}m`;peer.jumpCameraToGoal()}};
  el.addEventListener('camera-change',sync);return()=>{el.removeEventListener('camera-change',sync);peers.delete(el);if(!peers.size)cameras.delete(group)};
 },[viewer,group,source]);
}
