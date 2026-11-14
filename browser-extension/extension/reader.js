/* This function is serialized into the page's MAIN world. Keep it self-contained.
 * Read-only adapter for Tinkercad's Circuits 1q6jt6f editor model, inspected 2026-11-03.
 * Reading performs no changes. A separate explicit set-resistance request supports
 * an approved, guarded property edit through Tinkercad's existing undo recorder. */
export function readTinkercad(request = null) {
  if (!/^https:\/\/(?:(?:www|editor)\.)?tinkercad\.com\//.test(location.href)) return null;
  const gui = [window.gui, window.circuit_editor?.circuitEditor, window.circuit_editor].find(candidate => candidate?.root?.circuit?.devices?.forEach);
  const circuit = gui?.root?.circuit;
  if (!circuit?.devices?.forEach || typeof circuit.circuit_type !== 'function' || circuit.circuit_type() !== 'breadboard') return null;
  const str = (v, limit = 200) => v === null || v === undefined ? '' : String(v).slice(0, limit);
  // Tinkercad HashMap invokes (key, value); its HashSet invokes (value).
  const values = collection => {
    const out = [];
    collection?.forEach?.((key, value) => {
      if (out.length >= 12000) throw new Error('Circuit is larger than this preview supports.');
      out.push(value === undefined ? key : value);
    });
    return out;
  };
  const netIds = new Map();
  const netId = net => {
    if (!net) return null;
    const highest = typeof net.getHighestNet === 'function' ? net.getHighestNet() : net;
    if (!highest) throw new Error('A net could not be resolved.');
    if (!netIds.has(highest)) netIds.set(highest, 'net-' + (netIds.size + 1));
    return netIds.get(highest);
  };
  try {
    const devices = values(circuit.devices);
    if (devices.length > 500) throw new Error('This preview supports up to 500 components.');
    let incomplete = 0, terminalCount = 0;
    const components = devices.map((device, index) => {
      const description = device.getDescription?.()?.device;
      const bb = device.breadboard?.();
      if (!description || !device.terminals?.forEach) throw new Error('Unsupported component data format.');
      const model = str(description.simulation_model || bb?.simulation_model_name);
      const id = str(device.id ?? device.local_id ?? device.versions_id ?? ('component-' + index));
      const base = str(description.base);
      const name = str(device.name?.());
      const label = base ? (name.startsWith(base) ? name : base + name) : str(description.name) + (name ? ' ' + name : '');
      const terminals = values(device.terminals).map((terminal, pinIndex) => {
        if (++terminalCount > 30000) throw new Error('This preview supports up to 30,000 terminals.');
        const schematic = terminal.getSchematicName?.();
        const breadboard = terminal.getBreadboardDescription?.();
        const name = str(schematic || breadboard?.name || terminal.getKey?.() || ('pin-' + pinIndex));
        if (typeof terminal.net !== 'function') throw new Error('Unsupported terminal data format.');
        return { name, key: str(terminal.getKey?.()), net: netId(terminal.net()), hasBreadboardPin: !!breadboard };
      });
      const properties = values(device.properties).filter(p => /^(resistance|voltage|color|count|capacitance)$/i.test(p.name)).map(p => ({ name: str(p.name), value: str(p.value), prefix: str(p.prefix), unit: str(p.unit) }));
      const resistance = device.getPropertyValue?.('resistance');
      const dynamic = bb?.dynamicModel;
      const coordinate = typeof bb?.pos === 'function' ? bb.pos() : null;
      const x = coordinate?.getX?.() ?? coordinate?.x, y = coordinate?.getY?.() ?? coordinate?.y;
      const angle = typeof bb?.angle === 'function' ? bb.angle() : 0;
      const position = [x, y, angle].every(Number.isFinite) ? { x, y, angle } : null;
      const native = [];
      for (const key of ['breakdown', 'warning']) {
        const value = typeof dynamic?.[key] === 'function' ? dynamic[key]() : null;
        if (value && value[key] === true) native.push({ kind: key, reason: str(value.reason, 2000) });
      }
      if (!model) incomplete++;
      return { id, label: str(label || description.name || id), typeName: str(description.name), model, terminals, properties,
        resistance: Number.isFinite(resistance) ? resistance : null, native, nativeSupported: typeof dynamic?.breakdown === 'function' || typeof dynamic?.warning === 'function', nested: !!device.module?.(), position };
    });
    const state = gui.root.editorModel?.breadboard?.()?.simulatorState?.();
    const snapshot = { schema: 1, title: str(gui.app?.meta_data?.name || document.title),
      designId: str(gui.app?.meta_data?.docid || location.pathname.split('/')[2]),
      source: 'Tinkercad live editor', components, netCount: netIds.size,
      wireCount: values(circuit.wires).length, simulation: state === 1 ? 'running' : state === 2 ? 'paused' : 'stopped',
      editable: (gui.mode === 1 || gui.app?.mode === 1) && typeof gui.root.rec === 'function' && typeof gui.root.stopRec === 'function',
      incomplete, capturedAt: new Date().toISOString() };
    if (request?.type === 'set-resistance') {
      const fail = error => ({ ...snapshot, edit: { applied: false, error } });
      if (!snapshot.editable) return fail('This is a read-only viewer. Open your own circuit in edit mode.');
      if (snapshot.simulation !== 'stopped') return fail('Stop Tinkercad Simulation before applying a property change.');
      if (!request.expected || request.expected.imported || request.expected.designId !== snapshot.designId) return fail('The expected live design is unavailable or has changed.');
      const encode = value => Array.isArray(value) ? '['+value.map(encode).join(',')+']' : value && typeof value === 'object' ? '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+encode(value[key])).join(',')+'}' : JSON.stringify(value ?? null);
      const signature = s => encode({ designId: s.designId, wireCount: s.wireCount,
        components: s.components.map(c => ({ id: c.id, label: c.label, model: c.model, resistance: c.resistance, nested: !!c.nested, position: c.position ?? null,
          properties: [...(c.properties || [])].sort((a,b)=>encode(a).localeCompare(encode(b))),
          terminals: c.terminals.map(p=>({name:p.name,net:p.net})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))) })).sort((a,b)=>a.id.localeCompare(b.id)) });
      if (signature(request.expected) !== signature(snapshot)) return fail('The circuit changed after preview. Check it again and create a fresh preview.');
      if (typeof request.value !== 'number' || !Number.isFinite(request.value) || (request.restore === true ? request.value < 0 : request.value <= 0) || request.value > 1e9) return fail('Invalid resistance.');
      const component = snapshot.components.find(c=>c.id === request.componentId);
      const device = devices.find(d=>str(d.id ?? d.local_id ?? d.versions_id) === request.componentId);
      if (!component || component.model.toLowerCase() !== 'resistor' || component.resistance === null || typeof device?.setProperty !== 'function') return fail('This component does not support a resistor-value edit.');
      let recording = false;
      try {
        gui.root.rec(); recording = true;
        device.setProperty('resistance', null, request.value, 'none');
      } catch (error) {
        return fail('The editor rejected the change: ' + str(error.message || error));
      } finally { if (recording) gui.root.stopRec(); }
      const fresh = readTinkercad();
      const actual = fresh?.components?.find(c=>c.id === request.componentId)?.resistance;
      return { ...fresh, edit: { applied: actual === request.value, componentId: request.componentId, before: component.resistance, after: actual,
        error: actual === request.value ? '' : 'The changed value could not be verified. Inspect the resistor in Tinkercad before continuing.' } };
    }
    return snapshot;
  } catch (error) {
    return { schema: 1, error: str(error.message || error), source: 'Tinkercad live editor' };
  }
}

export function locateTinkercad(componentIds, expectedDesignId = null) {
  if (!/^https:\/\/(?:(?:www|editor)\.)?tinkercad\.com\//.test(location.href)) return { found: false };
  const gui = [window.gui, window.circuit_editor?.circuitEditor, window.circuit_editor].find(candidate => candidate?.root?.circuit?.devices?.forEach);
  const circuit = gui?.root?.circuit;
  if (!circuit?.devices?.forEach) return { found: false };
  if (expectedDesignId && String(gui.app?.meta_data?.docid || location.pathname.split('/')[2]) !== expectedDesignId) return {found:false,changed:true};
  const ids = new Set((Array.isArray(componentIds) ? componentIds : [componentIds]).filter(id=>typeof id === 'string').slice(0,60));
  const found = [];
  circuit.devices.forEach(device => {
    if (!ids.has(String(device.id ?? device.local_id ?? device.versions_id))) return;
    const bb = device.breadboard?.();
    const view = bb?.getView?.(gui.breadboardEditor);
    const group = view?.group?.[0] || view?.group;
    if (group?.getBoundingClientRect) found.push(group);
  });
  if (!found.length) return { found: false };
  document.querySelectorAll('[data-circuit-check-marker]').forEach(el => el.remove());
  let count = 0;
  for (const group of found) {
    const rect = group.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.right < 0 || rect.bottom < 0 || rect.left > innerWidth || rect.top > innerHeight) continue;
    const marker = document.createElement('div');
    marker.setAttribute('data-circuit-check-marker', '');
    marker.style.cssText = `position:fixed;pointer-events:none;z-index:2147483647;border:4px solid #be123c;border-radius:10px;box-sizing:border-box;background:#be123c14;left:${rect.x - 7}px;top:${rect.y - 7}px;width:${rect.width + 14}px;height:${rect.height + 14}px`;
    document.documentElement.append(marker); count++;
    setTimeout(() => marker.remove(), 3200);
  }
  return { found: count > 0, count, offscreen: count === 0 };
}
