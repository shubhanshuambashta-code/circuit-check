import { platformOf, platformLabel } from './platforms.js';
import { BOARD_TYPES } from './wokwi.js';
export const SUPPORTED_MODELS = /^(resistor|led2?|led_(?:red|green|blue|yellow|orange|white)|battery9v|aabattery[1-4]?|coincell|capacitor|capacitor_polarized|dc_motor|dc_motor_dfrobot)$/i;

import { DEFAULT_PROFILE, RULES, validateProfile, findingRule } from './profiles.js';

export function analyze(snapshot, inputProfile = DEFAULT_PROFILE) {
  const profile = validateProfile(inputProfile);
  if (!snapshot || snapshot.error || snapshot.schema !== 1 || !Array.isArray(snapshot.components)) return { findings: [], supported: 0, limitations: ['Live circuit data is unavailable.'] };
  const site=platformLabel(snapshot),wokwi=platformOf(snapshot)==='wokwi';
  const findings = [];
  const components = snapshot.components;
  const add = (id, severity, title, evidence, fix, ids, pins = [], source = 'Connection check') => {
    const rule = findingRule(id);
    if (profile.checks[rule] === false) return;
    findings.push({ id, severity, title, evidence, fix, componentIds: ids, pins, source, rule,
      category: rule === 'supplyShort' ? 'confirmed_connection' : rule === 'native' ? 'simulator_report' : 'review_suggestion' });
  };
  const isResistor = c => /^resistor$/i.test(c.model);
  const isLed = c => /^led2?$|^led_(red|green|blue|yellow|orange|white)$/i.test(c.model);
  const isBattery = c => /^battery9v$|^aabattery[1-4]?$|^coincell$/i.test(c.model);
  const connected = (a, b) => a?.net != null && a.net === b?.net;
  const pins = (c, pattern) => c.terminals.filter(p => pattern.test(p.name));
  // Recognize output-capable pin names, never their live state or pinMode.
  const gpio = (c, p) => {
    const model=c.model.toLowerCase(), name=p.name.toUpperCase();
    if (/^arduinouno(?:rev3)?$/.test(model) || /^wokwi-arduino-(uno|nano|mega)$/.test(model)) {
      const digital=/^D?(\d{1,2})$/.exec(name), analog=/^A(\d{1,2})$/.exec(name), mega=model==='wokwi-arduino-mega';
      return digital ? Number(digital[1]) <= (mega?53:13) : !!analog && Number(analog[1]) <= (mega?15:5);
    }
    if (/esp32/.test(model) && BOARD_TYPES.has(c.model)) {
      const number=/^(?:D|GPIO|IO)?(\d{1,2})$/.exec(name);
      return !!number && [0,1,2,3,4,5,12,13,14,15,16,17,18,19,21,22,23,25,26,27,32,33].includes(Number(number[1]));
    }
    return BOARD_TYPES.has(c.model) && /pico/.test(model) && /^GP(?:[0-9]|1[0-9]|2[0-8])$/.test(name);
  };
  const sources = [];
  for (const c of components) {
    // Native errors are taken verbatim from the current simulator, never inferred.
    // Ignore retained native flags when simulation is stopped.
    if (platformOf(snapshot)==='tinkercad' && snapshot.simulation !== 'stopped') for (const n of c.native || []) {
      add(`native-${c.id}-${n.kind}`, n.kind === 'breakdown' ? 'error' : 'warning',
        `${c.label}: ${n.kind === 'breakdown' ? 'simulation fault' : 'simulation warning'}`,
        n.reason || site+' flagged this component without an explanation.',
        /current|maximum|exceed|mA/i.test(n.reason) ? 'Check the highlighted component’s supply and current-limiting parts. Reduce the load or correct its wiring, then restart the simulation.' :
          /voltage|revers|polarity/i.test(n.reason) ? 'Check the component’s + and − pins and supply voltage, then restart the simulation.' :
          'Locate this component, review '+site+'’s message and correct its connections or settings. Restart the simulation to confirm.', [c.id], [], site+' simulator');
    }
    if(c.model==='dc_source')sources.push({c,positives:pins(c,/^\+$/),negatives:pins(c,/^-$/)});
    if (isBattery(c)) sources.push({ c, positives: pins(c, /^\+$/), negatives: pins(c, /^-$/) });
    if (/^arduinouno(?:rev3)?$/i.test(c.model) || BOARD_TYPES.has(c.model)) sources.push({ c, positives: pins(c, /^(5V|3V|3V3|3\.3V|VIN|VBUS|VSYS)$/i), negatives: pins(c, /^GND(?:[.\d_-].*)?$/i) });
    if (SUPPORTED_MODELS.test(c.model) && c.terminals.length === 2) {
      const [a, b] = c.terminals;
      if (connected(a, b) && !isBattery(c)) add(`bypassed-${c.id}`, 'warning', `${c.label}: both legs share one net`,
        `${a.name} and ${b.name} are both on ${a.net}. There is no voltage difference across this component.`,
        'Move one leg or its wire to the intended separate net. On a breadboard, holes in the same connected strip share a net.', [c.id], [a.name, b.name]);
      const open = c.terminals.filter(p => !p.net);
      if (open.length) add(`open-${c.id}`, 'warning', `${c.label}: ${open.length === 2 ? 'component is unconnected' : 'open connection'}`,
        `${open.map(p => p.name).join(', ')} ${open.length === 1 ? 'has' : 'have'} no assigned electrical net. An unfinished design can intentionally contain open connections.`,
        'Connect the named pin to its intended net. Check that the wire ends on a terminal or the correct breadboard strip.', [c.id], open.map(p => p.name));
    }
    if (isResistor(c) && c.resistance !== null && c.resistance <= 0) add(`resistance-${c.id}`, 'warning', `${c.label}: zero or negative resistance`,
      `Resistance is ${c.resistance} Ω. A zero-ohm link provides no current limiting.`,
      'If this resistor should limit current, set a positive value appropriate to the supply and load.', [c.id]);
  }
  for (const source of sources) for (const pos of source.positives) for (const neg of source.negatives) {
    if (connected(pos, neg)) add(`short-${source.c.id}-${pos.name}-${neg.name}`, 'error', `${source.c.label}: supply is shorted`,
      `${source.c.label}.${pos.name} and ${source.c.label}.${neg.name} are connected to ${pos.net} without a component between them.`,
      'Remove the wire or breadboard connection joining the supply and return. Put the intended load between separate supply and return nets.', [source.c.id], [pos.name, neg.name]);
  }
  // Prove a simple series path instead of guessing from wire colors or proximity.
  // A branch, unsupported part, nested module or incomplete path stops inference.
  const ignored = c => /breadboard|annotation/i.test(c.model + ' ' + c.typeName);
  for (const source of sources) {
    source.gpios=source.c.terminals.filter(p=>gpio(source.c,p));
    // A board's auxiliary supply may differ from its GPIO logic voltage.
    const fiveVolt=/^arduinouno(?:rev3)?$|^wokwi-arduino-/.test(source.c.model.toLowerCase());
    source.logicPositives=source.positives.filter(p=>(fiveVolt?/^5V$/i:/^(3V|3V3|3\.3V)$/i).test(p.name));
  }
  const role = (source, terminal) => source.gpios.includes(terminal)?'gpio':source.positives.includes(terminal)?'positive':'negative';
  const members = new Map();
  for (const c of components.filter(c => !ignored(c))) for (const p of c.terminals) {
    if (!p.net) continue;
    if (!members.has(p.net)) members.set(p.net, []);
    members.get(p.net).push({ c, p });
  }
  const trace = (start, origin) => {
    let current = start, previous = origin;
    const resistors = [], seen = new Set([origin.id]);
    for (let i = 0; i < 100; i++) {
      const others = (members.get(current) || []).filter(m => m.c.id !== previous.id);
      // A known supply pin conclusively ends this side of the path, even when
      // other loads share that rail. Branches between the LED and that rail
      // still halt inference, as do multiple recognized supply endpoints.
      const allEndpoints = others.map(({c,p}) => ({source:sources.find(s=>s.c.id===c.id&&[...s.positives,...s.negatives,...s.gpios].includes(p)),terminal:p})).filter(e=>e.source);
      // Multiple GND pins on one board and net describe the same return.
      const endpoints=[...new Map(allEndpoints.map(e=>[e.source.c.id+':'+role(e.source,e.terminal)+(role(e.source,e.terminal)==='gpio'?':'+e.terminal.name:''),e])).values()];
      if(endpoints.length===1)return{...endpoints[0],resistors};
      if(endpoints.length>1)return null;
      if (others.length !== 1) return null;
      const { c, p } = others[0];
      const endpoint = sources.find(s => s.c.id === c.id && [...s.positives, ...s.negatives].some(t => t === p));
      if (endpoint) return { source: endpoint, terminal: p, resistors };
      if (seen.has(c.id) || c.nested || !isResistor(c) || c.terminals.length !== 2 || c.resistance === null || c.resistance < 0) return null;
      seen.add(c.id); resistors.push(c);
      const next = c.terminals.find(t => t !== p);
      if (!next?.net || next.net === current) return null;
      previous = c; current = next.net;
    }
    return null;
  };
  let ledPaths = 0;
  for (const led of components.filter(isLed).filter(()=>snapshot.topologyComplete!==false)) {
    const anode = pins(led, /^(anode|a)$/i)[0], cathode = pins(led, /^(cathode|c|k)$/i)[0];
    if (!anode?.net || !cathode?.net || anode.net === cathode.net) continue;
    // A direct connection across a known supply is conclusive even when other
    // loads share the rails. A resistor in a parallel branch cannot limit it.
    let direct = null;
    for (const source of sources) for (const pos of source.positives) for (const neg of source.negatives) {
      if (connected(anode, pos) && connected(cathode, neg)) direct = { source, a: pos, k: neg };
      if (connected(anode, neg) && connected(cathode, pos)) direct = { source, a: neg, k: pos };
    }
    const a = direct ? { source: direct.source, terminal: direct.a, resistors: [] } : trace(anode.net, led);
    const k = direct ? { source: direct.source, terminal: direct.k, resistors: [] } : trace(cathode.net, led);
    if (!a || !k || a.source.c.id !== k.source.c.id) continue;
    const ar=role(a.source,a.terminal), kr=role(k.source,k.terminal);
    const gpioPath=ar==='gpio'||kr==='gpio';
    let reversed;
    if (!gpioPath) {
      if(ar===kr)continue;
      reversed=ar==='negative';
    } else {
      if(ar===kr)continue; // Two GPIOs can drive either direction in firmware.
      const fixed=ar==='gpio'?k:a, fixedRole=ar==='gpio'?kr:ar;
      if(fixedRole==='positive'&&!fixed.source.logicPositives.includes(fixed.terminal))continue;
      reversed=ar==='negative'||kr==='positive';
    }
    ledPaths++;
    if (reversed) add(`reversed-${led.id}`, 'warning', `${led.label}: LED polarity is reversed${gpioPath?' for GPIO drive':''}`,
      `${led.label}.${anode.name} leads to ${a.source.c.label}.${a.terminal.name}; ${led.label}.${cathode.name} leads to ${k.source.c.label}.${k.terminal.name} through a simple resistor-only path.${gpioPath?' With an ordinary GPIO logic output, this orientation cannot forward-drive the LED against the connected rail. GPIO state and firmware are not read.':''}`,
      'For forward operation, connect the anode toward the positive supply or sourcing GPIO and the cathode toward ground or a sinking GPIO, keeping the resistor in series. A resistor may go on either side of the LED.', [led.id, a.source.c.id], [anode.name, cathode.name]);
    const resistance = [...a.resistors, ...k.resistors].reduce((total, r) => total + r.resistance, 0);
    if (resistance === 0) add(`no-resistor-${led.id}`, 'warning', `${led.label}: no series current-limiting resistance`,
      `The simple path from ${a.source.c.label}.${a.terminal.name} through ${led.label} to ${k.source.c.label}.${k.terminal.name} contains ${resistance} Ω of external resistance.`,
      'Add a suitable series resistor. Choose its value from the supply voltage, LED forward voltage and target current, then run the project simulation.', [led.id, a.source.c.id]);
    if (profile.minLedResistance !== null && resistance < profile.minLedResistance) add(`profile-led-${led.id}`, 'warning', `${led.label}: below the project’s LED resistance minimum`,
      `This proven series path contains ${resistance} Ω. Profile “${profile.name}” specifies at least ${profile.minLedResistance} Ω. Rule source: ${profile.source || 'User supplied; no source recorded'}.`,
      'Review the project-specific requirement and increase series resistance if applicable. This threshold is a custom review rule, not an inferred component rating.',
      [led.id, ...a.resistors.map(c => c.id), ...k.resistors.map(c => c.id)], [], 'Project rule profile');
  }
  const supported = components.filter(c => SUPPORTED_MODELS.test(c.model) || /^arduinouno(?:rev3)?$/i.test(c.model) || BOARD_TYPES.has(c.model)).length;
  const importedPlatform=!['wokwi','tinkercad'].includes(platformOf(snapshot));
  const limitations = [...(snapshot.adapterNotices||[]),wokwi ? 'Wokwi coverage: explicit wires and recognized board ground aliases only. Breadboard strips, junctions and internal switch connections are not merged. Paths involving them require manual review.' : 'Tinkercad coverage uses captured electrical nets, breadboard strip aliases and current component simulator flags when available.','Rule checks cover supported simple components and supply shorts. LED polarity/resistor checks require an unbranched path between recognized supply or ordinary GPIO endpoints on one source/board.',
    'Recognized output-capable GPIO-to-ground and logic-supply-to-GPIO LED paths are checked structurally. GPIO states and firmware are not read. GPIO-to-GPIO and auxiliary-supply paths require manual review. Unused pins, complex branches, current budgets and general voltage ratings are not checked.',
    wokwi ? 'Wokwi simulator diagnostics are not read. Run the project in Wokwi to verify its behavior. GPIO states and paths through unknown internal connections are not inferred.' : snapshot.simulation === 'stopped' ? 'Start Simulation in Tinkercad to read its current component warnings and breakdown messages.' : 'Simulation findings reproduce Tinkercad’s current component flags.'];
  if (components.some(c => c.nested)) limitations.push('Nested modules are not recursively analyzed.');
  const simple = components.filter(c => SUPPORTED_MODELS.test(c.model) && c.terminals.length === 2).length;
  const resistorCount = components.filter(isResistor).length, ledCount = components.filter(isLed).length;
  const counts = { native: platformOf(snapshot)!=='tinkercad' ? 0 : components.filter(c => c.nativeSupported || c.native?.length).length, supplyShort: sources.length,
    openPins: simple, bypass: simple, resistance: components.filter(c => isResistor(c) && c.resistance !== null).length,
    ledPolarity: ledPaths, ledResistance: ledPaths, ledMinimum: ledPaths };
  const coverage = RULES.map(([id, label]) => ({ id, label, evaluated: counts[id], findings: findings.filter(f => f.rule === id).length,
    status: !profile.checks[id] ? 'disabled' : id === 'native' && (platformOf(snapshot)!=='tinkercad' || snapshot.simulation === 'stopped' || counts.native === 0) ? 'not_checked' :
      id === 'ledMinimum' && profile.minLedResistance === null ? 'not_configured' : !counts[id] ? (id.startsWith('led') && ledCount > 0 ? 'partial' : id === 'resistance' && resistorCount > 0 ? 'not_checked' : 'not_applicable') :
        (id.startsWith('led') && ledPaths < ledCount) || (id === 'resistance' && counts[id] < resistorCount) ? 'partial' : 'evaluated' }));
  if (wokwi && components.some(c=>/breadboard|junction|pushbutton/.test(c.model))) coverage.push({id:'internalConnections',label:'Breadboard, junction and switch internal connections',status:'partial',evaluated:0,findings:0});
  if(snapshot.topologyComplete===false)coverage.push({id:'sourceCoverage',label:'Native import interpretation',status:'partial',evaluated:0,findings:0});
  coverage.push(...[['pcb', 'PCB clearance, track widths and fabrication'], ['firmware', 'Firmware correctness and timing'], ['ratings', 'General voltage ratings and current budget']].map(([id, label]) => ({id, label, status: 'not_checked', evaluated: 0, findings: 0})));
  if(importedPlatform){limitations.splice((snapshot.adapterNotices||[]).length,1,'Native import checks use only parsed connections. Internal simulation, model definitions and firmware are not evaluated.');limitations[limitations.length-1]='Verify the reviewed circuit in its original simulator. Simulator diagnostics are not read for this platform.';}
  return { findings: findings.sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1)), supported, ledPaths, limitations, coverage, profile };
}
