import {ChevronRight} from 'lucide-react';
export default function ReviewFlow({hasProject,checking,hasResult,comparing,correcting,onUpload,onAnalysis,onReview,onCorrection,onCompare}:{hasProject:boolean;checking:boolean;hasResult:boolean;comparing:boolean;correcting:boolean;onUpload:()=>void;onAnalysis:()=>void;onReview:()=>void;onCorrection:()=>void;onCompare:()=>void}){
 const step=!hasProject?0:checking||!hasResult?1:comparing?4:correcting?3:2;
 const actions=[onUpload,onAnalysis,onReview,onCorrection,onCompare];
 return <nav className="r2-review-flow" aria-label="Review workflow">{['Upload','Analysis','Findings','Correction','Comparison'].map((label,index)=><div key={label}><button disabled={index>0&&!hasProject||index>1&&!hasResult} aria-current={step===index?'step':undefined} onClick={actions[index]}><span>{index+1}</span>{label}</button>{index<4&&<ChevronRight size={13} aria-hidden="true"/>}</div>)}</nav>;
}
