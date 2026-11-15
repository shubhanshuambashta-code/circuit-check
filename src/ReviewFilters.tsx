import {useState} from 'react';
import {Bookmark,Trash2} from 'lucide-react';
import {demoMode} from './api';

export interface FilterValues {query:string;category:string;severity:string;showExcluded:boolean}
interface SavedFilter extends FilterValues {name:string}
const key=demoMode?'circuitcheck-demo-filters-v1':'circuitcheck-filters-v1';
const categories=['all','confirmed_violation','review_suggestion','potential_concern'];
function read():SavedFilter[]{
 try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value.filter(v=>v&&typeof v.name==='string'&&typeof v.query==='string'&&categories.includes(v.category)&&['all','error','warning','info'].includes(v.severity)&&typeof v.showExcluded==='boolean').slice(0,30):[]}catch{return []}
}
export default function ReviewFilters({value,onChange,onMessage}:{value:FilterValues;onChange:(value:FilterValues)=>void;onMessage:(message:string)=>void}){
 const [saved,setSaved]=useState(read),[name,setName]=useState(''),[saving,setSaving]=useState(false);
 const current=saved.find(s=>s.query===value.query&&s.category===value.category&&s.severity===value.severity&&s.showExcluded===value.showExcluded);
 function persist(next:SavedFilter[]){try{localStorage.setItem(key,JSON.stringify(next));setSaved(next);return true}catch{onMessage('Filters could not be saved in this browser. Allow local storage and try again.');return false}}
 function save(){const label=name.trim();if(!label)return;const next=[...saved.filter(s=>s.name!==label),{...value,name:label}].slice(-30);if(persist(next)){setSaving(false);setName('');onMessage('Filter saved on this browser.')}}
 return <div className="r2-review-filters">
  <label>Evidence category<select aria-label="Evidence category" value={value.category} onChange={e=>onChange({...value,category:e.target.value})}><option value="all">All findings</option><option value="confirmed_violation">Confirmed violations</option><option value="review_suggestion">Review suggestions</option><option value="potential_concern">Potential concerns</option></select></label>
  <label>Severity<select aria-label="Severity" value={value.severity} onChange={e=>onChange({...value,severity:e.target.value})}><option value="all">All severities</option><option value="error">Errors</option><option value="warning">Warnings</option><option value="info">Information</option></select></label>
  <label className="r2-excluded-filter"><input type="checkbox" checked={value.showExcluded} onChange={e=>onChange({...value,showExcluded:e.target.checked})}/>Include excluded findings</label>
  <div className="r2-saved-filter-row"><label>Saved filters<select aria-label="Saved filters" value={current?.name||''} onChange={e=>{const filter=saved.find(s=>s.name===e.target.value);if(filter)onChange(filter)}}><option value="" disabled>{saved.length?'Choose saved filter':'No saved filters yet'}</option>{saved.map(s=><option key={s.name}>{s.name}</option>)}</select></label>{current&&<button className="r2-icon" aria-label={'Delete saved filter '+current.name} onClick={()=>persist(saved.filter(s=>s.name!==current.name))}><Trash2 size={15}/></button>}</div>
  {saving?<form className="r2-save-filter-form" onSubmit={e=>{e.preventDefault();save()}}><label>Filter name<input autoFocus maxLength={60} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Ground warnings"/></label><div><button className="r2-secondary" type="button" onClick={()=>setSaving(false)}>Cancel</button><button className="r2-primary" disabled={!name.trim()}>Save filter</button></div><small>Saved on this browser. Reusing a name replaces it.</small></form>:<button className="r2-link-button" onClick={()=>setSaving(true)}><Bookmark size={14} aria-hidden="true"/>Save current filters</button>}
  <button className="r2-link-button" onClick={()=>onChange({query:'',category:'all',severity:'all',showExcluded:true})}>Reset filters</button>
 </div>;
}
