import json
from pathlib import Path
import pytest
import httpx
from backend import db
from backend.storage import LocalStorage
from backend.circuit_context import evidence_index
from backend.circuit_assistant import Interpretation,validate_interpretation

BOARD='''(kicad_pcb (net 0 "") (net 1 "GND") (net 2 "drive")
 (footprint "Resistor" (property "Reference" "R1") (property "Value" "220") (pad "1" smd rect (net 2 "drive")) (pad "2" smd rect (net 1 "GND")))
 (footprint "IC" (property "Reference" "U1") (property "Value" "controller") (pad "1" smd rect (net 2 "drive"))))'''

def project_with_report(client):
    p=client.post('/api/projects',files=[('files',('board.kicad_pcb',BOARD.encode()))]).json()
    revision=db.row('revisions',p['revision_id'])
    report={'status':'completed','project_hash':revision['hash'],'rules_fingerprint':'rules-fixture','engine_version':'10.0.7','finished_at':1,'geometry':{'objects':[]},'checks':[{'name':'DRC','status':'completed','message':'Fixture report'}],
            'coverage':[{'id':'track_width','name':'Track width','status':'checked','count':1}],
            'findings':[{'id':'width-issue','title':'Track width below minimum','rule':'track_width','source':'KiCad DRC','severity':'warning','excluded':False,'classification':'confirmed_violation','evidence':'R1 track is 0.15 mm; minimum 0.25 mm.','suggestion':'Review the reported minimum and widen the exact track.','object_ids':[],'objects':[{'description':'Track near R1','pos':{'x':10,'y':20}}],'position':{'x':10,'y':20},'measured':{'value':0.15,'unit':'mm'},'required':{'value':0.25,'unit':'mm'},'repair':{'kind':'track_width'}}]}
    with db.connect() as c:
        c.execute('UPDATE revisions SET result=? WHERE id=?',(json.dumps(report),p['revision_id']))
        c.execute("UPDATE jobs SET status='completed' WHERE id=?",(p['job_id'],))
    folder=LocalStorage().revision(p['project_id'],p['revision_id'])/'artifacts';folder.mkdir(exist_ok=True)
    (folder/'drc.json').write_text(json.dumps({'violations':[{'type':'track_width','severity':'warning','description':'R1 track is 0.15 mm; minimum 0.25 mm.','items':[]}]}))
    return p

def context(client,p):return client.get(f"/api/projects/{p['project_id']}/assistant/context?revision_id={p['revision_id']}").json()['context']

def test_context_uses_real_source_connectivity_rules_reports_and_coordinates(client):
    p=project_with_report(client);c=context(client,p)
    assert c['counts']['components']==2 and c['counts']['pins']==3 and c['counts']['nets']==2
    assert {part['label'] for part in c['components']}=={'R1','U1'}
    assert next(n for n in c['nets'] if n['name']=='drive')['pins'][0]['reference']=='R1'
    assert c['findings'][0]['position']=={'x':10,'y':20}
    assert c['findings'][0]['measured']['value']==0.15
    assert c['findings'][0]['component_references']==['R1']
    assert c['native_reports'][0]['file']=='drc.json'
    assert c['project']['analysis_matches_source'] is True
    assert len(c['snapshot_hash'])==64

@pytest.mark.parametrize('question',['Why is this circuit not working?','Which component is causing the problem?','What will happen if I manufacture this PCB without correcting the error?','Which error should I fix first?','Can you explain this error to me as a beginner?'])
def test_all_requested_question_styles_use_scoped_evidence_without_pretending_to_be_ai(client,question):
    p=project_with_report(client);before=db.row('revisions',p['revision_id'])
    response=client.post(f"/api/projects/{p['project_id']}/assistant",json={'question':question,'revision_id':p['revision_id']})
    assert response.status_code==200,response.text
    answer=response.json();assert answer['provider']=='deterministic' and 'no AI model' in answer['mode']
    assert 'R1' in answer['answer'] and '0.15 mm' in answer['answer']
    assert any(s['id']=='finding:width-issue' for s in answer['sources'])
    assert answer['revision_id']==p['revision_id']
    assert db.row('revisions',p['revision_id'])==before
    history=client.get(f"/api/projects/{p['project_id']}/assistant/history").json();assert len(history)==1 and history[0]['question']==question

def test_unknown_components_values_and_operations_are_rejected(client):
    p=project_with_report(client);c=context(client,p)
    good={'answer':'The R1 track is 0.15 mm.','evidence_ids':['finding:width-issue'],'finding_ids':['width-issue'],'component_ids':[],'hypotheses':[],'missing_information':[]}
    validate_interpretation(Interpretation(**good),c)
    for update in [{'answer':'Replace U99.'},{'answer':'Width is 9.7 mm.'},{'evidence_ids':['finding:invented']},{'component_ids':['fake']},{'answer':'This PCB is electrically safe.'}]:
        with pytest.raises(ValueError):validate_interpretation(Interpretation(**{**good,**update}),c)
    with pytest.raises(ValueError):Interpretation(**good,operation={'delete_component':'U1'})

def test_cross_project_revisions_findings_and_secret_questions_are_rejected(client):
    one,two=project_with_report(client),project_with_report(client)
    url=f"/api/projects/{one['project_id']}/assistant"
    assert client.post(url,json={'question':'Why?','revision_id':two['revision_id']}).status_code==404
    assert client.post(url,json={'question':'Why?','finding_id':'foreign'}).status_code==422
    assert client.post(url,json={'question':'gsk_'+'a'*40}).status_code==422
    assert client.get(f"/api/projects/{one['project_id']}/assistant/history?revision_id={two['revision_id']}").status_code==404
    with db.connect() as c:assert c.execute('SELECT count(*) FROM explanations').fetchone()[0]==0

def test_groq_request_contains_actual_context_and_citations_are_server_generated(client,monkeypatch):
    p=project_with_report(client)
    monkeypatch.setenv('GROQ_API_KEY','gsk_'+'a'*40)
    import backend.circuit_assistant as assistant
    captured={}
    class Client:
        def __init__(self,*a,**k):pass
        async def __aenter__(self):return self
        async def __aexit__(self,*args):pass
        async def post(self,url,**kwargs):
            captured.update(url=url,**kwargs)
            value={'answer':'The reported R1 track is 0.15 mm, below the 0.25 mm minimum.','evidence_ids':['finding:width-issue','rules:project'],'finding_ids':['width-issue'],'component_ids':[],'hypotheses':[],'missing_information':['Operating current is unavailable.']}
            return httpx.Response(200,request=httpx.Request('POST',url),json={'model':'openai/gpt-oss-20b','choices':[{'message':{'content':json.dumps(value)}}],'usage':{'prompt_tokens':100,'completion_tokens':50,'total_tokens':150}})
    monkeypatch.setattr(assistant.httpx,'AsyncClient',Client)
    response=client.post(f"/api/projects/{p['project_id']}/assistant",json={'question':'Explain this as a beginner.'})
    assert response.status_code==200,response.text
    answer=response.json();assert answer['provider']=='model' and answer['usage']['total_tokens']==150
    payload=json.loads(captured['json']['messages'][1]['content']);data=payload['circuit_evidence']
    assert captured['url']=='https://api.groq.com/openai/v1/chat/completions'
    assert any(v['kind']=='component' and v['data']['label']=='R1' for v in data.values())
    assert any(v['kind']=='net' and v['data']['name']=='drive' for v in data.values())
    assert data['finding:width-issue']['data']['measured']['value']==0.15
    assert 'gsk_' not in json.dumps(payload) and 'gsk_' not in response.text
    assert answer['sources'][0]['data']['evidence']=='R1 track is 0.15 mm; minimum 0.25 mm.'

@pytest.mark.parametrize('mode',['rate-limit','hallucination'])
def test_failed_provider_or_hallucination_falls_back_honestly(client,monkeypatch,mode):
    p=project_with_report(client);monkeypatch.setenv('GROQ_API_KEY','gsk_'+'a'*40)
    import backend.circuit_assistant as assistant
    class Client:
        def __init__(self,*a,**k):pass
        async def __aenter__(self):return self
        async def __aexit__(self,*a):pass
        async def post(self,url,**kwargs):
            raw={'answer':'Replace U99.','evidence_ids':['finding:width-issue'],'finding_ids':['width-issue'],'component_ids':[],'hypotheses':[],'missing_information':[]}
            return httpx.Response(429 if mode=='rate-limit' else 200,request=httpx.Request('POST',url),json={'choices':[{'message':{'content':json.dumps(raw)}}]})
    monkeypatch.setattr(assistant.httpx,'AsyncClient',Client)
    answer=client.post(f"/api/projects/{p['project_id']}/assistant",json={'question':'Why?'}).json()
    assert answer['provider']=='deterministic' and 'U99' not in answer['answer']
    assert any('limits' in note or 'validation' in note for note in answer['missing_information'])

def test_provider_form_keeps_key_server_side_and_never_accepts_client_urls(client,monkeypatch):
    import backend.assistant_provider as provider
    key='gsk_'+'a'*40
    class Client:
        def __init__(self,*a,**k):pass
        async def __aenter__(self):return self
        async def __aexit__(self,*a):pass
        async def get(self,url,**kwargs):return httpx.Response(200,request=httpx.Request('GET',url),json={'data':[{'id':provider.GROQ_MODEL}]})
    monkeypatch.setattr(provider.httpx,'AsyncClient',Client)
    response=client.post('/api/assistant/provider',json={'key':key})
    assert response.status_code==200 and response.json()['configured'] is True
    assert key not in response.text and key not in client.get('/api/assistant/provider').text
    assert 'key' not in json.loads(provider.CONFIG_FILE.read_text())
    assert provider.load_secret(provider.credential_target())==key
    assert client.post('/api/assistant/provider',json={'key':key,'base_url':'http://elsewhere'}).status_code==422
    assert client.post('/api/assistant/provider',json={'key':'bad\ninjection'}).status_code==422

def test_zero_nets_and_stale_reports_are_not_diagnosed_as_a_proven_component_failure(client):
    p=project_with_report(client);folder=LocalStorage().revision(p['project_id'],p['revision_id'])/'source';path=folder/'board.kicad_pcb';path.write_text(BOARD.replace('(net 2 "drive")','').replace('(net 1 "GND")',''))
    response=client.post(f"/api/projects/{p['project_id']}/assistant",json={'question':'Why is this circuit not working?'}).json()
    assert 'No assigned nets were captured' in response['answer']
    assert any('do not match' in note for note in client.get(f"/api/projects/{p['project_id']}/assistant/context").json()['context']['notes'])

def test_real_kicad_findings_reach_the_assistant(engine,client,upload_fixture):
    from backend.worker import tick
    p=upload_fixture('drc');assert tick()
    context_response=client.get(f"/api/projects/{p['project_id']}/assistant/context")
    assert context_response.status_code==200,context_response.text
    c=context_response.json()['context'];assert c['project']['engine'].startswith('10.0.')
    assert any(f['rule']=='track_width' and f['evidence'] for f in c['findings'])
    response=client.post(f"/api/projects/{p['project_id']}/assistant",json={'question':'Which error should I fix first?'}).json()
    assert response['sources'] and any(s['kind']=='finding' for s in response['sources'])
    assert response['provider']=='deterministic' and 'No files edited' in response['verification']
