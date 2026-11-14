export function readExtraCircuit(){
 try{
  if(['www.circuitlab.com','circuitlab.com'].includes(location.hostname)&&window.slm?.c?.S?.elements){
   const rows=Object.entries(window.slm.c.S.elements).map(([id,e])=>({id,data:e.toJSON(),pins:(e.d||[]).map(p=>({name:String(p.ei||''),x:p.Ab(),y:p.Bb()}))}));
   return {schema:1,platform:'circuitlab',text:JSON.stringify({format:'circuitlab-capture',rows}),designId:String(window.circuit_id||location.hash||'unsaved'),title:window.circuit_name||document.title,source:'CircuitLab live element geometry',captureMode:'live',imported:false};
  }
  if(window.SIMDUINO_STUDIO?.getSnapshot){const raw=window.SIMDUINO_STUDIO.getSnapshot();return {schema:1,platform:'simduino',text:JSON.stringify(raw),designId:'studio:'+location.pathname+location.search,title:document.title,source:'SimDuino live circuit snapshot',captureMode:'live',imported:false};}
  if(window.CircuitJS1?.exportCircuit){const text=window.CircuitJS1.exportCircuit();return {schema:1,platform:'falstad',text,designId:location.pathname,title:document.title,source:'CircuitJS live export',captureMode:'live',imported:false};}
  return null;
 }catch(e){return {schema:1,error:'Circuit reader failed: '+String(e.message||e)};}
}
