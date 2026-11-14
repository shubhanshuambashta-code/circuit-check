import {createElement,useEffect,useMemo,useRef,useState} from 'react';
import '@google/model-viewer';
import {artifactUrl,demoMode,type Geometry,type Preview} from './api';
import assignments from '../public/demo/models/assignments.json';
import Board3D from './Board3D';
import ModelInventory from './ModelInventory';
import AxisGizmo from './AxisGizmo';
import {useFindingHighlights} from './FindingHighlights';
import {useComponentLabels} from './ComponentLabels';
import {useLinkedCamera,type Review3DOptions} from './review3d';

export default function NativeBoard3D({pid,rid,model,geometry,preview,...options}:{pid?:string;rid?:string;model?:Preview;geometry?:Geometry;preview?:Preview}&Review3DOptions){
 const [local,setLocal]=useState(''),[name,setName]=useState(''),[error,setError]=useState(''),[loaded,setLoaded]=useState(false),[fallback,setFallback]=useState(false),[request,setRequest]=useState<Review3DOptions['focusReference']>();
 const viewer=useRef<HTMLElement>(null),input=useRef<HTMLInputElement>(null);
 const assigned=useMemo(()=>demoMode?assignments.revisions.find(r=>r.revision===rid)?.components||[]:[],[rid]);
 const example=assigned.length>0;
 const projectModel=pid&&rid&&model?artifactUrl(pid,rid,model.artifact):example?`${import.meta.env.BASE_URL}demo/models/${rid}.glb`:'';
 const src=!fallback?(local||projectModel):'';
 const mapped=!!src&&example&&!local;
 const findingHighlights=useFindingHighlights(geometry,preview,options,mapped,viewer,src);
 const identifiers=useComponentLabels(viewer,geometry,preview,mapped,src,assigned,{...options,severityFindings:findingHighlights.visibleFindings});
 useLinkedCamera(viewer,options.cameraGroup,src);
 useEffect(()=>()=>{if(local)URL.revokeObjectURL(local)},[local]);
 useEffect(()=>{setLoaded(false);setError('');const el=viewer.current;if(!el)return;const ready=()=>setLoaded(true),fail=()=>setError('The 3D file could not be loaded. Use the geometry preview or choose a self-contained GLB exported from KiCad.');el.addEventListener('load',ready);el.addEventListener('error',fail);if((el as HTMLElement&{loaded?:boolean}).loaded)ready();return()=>{el.removeEventListener('load',ready);el.removeEventListener('error',fail)}},[src]);
 async function open(file?:File){if(!file)return;setError('');if(file.size>100*1024*1024){setError('Choose a GLB smaller than 100 MB.');return}const bytes=new Uint8Array(await file.slice(0,4).arrayBuffer());if(String.fromCharCode(...bytes)!=='glTF'){setError('Choose a valid binary glTF (.glb) file.');return}setLocal(URL.createObjectURL(file));setName(file.name);setFallback(false)}
 function inspect(reference:string){if(mapped)identifiers.select(reference);else {if(src)setFallback(true);setRequest({reference,key:Date.now()})}}
 return <div className="native-board3d"><div className="native-model-toolbar"><strong>{src?(example&&!local?'KiCad library component models':'Native 3D model'):'3D geometry preview'}</strong>{identifiers.control}<button onClick={()=>input.current?.click()}>Open GLB</button><input ref={input} tabIndex={-1} className="native-model-file" aria-label="Open GLB file" type="file" accept=".glb" onChange={e=>{void open(e.target.files?.[0]);e.target.value=''}}/>{local&&<button onClick={()=>{setLocal('');setName('');setFallback(false)}}>Use project model</button>}{(projectModel||local)&&<button onClick={()=>setFallback(v=>!v)}>{fallback?'Show component models':'Geometry preview'}</button>}</div>
 {error&&<div className="native-model-error" role="alert">{error}<button onClick={()=>{setLocal('');setFallback(true);setError('')}}>Use geometry preview</button></div>}
 {findingHighlights.controls}
 {options.finding&&<div className="finding-3d-summary"><strong>Selected finding: {options.finding.title}</strong><span>{src&&!mapped?'Use the geometry preview to locate this finding; this GLB has no verified component mapping.':(options.highlightIds||options.finding.board_object_ids)?.length?'Highlighted markers identify UUID-resolved objects, not an inferred collision point.':'This finding has no exact board-object mapping.'}</span>{src&&!mapped&&<button onClick={()=>setFallback(true)}>Locate finding in geometry</button>}</div>}
 {src?<><div className="native-model-stage">{createElement('model-viewer',{ref:viewer,src,tabIndex:0,loading:'eager','camera-controls':true,'interaction-prompt':'none','touch-action':'pan-y','shadow-intensity':'1.3',exposure:'1.1','environment-image':'neutral','camera-orbit':'35deg 55deg auto',alt:'Interactive native 3D PCB with component models',style:{width:'100%',height:'520px',background:'radial-gradient(ellipse at center, #35494d, #142328)'}},identifiers.hotspots,findingHighlights.markers)}<AxisGizmo viewer={viewer} source={src} cameraGroup={options.cameraGroup} boardAxes={mapped}/>{identifiers.details}{!loaded&&!error&&<p role="status">Loading native model…</p>}</div><p className="board3d-note">{name||(example?'9 official KiCad library models · R1–R6, U1, J1–J2':'KiCad board export')} · Drag to orbit, scroll to zoom, right-drag to pan. {example&&!local?<>Visual package assignments for this synthetic board; fit and clearances are not verified. Recorded engineering results are unchanged. <a href={`${import.meta.env.BASE_URL}demo/models/LICENSE.md`}>KiCad library license</a></>:'Component shapes come from the supplied model. Use the geometry preview for UUID-linked inspection; no component coordinates are assumed for an arbitrary GLB.'}</p></>:<><Board3D geometry={geometry} preview={preview} {...options} focusReference={request}/><p className="board3d-note">Illustrative packages are shown where native models are unavailable. Open a complete GLB or supply assigned STEP/WRL files with your project ZIP.</p></>}
 {findingHighlights.panel}<ModelInventory geometry={geometry} models={assigned} onInspect={inspect} onSupply={()=>window.dispatchEvent(new Event('circuitcheck:upload'))}/>
 </div>;
}
