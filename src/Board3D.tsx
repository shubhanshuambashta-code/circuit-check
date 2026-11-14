import {createElement,useEffect,useRef,useState} from 'react';
import '@google/model-viewer';
import type {Geometry,Preview} from './api';
import {boardModel} from './boardModel';
import AxisGizmo from './AxisGizmo';
import {useFindingHighlights} from './FindingHighlights';
import {useComponentLabels} from './ComponentLabels';
import './board3d.css';
import {useLinkedCamera,type Review3DOptions} from './review3d';

interface Camera extends HTMLElement {cameraOrbit:string;getCameraOrbit:()=>{theta:number;phi:number;radius:number};jumpCameraToGoal:()=>void;zoom:(steps:number)=>void}
export default function Board3D({geometry,preview,...options}:{geometry?:Geometry;preview?:Preview}&Review3DOptions){
 const [components,setComponents]=useState(true),[src,setSrc]=useState(''),[zoom,setZoom]=useState(1),[error,setError]=useState('');
 const viewer=useRef<Camera>(null);
 const findingHighlights=useFindingHighlights(geometry,preview,options,!!geometry?.objects.length,viewer,src);
 const identifiers=useComponentLabels(viewer,geometry,preview,components,src,undefined,{...options,severityFindings:findingHighlights.visibleFindings});
 useLinkedCamera(viewer,options.cameraGroup,src);
 useEffect(()=>{if(!geometry?.objects.length)return;const url=URL.createObjectURL(boardModel(geometry,preview,components,(options.finding&&!findingHighlights.visibleFindings.some(f=>f.id===options.finding?.id)?[]:options.highlightIds||options.finding?.board_object_ids),options.changes,findingHighlights.visibleFindings));setSrc(url);return()=>URL.revokeObjectURL(url)},[geometry,preview,components,(options.highlightIds||options.finding?.board_object_ids)?.join(','),options.changes,findingHighlights.visibleFindings.map(f=>f.id).join(',')]);
 useEffect(()=>{const el=viewer.current;if(!el)return;const fail=()=>setError('The 3D renderer could not load. Try reloading this page in a browser with WebGL enabled.');el.addEventListener('error',fail);return()=>el.removeEventListener('error',fail)},[src]);
 const orbit=(theta:number,phi:number)=>{const el=viewer.current;if(el)el.cameraOrbit=`${theta}rad ${phi}rad ${el.getCameraOrbit().radius}m`};
 const reset=()=>{if(viewer.current)viewer.current.cameraOrbit='35deg 55deg auto';setZoom(1)};
 const magnify=(factor:number)=>{const el=viewer.current;if(el){const o=el.getCameraOrbit();el.cameraOrbit=`${o.theta}rad ${o.phi}rad ${o.radius/factor}m`;setZoom(z=>Math.min(5,Math.max(.3,z*factor)))}};
 if(!geometry?.objects.length)return <div className="board3d-empty"><h3>3D preview unavailable</h3><p>Open a project with board geometry, or rerun its checks to generate the preview.</p></div>;
 return <div className="board3d"><div className="board3d-toolbar"><div><button onClick={()=>magnify(1/1.25)} aria-label="Zoom out 3D">−</button><span>{Math.round(zoom*100)}%</span><button onClick={()=>magnify(1.25)} aria-label="Zoom in 3D">+</button><button onClick={reset}>Reset view</button><button onClick={()=>orbit(0,.001)}>Top</button><button onClick={()=>orbit(0,Math.PI-.001)}>Bottom</button></div>{identifiers.control}<label><input type="checkbox" checked={components} onChange={e=>setComponents(e.target.checked)}/>Components</label></div>
 {findingHighlights.controls}{error&&<p role="alert">{error}</p>}
 <div className="board3d-webgl" role="group" aria-label="Interactive 3D board preview" tabIndex={0} data-components={components?'visible':'hidden'} onKeyDown={e=>{const el=viewer.current;if(!el)return;if(e.key.startsWith('Arrow')){e.preventDefault();const o=el.getCameraOrbit();orbit(o.theta+(e.key==='ArrowLeft'?-.15:e.key==='ArrowRight'?.15:0),Math.max(.001,Math.min(Math.PI-.001,o.phi+(e.key==='ArrowUp'?-.15:e.key==='ArrowDown'?.15:0))))}if(e.key.toLowerCase()==='f')reset()}}>
 {src&&createElement('model-viewer',{ref:viewer,src,tabIndex:0,loading:'eager','camera-controls':true,'interaction-prompt':'none','touch-action':'none','shadow-intensity':'1','environment-image':'neutral','camera-orbit':'35deg 55deg auto','min-camera-orbit':'auto 0deg 10%','max-camera-orbit':'auto 180deg 500%',alt:'Board with representative resistors, capacitors, IC leads and connector pins',style:{display:'block',width:'100%',height:'480px'}},identifiers.hotspots,findingHighlights.markers)}{src&&<AxisGizmo viewer={viewer} source={src} cameraGroup={options.cameraGroup}/ >}{identifiers.details}
 </div>{findingHighlights.panel}<div className="board3d-hint">Drag to rotate · Scroll to zoom · Right-drag to pan · Arrow keys to orbit</div><p className="board3d-note">Representative package shapes from pad locations and component references. These are not manufacturer models. Board thickness, heights and rectangular outline are illustrative. Components on the far side are hidden by the board.</p></div>;
}
