"""Bounded, revision-scoped evidence assembled from saved circuit and KiCad data."""
from collections import defaultdict
import hashlib
import json
import re
from defusedxml import ElementTree as ET
from defusedxml.common import DefusedXmlException
from .sexpr import parse
from .schematic_source import capture_pcb
from .uploads import safe_path
from .storage import fingerprint

CONTEXT_VERSION='circuit-context/1'
MAX_CONTEXT_CHARS=14000
ELECTRICAL={'shorting_items','tracks_crossing','clearance','unconnected_items','track_dangling','via_dangling','pin_not_connected','power_pin_not_driven','pin_to_pin'}
COSMETIC={'silk_overlap','silk_over_copper','text_height','text_thickness'}

def priority(finding):
    return (bool(finding.get('excluded')),finding.get('classification')=='potential_concern',
            {'error':0,'warning':1,'info':2}.get(finding.get('severity'),2),
            0 if finding.get('rule') in ELECTRICAL else 2 if finding.get('rule') in COSMETIC else 1,str(finding.get('id','')))

def digest(data):return hashlib.sha256(json.dumps(data,sort_keys=True,ensure_ascii=False,default=str).encode()).hexdigest()
def clipped(value,size=1200):return str(value or '')[:size]

def read_json(path,limit=2*1024*1024):
    if not path.is_file():return None
    if path.stat().st_size>limit:raise ValueError(path.name+' is too large for assistant context.')
    return json.loads(path.read_text(encoding='utf-8-sig'))

def circuit_components(source,artifacts,manifest):
    notes=[];root=manifest.get('root')
    if manifest.get('requires_selection') or not root:
        return [],['Select the project root before inferring circuit connectivity.']
    base=source.resolve()
    def design(suffix):
        relative=safe_path(root+suffix);path=source.joinpath(*relative.parts).resolve()
        if base not in path.parents:raise ValueError('Source path is outside the selected revision.')
        return path
    pcb=design('.kicad_pcb')
    if pcb.is_file():
        if pcb.stat().st_size>25*1024*1024:raise ValueError('PCB source exceeds the supported context size.')
        capture=capture_pcb(pcb.read_text(encoding='utf-8-sig'),source_file=pcb.name)
        return capture['components'],capture['adapterNotes']
    # Native exported connectivity is used for schematics, not guessed wire geometry.
    netlist=artifacts/'netlist.xml'
    if netlist.is_file():
        if netlist.stat().st_size>5*1024*1024:raise ValueError('Native netlist exceeds the supported context size.')
        tree=ET.parse(netlist).getroot();components={}
        for i,comp in enumerate(tree.findall('components/comp')):
            ref=comp.get('ref','');components[ref]={'id':f'schematic-part-{i+1}','label':ref,'value':comp.findtext('value',''),'model':comp.findtext('libsource/part','schematic-symbol'),'terminals':[]}
        for net in tree.findall('nets/net'):
            name=net.get('name') or 'Net '+net.get('code','?')
            for node in net.findall('node'):
                comp=components.get(node.get('ref'))
                if comp is not None:comp['terminals'].append({'name':node.get('pin','?'),'net':name,'function':node.get('pinfunction'),'type':node.get('pintype')})
        return list(components.values()),['Schematic connectivity comes from the retained native KiCad XML netlist. Pins absent from the netlist are not inferred.']
    schematic=design('.kicad_sch')
    if schematic.is_file():
        if schematic.stat().st_size>25*1024*1024:raise ValueError('Schematic source exceeds the supported context size.')
        tree=parse(schematic.read_text(encoding='utf-8-sig'));components=[]
        for i,symbol in enumerate(tree.all('symbol')):
            props={p.arg():p.arg(2,'') for p in symbol.all('property')}
            components.append({'id':f'schematic-part-{i+1}','label':props.get('Reference','?'),'value':props.get('Value',''),'model':'schematic-symbol','terminals':[]})
        return components,['Only root-sheet symbols are available. Native netlist export is unavailable; wire connectivity and subsheet components cannot be established.']
    return [],['No readable native circuit source was found for the selected root.']

def build_context(project,revision,source,artifacts,question='',finding_id=None,job_status=None):
    manifest=revision['manifest'];result=revision.get('result') or {};notes=[clipped(n.get('message'),350) for n in manifest.get('notices',[])[:8]]
    all_findings=result.get('findings',[])
    if finding_id and not any(f.get('id')==finding_id for f in all_findings):raise ValueError('The selected finding does not belong to this revision.')
    try:components,source_notes=circuit_components(source,artifacts,manifest);notes.extend(source_notes)
    except OSError:components=[];notes.append('Circuit capture is incomplete: saved native source files could not be read.')
    except (ValueError,ET.ParseError,DefusedXmlException) as error:components=[];notes.append('Circuit capture is incomplete: '+clipped(error,350))
    if len(components)>500:components=components[:500];notes.append('Component capture is limited to 500 components.')
    memberships=defaultdict(list)
    for component in components:
        for pin in component.get('terminals',[]):
            if pin.get('net') is not None:memberships[str(pin['net'])].append({'component_id':component['id'],'reference':component['label'],'pin':pin['name']})
    settings={};custom=''
    root=manifest.get('root')
    if root and not manifest.get('requires_selection'):
        for suffix in ['.kicad_pro','.kicad_dru']:
            relative=safe_path(root+suffix);path=source.joinpath(*relative.parts).resolve()
            if source.resolve() not in path.parents:raise ValueError('Invalid rules source path.')
            if not path.is_file():continue
            if suffix=='.kicad_pro':
                try:
                    raw=read_json(path) or {};design=raw.get('board',{}).get('design_settings',{})
                    settings={'board_rules':design.get('rules',{}),'rule_severities':design.get('rule_severities',{}),'erc_severities':raw.get('erc',{}).get('rule_severities',{})}
                except (ValueError,OSError):notes.append('Project rule settings could not be read.')
            else:
                if path.stat().st_size<=100000:custom=path.read_text(encoding='utf-8-sig')[:2500]
                else:notes.append('Custom rules are too large for assistant context; use the native report and configured rule profile.')
    geometry=result.get('geometry') or {};objects={o['id']:o for o in geometry.get('objects',[]) if o.get('id')}
    labels={c['label'] for c in components};q=question.casefold()
    mentioned={ref for ref in labels if re.search(r'(?<![\w])'+re.escape(ref.casefold())+r'(?![\w])',q)}
    def refs(f):
        found=set(f.get('references',[]))&labels
        found.update(objects[oid]['reference'] for oid in f.get('object_ids',[]) if oid in objects and objects[oid].get('reference') in labels)
        descriptions=' '.join(str(item.get('description','')) for item in f.get('objects',[]))
        found.update(ref for ref in labels if re.search(r'(?<![\w])'+re.escape(ref)+r'(?![\w])',descriptions))
        return sorted(found)
    ordered=sorted(all_findings,key=lambda f:(f.get('id')!=finding_id if finding_id else True,not bool(set(refs(f))&mentioned),priority(f)))
    finding_rows=[]
    for f in ordered[:24]:
        finding_rows.append({**{key:f.get(key) for key in ['id','title','rule','severity','source','classification','excluded','position','measured','required','net','layer','rule_source']},'evidence':clipped(f.get('evidence')),'suggestion':clipped(f.get('suggestion'),600),'component_references':refs(f),'object_ids':f.get('object_ids',[])[:12],'objects':[{'uuid':o.get('uuid'),'description':clipped(o.get('description'),300),'pos':o.get('pos')} for o in f.get('objects',[])[:6]],'automatic_repair':bool(f.get('repair'))})
    relevant=mentioned|{ref for f in finding_rows for ref in f['component_references']}
    component_rows=[]
    for c in sorted(components,key=lambda c:(c['label'] not in relevant,-len(c.get('terminals',[])),c['label']))[:80]:
        component_rows.append({**c,'terminals':c.get('terminals',[])[:64],'omitted_pins':max(0,len(c.get('terminals',[]))-64)})
    net_rows=[{'name':name,'pins':pins[:40],'omitted_pins':max(0,len(pins)-40)} for name,pins in sorted(memberships.items(),key=lambda item:(not any(p['reference'] in relevant for p in item[1]),item[0]))][:80]
    reports=[]
    for filename in ['drc.json','erc.json','fabrication-drc.json']:
        try:raw=read_json(artifacts/filename)
        except (OSError,ValueError):notes.append(filename+' was not included in raw context.');continue
        if not isinstance(raw,dict):continue
        entries=[]
        for key in ['violations','unconnected_items','schematic_parity']:
            for entry in raw.get(key,[])[:4]:
                entries.append({'type':entry.get('type'),'severity':entry.get('severity'),'description':clipped(entry.get('description'),600),'items':[{'uuid':item.get('uuid'),'description':clipped(item.get('description'),250),'pos':item.get('pos')} for item in entry.get('items',[])[:4]]})
        reports.append({'file':filename,'entries':entries})
    source_hash=fingerprint(source)
    matches=result.get('project_hash')==source_hash if result.get('project_hash') else None
    if matches is False:notes.append('Current saved files do not match the retained check report. Rerun checks; do not treat old findings as verification of the changed source.')
    counts={'components':len(components),'pins':sum(len(c.get('terminals',[])) for c in components),'nets':len(memberships),'open_pins':sum(p.get('net') is None for c in components for p in c.get('terminals',[])),'findings':len(all_findings)}
    snapshot={'project_id':project['id'],'revision_id':revision['id'],'source_hash':source_hash,'rules_hash':result.get('rules_fingerprint'),'engine':result.get('engine_version'),'finished_at':result.get('finished_at'),'findings':[{k:f.get(k) for k in ['id','severity','excluded','evidence_fingerprint','evidence']} for f in all_findings]}
    report_count=len(reports)
    context={'version':CONTEXT_VERSION,'project':{'id':project['id'],'name':project['name'],'revision_id':revision['id'],'source_hash':source_hash,'analysis_matches_source':matches,'analysis_status':job_status or result.get('status','not_run'),'engine':result.get('engine_version'),'rules_hash':result.get('rules_fingerprint')},'counts':counts,'components':component_rows,'nets':net_rows,'findings':finding_rows,'rules':{'profile':manifest.get('rule_profile') or (result.get('provenance') or {}).get('rule_profile'),'settings':settings,'custom_rule_text':custom},'checks':result.get('checks',[]),'coverage':result.get('coverage',[]),'native_reports':reports,'notes':notes,'snapshot_hash':digest(snapshot)}
    # Keep context affordable for a rate-limited provider; omit lower-priority data explicitly.
    def size():return len(json.dumps(context,ensure_ascii=False,default=str))
    for key,minimum in [('native_reports',0),('findings',6),('nets',3),('components',6),('findings',1),('nets',0),('components',1)]:
        while size()>MAX_CONTEXT_CHARS and len(context[key])>minimum:context[key].pop()
    if size()>MAX_CONTEXT_CHARS:context['rules']['custom_rule_text']='';context['rules']['settings']={};notes.append('Detailed rule settings were omitted to stay within the request budget.')
    context['omitted']={'components':max(0,counts['components']-len(context['components'])),'nets':max(0,counts['nets']-len(context['nets'])),'findings':max(0,counts['findings']-len(context['findings'])),'component_pins':sum(c.get('omitted_pins',0) for c in context['components']),'native_reports':report_count-len(context['native_reports'])}
    context['context_hash']=digest(context)
    if size()>MAX_CONTEXT_CHARS+1000:raise ValueError('The evidence cannot fit the assistant context budget. Select a more focused circuit or reduce oversized source labels.')
    return context

def evidence_index(context):
    evidence={}
    def add(key,kind,summary,data):evidence[key]={'id':key,'kind':kind,'summary':summary,'data':data}
    add('circuit:summary','circuit','Saved circuit and check scope',{'project':context['project'],'counts':context['counts'],'notes':context['notes'],'omitted':context['omitted']})
    add('rules:project','rules','Actual project rules and selected profile',context['rules'])
    add('checks:coverage','coverage','Recorded KiCad check coverage',{'checks':context['checks'],'coverage':context['coverage']})
    for f in context['findings']:add('finding:'+f['id'],'finding',f['title'] or f['rule'],f)
    for c in context['components']:add('component:'+c['id'],'component',c['label']+' · '+c.get('value',''),c)
    for i,net in enumerate(context['nets']):add('net:'+str(i+1),'net',net['name'],net)
    for report in context['native_reports']:add('report:'+report['file'],'report','Retained KiCad report · '+report['file'],report)
    return evidence
