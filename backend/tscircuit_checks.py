"""Supplemental local Circuit JSON checks. Native KiCad evidence is never replaced."""
import hashlib
import json
import os
import shutil
import time
from .config import ROOT
from .storage import fingerprint
from .engine import run,EngineError
from .job_runtime import AnalysisCancelled,checkpoint
from .captured import read_capture
from .schematic_source import SourceConnectivityUnavailable

ENGINE='@tscircuit/checks'
VERSION='0.0.279'
ADAPTER='circuitcheck-tscircuit/1'
RULES=('checkPinMustBeConnected','checkAllPinsInComponentAreUnderspecified','checkNoPowerPinDefined','checkNoGroundPinDefined','checkSourcePinVoltageCompatibility')
ARTIFACT='tscircuit-report.json'

def failed_report(message,status='failed'):
    return {'engine':ENGINE,'engine_version':VERSION,'adapter_version':ADAPTER,'schema_version':'0.0.550','findings':[],
            'coverage':[{'id':'tscircuit:'+rule,'name':'tscircuit · '+rule,'engine':ENGINE,'engine_version':VERSION,'status':status,'evaluation_status':status,'count':None,'message':message,'basis':rule} for rule in RULES]}

def run_capture(capture,artifacts):
    artifacts.mkdir(parents=True,exist_ok=True)
    input_path=artifacts/'tscircuit-input.json';output_path=artifacts/ARTIFACT
    input_path.write_text(json.dumps(capture,ensure_ascii=False),encoding='utf-8')
    output_path.unlink(missing_ok=True)
    input_hash=hashlib.sha256(input_path.read_bytes()).hexdigest()
    node=os.getenv('CIRCUITCHECK_NODE') or shutil.which('node')
    try:
        if not node:raise EngineError('Node.js is unavailable. Install Node.js 24 and run npm ci in the CircuitCheck folder.')
        code,_=run([node,ROOT/'checks'/'run-tscircuit.mjs','--input',input_path,'--output',output_path],artifacts,artifacts/'tscircuit.log',30)
        if code:raise EngineError('The local tscircuit checker exited unsuccessfully. Run npm ci; inspect the retained tscircuit.log. No successful check is established.')
        if not output_path.is_file() or output_path.stat().st_size>10*1024*1024:raise EngineError('The local checker did not produce a bounded JSON report.')
        report=json.loads(output_path.read_text(encoding='utf-8'))
        if report.get('input_sha256')!=input_hash:raise ValueError('Checker output does not match this captured input; stale result rejected.')
        if report.get('engine')!=ENGINE or report.get('engine_version')!=VERSION or not isinstance(report.get('coverage'),list) or not isinstance(report.get('findings'),list):raise ValueError('Invalid local checker report.')
        return report
    except AnalysisCancelled:raise
    except (EngineError,OSError,ValueError) as error:
        report=failed_report(str(error).replace('KiCad','Node.js supplemental checker'));output_path.write_text(json.dumps(report,indent=2),encoding='utf-8');return report

def normalize(report,result,source_file,captured=False):
    objects=(result.get('geometry') or {}).get('objects',[])
    normalized=[]
    for issue in report['findings']:
        refs=issue['source_refs'];references=sorted({r['reference'] for r in refs if r.get('reference')});nets=sorted({r['net'] for r in refs if r.get('net')})
        mapped=[];component_only=False
        if not captured:
            for ref in refs:
                # Native references must resolve uniquely; pin names map only to
                # exact recorded pad numbers, never guessed symbol geometry.
                components=[o for o in objects if o.get('kind')=='component' and o.get('reference')==ref.get('reference')]
                if len(components)!=1:continue
                pads=[o for o in objects if o.get('kind')=='pad' and o.get('reference')==ref['reference'] and o.get('pad')==ref.get('pin_name')]
                if ref.get('pin_name') and not pads:component_only=True
                mapped.extend(o['id'] for o in (pads if pads else components))
        mapped=sorted(set(mapped))
        identity=[issue['rule'],issue['upstream_type'],issue['circuit_json_component_ids'],issue['circuit_json_port_ids']]
        fid='tscircuit-'+hashlib.sha256(json.dumps(identity,sort_keys=True).encode()).hexdigest()[:20]
        explanation=issue['explanation']
        normalized.append({'id':fid,'title':issue['evidence'],'source':ENGINE,'check_engine_version':VERSION,'rule':issue['rule'],'upstream_error_type':issue['upstream_type'],
            'category':'Supplemental captured-input check','severity':issue['severity'],'excluded':False,'file':source_file,'objects':[{'description':r['reference']+(('.'+r['pin_name']) if r.get('pin_name') else '')+' · captured source identity','source_id':r.get('pin_key',r['component_id']),'component_id':r['component_id']} for r in refs],
            'object_ids':mapped,'board_object_ids':mapped,'source_component_ids':issue['source_component_ids'],'source_refs':refs,'references':references,'nets':nets,'net':nets[0] if len(nets)==1 else None,
            'evidence':issue['evidence'],'explanation':explanation,'suggestion':issue['suggestion'],'repair':None,'verification':'Supplemental static check of captured metadata; not a native KiCad violation or circuit simulation.',
            'rule_source':f'{ENGINE}@{VERSION} · {issue["rule"]} · {issue["upstream_type"]}','classification':'review_suggestion','classification_basis':'Severity and rule are retained from upstream. This supplemental finding does not override native KiCad DRC/ERC.',
            'identity_status':'stable_native_ids' if mapped else 'stable_source_ids','highlight_status':'exact_objects' if mapped else 'unavailable','highlight_message':('Only the uniquely matched component envelope is highlighted; exact native pin geometry is unavailable.' if component_only else 'Uniquely resolved native reference / exact pad-number mapping.') if mapped else 'No native board coordinates are available. Captured component identities can be highlighted in the reconstructed connection schematic.' if captured else 'Native object mapping is unavailable; no guessed highlight is shown.',
            'source_selection_status':'exact_captured_components' if captured else 'native_objects' if mapped else 'unavailable','evidence_artifact':ARTIFACT,
            'evidence_fingerprint':hashlib.sha256(json.dumps([identity,issue['evidence'],VERSION,ADAPTER],sort_keys=True).encode()).hexdigest()})
    return normalized

def apply_report(result,report,source_file,captured=False):
    findings=normalize(report,result,source_file,captured)
    if not captured:
        for finding in findings:
            candidates=[]
            for artifact,geometry in result.get('schematic_geometry',{}).items():
                anchors=[o for o in geometry.get('objects',[]) if o.get('kind')=='symbol anchor' and o.get('reference') in finding['references']]
                if anchors and all(sum(o.get('reference')==ref for o in anchors)==1 for ref in finding['references']):candidates.append((artifact,anchors))
            if len(candidates)==1:
                artifact,anchors=candidates[0]
                finding['schematic_preview']=artifact;finding['schematic_object_ids']=[o['id'] for o in anchors]
                finding['schematic_highlight_message']='Unique native component anchors are mapped. Exact schematic pin geometry is not inferred.'
    result['findings']+=findings
    result['coverage']+=report['coverage']
    result['checks'] += [{'name':row['id'],'status':{'checked':'completed','partial':'completed'}.get(row['status'],row['status']),'message':row['message']} for row in report['coverage']]
    result['additional_checks']={key:report.get(key) for key in ('engine','engine_version','adapter_version','schema_version')}
    result['provenance']['additional_engines']=[f'{ENGINE}@{VERSION} ({ADAPTER})']
    result['additional_checks']['status']='failed' if any(row['status']=='failed' for row in report['coverage']) else 'partial' if any(row['status']=='partial' for row in report['coverage']) else 'evaluated' if any(row.get('evaluation_status')=='evaluated' for row in report['coverage']) else 'skipped'
    return result

def supplement_native(result,source,artifacts,manifest):
    checkpoint();before=fingerprint(source)
    from .circuit_context import circuit_components
    try:
        components,notes=circuit_components(source,artifacts,manifest)
        capture={'schema':1,'components':components,'topologyComplete':False,'source':'Native KiCad capture; intended net membership only','adapterNotes':notes}
        if components:report=run_capture(capture,artifacts)
        else:
            report=failed_report('No captured electrical components are available for this supplemental subset. Native KiCad results remain unchanged.','skipped')
            (artifacts/ARTIFACT).write_text(json.dumps(report,indent=2),encoding='utf-8')
    except AnalysisCancelled:raise
    except SourceConnectivityUnavailable as error:
        report=failed_report(str(error),'skipped');(artifacts/ARTIFACT).write_text(json.dumps(report,indent=2),encoding='utf-8')
    except (OSError,ValueError) as error:
        report=failed_report('Native source capture was unavailable: '+str(error));(artifacts/ARTIFACT).write_text(json.dumps(report,indent=2),encoding='utf-8')
    checkpoint()
    if fingerprint(source)!=before:raise EngineError('Source changed during supplemental analysis; result rejected.')
    return apply_report(result,report,manifest['root']+('.kicad_pcb' if (source/(manifest['root']+'.kicad_pcb')).is_file() else '.kicad_sch'))

def analyze_capture(source,artifacts,manifest,progress=lambda _:None):
    progress('Running local captured connectivity and pin-specification checks')
    before=fingerprint(source);capture=read_capture(source/manifest['capture_path']);report=run_capture(capture,artifacts);checkpoint()
    if fingerprint(source)!=before:raise EngineError('Captured source changed during checking; result rejected.')
    evaluated=any(row.get('evaluation_status')=='evaluated' for row in report['coverage'])
    failed=any(row['status']=='failed' for row in report['coverage'])
    result={'status':'failed' if failed and not evaluated else 'partial','engine_version':f'{ENGINE} {VERSION}','checks':[],'findings':[],'previews':[],
            'project_hash':before,'rules_fingerprint':hashlib.sha256((ADAPTER+VERSION).encode()).hexdigest(),'cached':False,'finished_at':time.time(),'zone_policy':'Captured logical input only; no copper, native rules, or physical geometry inferred.',
            'notices':[{'kind':'captured','message':'Imported captured input, not a live editor reading. Native KiCad DRC/ERC was not run. Unknown pin specifications and missing connections are not inferred.'}],
            'geometry':{'version':'captured-source-only/1','objects':[],'nets':sorted({p['net'] for c in capture['components'] for p in c['terminals'] if isinstance(p.get('net'),str) and p['net']}),'limitations':['No native board coordinates supplied.']},
            'captured_components':[{'id':c['id'],'label':c.get('label') or 'Unnamed component'} for c in capture['components']],
            'schematic_geometry':{},'coverage':[{'id':'native-kicad','name':'Native KiCad DRC/ERC','status':'unsupported','count':None,'message':'Captured JSON is not a native KiCad design. No native violation or pass is claimed.'}],
            'provenance':{'adapter':ADAPTER,'normalizer':ADAPTER,'geometry':'captured-source-only/1','engineering_engine':f'{ENGINE}@{VERSION} · supplemental captured-input checks','explanation_engine':'deterministic source-evidence explanations','ai_role':'No AI model is used for checking.','project_hash':before,'rules_fingerprint':hashlib.sha256((ADAPTER+VERSION).encode()).hexdigest(),'rule_profile':{'code':'captured','name':'Explicit captured metadata','version':ADAPTER}}}
    return apply_report(result,report,manifest['capture_path'],captured=True)
