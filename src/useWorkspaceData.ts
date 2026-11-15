import {useCallback,useEffect,useRef,useState} from 'react';
import {api,type Project,type ProjectSummary} from './api';
import type {Health} from './api.generated';

export default function useWorkspaceData(storageKey:string){
 const [projects,setProjects]=useState<ProjectSummary[]>([]),[project,setProject]=useState<Project>(),[health,setHealth]=useState<Partial<Health>&{unreachable?:boolean}>(),[startupError,setStartupError]=useState('');
 const current=useRef<string|undefined>(undefined),mounted=useRef(true);
 const reloadProjects=useCallback(async()=>{const list=await api<ProjectSummary[]>('/projects');if(mounted.current)setProjects(list);return list},[]);
 const load=useCallback(async(id:string)=>{const project=await api<Project>('/projects/'+id);if(mounted.current&&current.current===id)setProject(project);return project},[]);
 useEffect(()=>{
  mounted.current=true;
  const check=()=>api<Health>('/health').then(value=>{if(mounted.current)setHealth(value)}).catch(()=>{if(mounted.current)setHealth({unreachable:true})});
  void check();const timer=setInterval(check,5000);
  reloadProjects().then(list=>{let stored:string|null=null;try{stored=localStorage.getItem(storageKey)}catch{}const id=list.find(p=>p.id===stored)?.id||list[0]?.id;if(id){current.current=id;return load(id)}}).catch(e=>{if(mounted.current)setStartupError((e as Error).message)});
  return()=>{mounted.current=false;clearInterval(timer)};
 },[storageKey,load,reloadProjects]);
 return {projects,project,setProject,health,startupError,reloadProjects,load,current};
}
