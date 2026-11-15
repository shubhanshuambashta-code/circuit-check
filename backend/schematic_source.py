"""Read saved PCB pin/net assignments independently of rendering UUIDs or DRC.

The generated identities belong only to this reconstruction, never to board
object highlighting or native engineering evidence. Source files stay untouched.
"""
from .sexpr import parse

class SourceConnectivityUnavailable(ValueError):
    pass


def capture_pcb(text, title='Current circuit', source_file=''):
    if len(text) > 25 * 1024 * 1024:
        raise ValueError('The saved PCB exceeds the 25 MB schematic-source limit.')
    board = parse(text)
    if board.tag != 'kicad_pcb':
        raise ValueError('The saved source is not a KiCad PCB.')
    declared = {}
    for node in board.all('net'):
        code, name = node.arg(), node.arg(2, '')
        if not code or not code.isdigit():
            raise ValueError('The PCB has an unsupported net declaration.')
        if code in declared and declared[code] != name:
            raise ValueError('The PCB has conflicting net declarations.')
        declared[code] = name
    footprints = board.all('footprint') + board.all('module')
    if len(footprints) > 500:
        raise ValueError('Schematic limit: 500 components.')
    components, total_pads, skipped, unnamed = [], 0, 0, set()
    for index, footprint in enumerate(footprints):
        properties = {(n.arg() or '').lower(): n.arg(2, '') for n in footprint.all('property')}
        legacy = {(n.arg() or '').lower(): n.arg(2, '') for n in footprint.all('fp_text')}
        label = properties.get('reference') or legacy.get('reference') or f'Footprint {index + 1}'
        value = properties.get('value') or legacy.get('value') or ''
        terminals = {}
        for pad in footprint.all('pad'):
            total_pads += 1
            if total_pads > 10000:
                raise ValueError('Schematic source limit: 10,000 physical pads.')
            name = pad.arg(1, '')
            if not name or pad.arg(2) == 'np_thru_hole':
                skipped += 1
                continue
            assignment = pad.get('net')
            net = None
            if assignment:
                code = assignment.arg()
                if not code or not code.isdigit():
                    raise ValueError(f'{label}.{name}: unsupported PCB net assignment.')
                if int(code) != 0:
                    net = assignment.arg(2) or declared.get(code) or f'PCB net {code}'
                    if not assignment.arg(2) and not declared.get(code):
                        unnamed.add(code)
            if name in terminals and terminals[name]['net'] != net:
                raise ValueError(f'{label} has conflicting net assignments for pad {name}.')
            terminals[name] = {'name': name, 'key': f'pad:{name}', 'net': net}
        if terminals:
            components.append({'id': f'pcb-source-part-{index+1}', 'label': label,
                               'model': 'pcb-component', 'value': value,
                               'terminals': list(terminals.values())})
    if not components:
        raise SourceConnectivityUnavailable('No numbered electrical pads were found in the saved PCB. A circuit cannot be reconstructed from outlines or pictures alone.')
    if sum(len(c['terminals']) for c in components) > 5000:
        raise ValueError('Schematic limit: 5,000 electrical pins.')
    notes = ['Read directly from the PCB already saved in this project; no new import or rerun is required.',
             'Pad numbers and net assignments are retained. Schematic symbol identity, pin roles and internal circuitry are not inferred.',
             'Drawing identities are local reconstruction labels, not native PCB UUIDs. This does not change the original board or engineering findings.',
             'PCB net membership expresses intended connectivity, not proof that copper has been routed.']
    if not any(t['net'] is not None for c in components for t in c['terminals']):
        notes.append('This PCB contains no assigned electrical nets. The schematic shows its components and open pins; missing wiring and internal Arduino circuitry cannot be recovered from this file.')
    if skipped:
        notes.append(f'{skipped} mechanical or unnumbered pads were omitted.')
    if unnamed:
        notes.append('Some stored net codes have no names; their explicit numeric membership is retained without inferring a signal name.')
    return {'schema': 1, 'title': title, 'source': 'Saved PCB source' + (f' · {source_file}' if source_file else ''),
            'components': components, 'adapterNotes': notes}
