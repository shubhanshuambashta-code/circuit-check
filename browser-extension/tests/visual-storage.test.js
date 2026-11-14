import test from 'node:test';import assert from 'node:assert/strict';
import {createRun} from '../extension/review.js';
import {connectPin} from '../extension/visual-model.js';
import {openVisualProject,loadVisualProject,saveVisualProject} from '../extension/visual-storage.js';
import {loadWorkspace,importWorkspace,MAX_BYTES,WORKSPACE_KEY,transact} from '../extension/workspace.js';
let memory={};globalThis.chrome={storage:{local:{get:async()=>structuredClone(memory),set:async data=>{memory=structuredClone({...memory,...data});}}}};
const raw=()=>({schema:1,designId:'visual-save',title:'Storage fixture',source:'Test fixture',simulation:'stopped',wireCount:1,components:[{id:'B1',label:'B1',model:'battery9V',typeName:'Battery',terminals:[{name:'+',net:'a'},{name:'-',net:'b'}],resistance:null,native:[],properties:[]}]});
test('visual workspace persists edits and refuses a stale concurrent save',async()=>{
 const run=await createRun(raw()),opened=await openVisualProject(run),projectId=opened.result;const loaded=await loadVisualProject(projectId),a=loaded.document;
 const changed=connectPin(a,'B1',0,'B1',1);await saveVisualProject(projectId,changed,0);const fresh=await loadVisualProject(projectId);assert.equal(fresh.document.revision,1);assert.equal(fresh.document.draft.components[0].terminals[0].net,'b');
 const before=structuredClone(memory);await assert.rejects(saveVisualProject(projectId,a,0),/another window/);assert.deepEqual(memory,before);
});
test('opening an updated live project preserves the draft and exposes a newer source explicitly',async()=>{
 const rawChanged=raw();rawChanged.components[0].label='Changed source';const run=await createRun(rawChanged);await openVisualProject(run);const loaded=await loadVisualProject(run.projectId);
 assert.equal(loaded.document.draft.components[0].terminals[0].net,'b');assert.equal(loaded.latestSource.snapshot.components[0].label,'Changed source');
});
test('library backup restores visual-only projects as historical data without overwriting an existing draft',async()=>{
 const exported=await loadWorkspace();memory={};await importWorkspace(exported);const restored=await loadVisualProject('tinkercad:visual-save');assert.equal(restored.document.original.snapshot.imported,true);assert.equal(restored.document.draft.components[0].terminals[0].net,'b');
 const before=structuredClone(memory);await importWorkspace(exported);assert.deepEqual(memory,before);
});
test('invalid and oversized draft saves leave all local evidence intact',async()=>{
 const existing=await loadVisualProject('tinkercad:visual-save'),before=structuredClone(memory);const malformed=structuredClone(existing.document);malformed.draft.designId='other';await assert.rejects(saveVisualProject('tinkercad:visual-save',malformed,0));assert.deepEqual(memory,before);
 await assert.rejects(transact(data=>{data[WORKSPACE_KEY]='x'.repeat(MAX_BYTES);}),/full/);assert.deepEqual(memory,before);
});
