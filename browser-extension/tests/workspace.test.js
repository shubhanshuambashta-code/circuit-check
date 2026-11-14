import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../extension/review.js';
import {saveRun,saveNote,importWorkspace,loadWorkspace,transact,WORKSPACE_KEY,MAX_BYTES} from '../extension/workspace.js';
let memory={};globalThis.chrome={storage:{local:{get:async()=>structuredClone(memory),set:async values=>{memory=structuredClone({...memory,...values});}}}};
const snapshot={schema:1,designId:'saved-fixture',title:'Saved fixture',source:'Test fixture',simulation:'stopped',capturedAt:'2026-11-04T00:00:00Z',wireCount:1,components:[{id:'B1',label:'B1',model:'battery9V',typeName:'Battery',terminals:[{name:'+',net:'short'},{name:'-',net:'short'}],resistance:null,properties:[],native:[]}]};
test('reviews, decisions and profile survive a fresh storage read; imports recompute forged results',async()=>{
 memory={};const run=await createRun(snapshot);const saved=await saveRun(run,'Baseline');assert.equal(saved.result.name,'Baseline');
 await saveNote(run,run.analysis.findings[0],'exception','Intentional fixture');let data=await loadWorkspace();assert.equal(data.projects[0].notes[0].body,'Intentional fixture');
 const exported=structuredClone(data);exported.projects[0].runs[0].analysis.findings=[];
 exported.projects[0].explanations=[{engine:'evidence-guide/1',question:'Why?',answer:'Fixture evidence',findingId:'short-B1-+-−',evidenceHash:'scope',createdAt:'2026-11-04'}];
 exported.projects[0].repairs=[{componentId:'R1',before:0,after:470,createdAt:'2026-11-04'}];
 await importWorkspace(exported);data=await loadWorkspace();
 assert.equal(data.projects[0].runs.length,2);const imported=data.projects[0].runs[1];assert.equal(imported.analysis.findings.length,1);assert.equal(imported.snapshot.imported,true);assert.equal(imported.snapshot.editable,false);
 assert.match(data.projects[0].explanations[0].mode,/unverified/);assert.equal(data.projects[0].repairs[0].restored,true);assert.equal(data.projects[0].repairs[0].imported,true);
});
test('storage limit fails atomically and leaves the existing library intact',async()=>{
 const before=structuredClone(memory);await assert.rejects(transact(data=>{data.extra='x'.repeat(MAX_BYTES);}),/full/);assert.deepEqual(memory,before);
});
test('invalid note or archive input cannot overwrite saved reviews',async()=>{
 const before=structuredClone(memory);const run=await createRun(snapshot);
 await assert.rejects(saveNote(run,run.analysis.findings[0],'exception',''),/reason/);
 await assert.rejects(importWorkspace({schema:2,projects:[{runs:[{snapshot:{...snapshot,designId:''}}]}]}),/design ID/);
 assert.deepEqual(memory,before);assert.ok(memory[WORKSPACE_KEY]);
 const previous=chrome.storage;delete chrome.storage;await assert.rejects(loadWorkspace(),/Reload Circuit Check/);chrome.storage=previous;
});
