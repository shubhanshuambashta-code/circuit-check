import json
from pathlib import Path
import pytest
from backend import db,worker
from backend.storage import LocalStorage,fingerprint
from backend.tscircuit_checks import normalize,run_capture

FIXTURES=Path(__file__).resolve().parents[1]/'fixtures/captured-checks'

def upload(client,name):
    response=client.post('/api/projects',files=[('files',(name+'.json',(FIXTURES/(name+'.json')).read_bytes()))])
    assert response.status_code==202,response.text
    return response.json()

def test_captured_violation_uses_existing_pipeline_and_retains_identifiers_without_kicad_or_ai(client,monkeypatch):
    def no_native(*args):raise AssertionError('Captured JSON must not invoke native KiCad')
    monkeypatch.setattr(worker,'analyze',no_native)
    p=upload(client,'required-pin-violation');store=LocalStorage();source=store.revision(p['project_id'],p['revision_id'])/'source';before=fingerprint(source)
    assert worker.tick()
    project=client.get('/api/projects/'+p['project_id']).json();result=project['revision']['result']
    assert result['engine_version']=='@tscircuit/checks 0.0.279'
    finding=next(f for f in result['findings'] if f['rule']=='checkPinMustBeConnected')
    assert finding['severity']=='error' and finding['source']=='@tscircuit/checks'
    assert finding['source_component_ids']==['controller:original']
    assert any(ref.get('pin_key')=='signal' for ref in finding['source_refs'])
    assert finding['board_object_ids']==[] and finding['highlight_status']=='unavailable'
    assert finding['source_selection_status']=='exact_captured_components'
    assert result['provenance']['engineering_engine'].startswith('@tscircuit/checks')
    assert fingerprint(source)==before
    report=client.get(f"/api/projects/{p['project_id']}/revisions/{p['revision_id']}/artifacts/tscircuit-report.json")
    assert report.status_code==200 and report.json()['source_map']
    drawing=client.get(f"/api/projects/{p['project_id']}/revisions/{p['revision_id']}/schematic-source")
    assert drawing.status_code==200 and drawing.json()['components'][0]['id']=='controller:original'

@pytest.mark.parametrize('name',['valid','incomplete','underspecified'])
def test_supported_valid_incomplete_and_pin_specification_inputs(client,name):
    p=upload(client,name);assert worker.tick()
    result=client.get('/api/projects/'+p['project_id']).json()['revision']['result']
    if name=='valid':
        assert result['findings']==[]
        assert len([row for row in result['coverage'] if row.get('evaluation_status')=='evaluated'])==5
    elif name=='incomplete':
        assert result['findings']==[]
        assert all(row['count'] is None for row in result['coverage'])
        assert len([row for row in result['coverage'] if row['status']=='skipped'])==5
    else:
        assert len(result['findings'])==3
        assert all(f['severity']=='warning' and f['repair'] is None for f in result['findings'])

def test_process_failure_retains_failed_coverage_without_passing_or_creating_findings(client,monkeypatch):
    monkeypatch.setenv('CIRCUITCHECK_NODE','missing-node-executable-for-test')
    p=upload(client,'valid');assert worker.tick()
    result=client.get('/api/projects/'+p['project_id']).json()['revision']['result']
    assert result['status']=='failed' and result['findings']==[]
    checks=[row for row in result['coverage'] if row.get('engine')=='@tscircuit/checks']
    assert checks and all(row['status']=='failed' and row['count'] is None for row in checks)

def test_mapping_uses_exact_recorded_pad_or_unique_component_and_labels_ambiguity():
    issue={'rule':'checkPinMustBeConnected','upstream_type':'source_pin_must_be_connected_error','evidence':'Required pin is floating','explanation':'Captured requirement','suggestion':'Review pin',
           'severity':'error','source_component_ids':['captured-id'],'circuit_json_component_ids':[],'circuit_json_port_ids':['pin-id'],
           'source_refs':[{'component_id':'captured-id','reference':'U1','pin_name':'1','pin_key':'original-pin'}]}
    report={'findings':[issue]};result={'geometry':{'objects':[{'id':'component-native-id','kind':'component','reference':'U1'},{'id':'pad-native-id','kind':'pad','reference':'U1','pad':'1'}]}}
    finding=normalize(report,result,'board.kicad_pcb')[0];assert finding['board_object_ids']==['pad-native-id']
    result['geometry']['objects'].append({'id':'ambiguous-component','kind':'component','reference':'U1'})
    finding=normalize(report,result,'board.kicad_pcb')[0];assert finding['board_object_ids']==[] and finding['highlight_status']=='unavailable'

def test_native_supplement_does_not_replace_native_findings_or_severity(tmp_path,monkeypatch):
    from backend.tscircuit_checks import apply_report
    native={'id':'native-rule','source':'KiCad ERC','rule':'pin_not_connected','severity':'warning'}
    result={'status':'completed','findings':[native.copy()],'coverage':[{'id':'ERC','status':'checked'}],'checks':[],'provenance':{'engineering_engine':'KiCad 10.0.7'},'geometry':{'objects':[]}}
    report=run_capture(json.loads((FIXTURES/'required-pin-violation.json').read_text()),tmp_path/'artifacts')
    apply_report(result,report,'native.kicad_sch')
    assert result['findings'][0]==native and result['coverage'][0]=={'id':'ERC','status':'checked'}
    assert result['provenance']['engineering_engine']=='KiCad 10.0.7'
    assert result['findings'][1]['source']=='@tscircuit/checks' and result['findings'][1]['classification']=='review_suggestion'

def test_unknown_net_assignment_blocks_a_misleading_open_pin_drawing(client):
    raw=json.loads((FIXTURES/'incomplete.json').read_text());del raw['components'][0]['terminals'][0]['net']
    p=client.post('/api/projects',files=[('files',('unknown.json',json.dumps(raw).encode()))]).json()
    response=client.get(f"/api/projects/{p['project_id']}/revisions/{p['revision_id']}/schematic-source")
    assert response.status_code==422 and 'unknown' in response.json()['detail']

def test_supplemental_failure_does_not_change_authoritative_native_status():
    from backend.tscircuit_checks import apply_report,failed_report
    native={'id':'native-width','source':'KiCad DRC','severity':'error','rule':'track_width'}
    result={'status':'completed','findings':[native.copy()],'coverage':[],'checks':[],'provenance':{'engineering_engine':'KiCad 10.0.7'}}
    apply_report(result,failed_report('fixture engine failure'),'board.kicad_pcb')
    assert result['status']=='completed' and result['findings']==[native]
    assert result['additional_checks']['status']=='failed'
    assert all(row['status']=='failed' and row['count'] is None for row in result['coverage'])

def test_stale_checker_output_is_rejected(tmp_path,monkeypatch):
    import backend.tscircuit_checks as integration
    def fake_run(args,*unused):
        output=Path(args[args.index('--output')+1]);output.write_text(json.dumps({'engine':integration.ENGINE,'engine_version':integration.VERSION,'input_sha256':'wrong-input','coverage':[],'findings':[]}))
        return 0,''
    monkeypatch.setattr(integration,'run',fake_run)
    report=integration.run_capture(json.loads((FIXTURES/'valid.json').read_text()),tmp_path/'artifacts')
    assert report['findings']==[]
    assert all(row['status']=='failed' and row['count'] is None for row in report['coverage'])
