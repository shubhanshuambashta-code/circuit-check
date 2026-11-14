import json
import pytest
from backend.schematic_source import capture_pcb

OPEN='''(kicad_pcb (version 20240108) (net 0 "")
 (footprint "Header" (property "Reference" "J1") (property "Value" "Header_2")
  (pad "1" thru_hole rect (at 0 0)) (pad "2" thru_hole oval (at 2.54 0)))
 (footprint "Hole" (property "Reference" "H1") (pad "" np_thru_hole circle)))'''

def test_missing_uuids_and_all_open_pads_are_read_without_invented_connections():
    result=capture_pcb(OPEN,'Saved Arduino','arduino.kicad_pcb')
    assert len(result['components'])==1
    part=result['components'][0]
    assert part['label']=='J1' and part['value']=='Header_2'
    assert [p['name'] for p in part['terminals']]==['1','2']
    assert all(p['net'] is None for p in part['terminals'])
    assert any('no assigned electrical nets' in note for note in result['adapterNotes'])
    assert 'local reconstruction' in ' '.join(result['adapterNotes'])

def test_legacy_modules_and_explicit_net_codes_preserve_membership():
    raw='''(kicad_pcb (net 0 "") (net 1 "GND") (net 2 "signal")
     (module "Old" (fp_text reference "R1") (fp_text value "220")
      (pad "1" thru_hole rect (net 1 "GND")) (pad "2" thru_hole oval (net 2)))
     (footprint "Modern" (property "Reference" "R1") (pad "1" smd rect (net 1))))'''
    parts=capture_pcb(raw)['components']
    assert len({p['id'] for p in parts})==2
    legacy=next(p for p in parts if p['value']=='220')
    assert [p['net'] for p in legacy['terminals']]==['GND','signal']
    assert next(p for p in parts if p is not legacy)['terminals'][0]['net']=='GND'

def test_duplicate_physical_pads_are_deduplicated_and_conflicts_rejected():
    good='(kicad_pcb (footprint X (pad "1" smd rect (net 1 "a")) (pad "1" smd rect (net 1 "a"))))'
    assert len(capture_pcb(good)['components'][0]['terminals'])==1
    with pytest.raises(ValueError,match='conflicting'):
        capture_pcb(good.replace('(net 1 "a"))))','(net 2 "b"))))'))

def test_unknown_net_names_stay_explicit_and_unsupported_sources_fail():
    assert capture_pcb('(kicad_pcb (footprint X (pad "1" smd rect (net 7))))')['components'][0]['terminals'][0]['net']=='PCB net 7'
    with pytest.raises(ValueError,match='No numbered electrical pads'):
        capture_pcb('(kicad_pcb (gr_line (start 0 0) (end 1 1)))')
    with pytest.raises(ValueError,match='not a KiCad PCB'):
        capture_pcb('(kicad_sch)')
    with pytest.raises(ValueError,match='500 components'):
        capture_pcb('(kicad_pcb '+'(footprint X)'*501+')')

def upload(client):
    response=client.post('/api/projects',files=[('files',('arduino.kicad_pcb',OPEN.encode()))])
    assert response.status_code==202,response.text
    return response.json()

def test_endpoint_reads_existing_source_before_analysis_and_preserves_revision(client):
    created=upload(client);pid,rid=created['project_id'],created['revision_id']
    before=client.get(f'/api/projects/{pid}').json()
    response=client.get(f'/api/projects/{pid}/revisions/{rid}/schematic-source')
    assert response.status_code==200,response.text
    data=response.json()
    assert data['projectId']==pid and data['revisionId']==rid
    assert data['sourceHash']==before['revision']['hash']
    assert len(data['components'][0]['terminals'])==2
    after=client.get(f'/api/projects/{pid}').json()
    assert after['revision']==before['revision']
    assert after['current_revision']==before['current_revision']
    assert after['jobs']==before['jobs']

def test_endpoint_rejects_cross_project_revisions_and_unsafe_roots(client):
    one,two=upload(client),upload(client)
    assert client.get(f"/api/projects/{two['project_id']}/revisions/{one['revision_id']}/schematic-source").status_code==404
    from backend import db
    revision=db.row('revisions',one['revision_id']);manifest=json.loads(revision['manifest']);manifest['root']='../../outside'
    with db.connect() as connection:
        connection.execute('UPDATE revisions SET manifest=? WHERE id=?',(json.dumps(manifest),one['revision_id']))
    assert client.get(f"/api/projects/{one['project_id']}/revisions/{one['revision_id']}/schematic-source").status_code==422

def test_endpoint_requires_explicit_project_root(client):
    created=upload(client)
    from backend import db
    revision=db.row('revisions',created['revision_id']);manifest=json.loads(revision['manifest']);manifest['root']=None;manifest['requires_selection']=True
    with db.connect() as connection:
        connection.execute('UPDATE revisions SET manifest=? WHERE id=?',(json.dumps(manifest),created['revision_id']))
    response=client.get(f"/api/projects/{created['project_id']}/revisions/{created['revision_id']}/schematic-source")
    assert response.status_code==422 and 'Choose' in response.json()['detail']
