export const RULES = [
  ['native', 'Tinkercad simulator flags (Wokwi: not read)'], ['supplyShort', 'Supply-to-ground shorts'],
  ['openPins', 'Open component connections'], ['bypass', 'Components on one net'],
  ['resistance', 'Zero or negative resistors'], ['ledPolarity', 'LED polarity'],
  ['ledResistance', 'LED series resistance'], ['ledMinimum', 'Custom LED resistance minimum']
];
export const DEFAULT_PROFILE = { name: 'Standard wiring review', version: '1', source: 'Circuit Check supported connection rules',
  checks: Object.fromEntries(RULES.map(([key]) => [key, true])), minLedResistance: null };
export function validateProfile(input = DEFAULT_PROFILE) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('A profile must be a JSON object.');
  const allowed = ['name', 'version', 'source', 'checks', 'minLedResistance'];
  if (Object.keys(input).some(k => !allowed.includes(k))) throw Error('Unknown profile field. Use a Circuit Check electrical profile, not a PCB fabrication profile.');
  const profile = {};
  for (const key of ['name', 'version', 'source']) {
    const value = input[key] ?? DEFAULT_PROFILE[key];
    if (typeof value !== 'string' || value.length > 1200) throw Error('Invalid profile ' + key + '.');
    profile[key] = value;
  }
  if (!profile.name.trim()) throw Error('Give the rule profile a name.');
  const checks = input.checks ?? {};
  if (!checks || typeof checks !== 'object' || Array.isArray(checks) || Object.keys(checks).some(k => !RULES.some(([id]) => id === k))) throw Error('Unsupported check in rule profile.');
  profile.checks = {};
  for (const [key] of RULES) {
    if (checks[key] !== undefined && typeof checks[key] !== 'boolean') throw Error('Check switches must be true or false.');
    profile.checks[key] = checks[key] ?? true;
  }
  const minimum = input.minLedResistance ?? null;
  if (minimum !== null && (typeof minimum !== 'number' || !Number.isFinite(minimum) || minimum <= 0 || minimum > 1e9)) throw Error('The LED resistance minimum must be a positive number up to 1,000,000,000 ohms, or null.');
  profile.minLedResistance = minimum;
  return profile;
}
export function findingRule(id) {
  if (id.startsWith('native-')) return 'native';
  if (id.startsWith('short-')) return 'supplyShort';
  if (id.startsWith('open-')) return 'openPins';
  if (id.startsWith('bypassed-')) return 'bypass';
  if (id.startsWith('resistance-')) return 'resistance';
  if (id.startsWith('reversed-')) return 'ledPolarity';
  if (id.startsWith('no-resistor-')) return 'ledResistance';
  if (id.startsWith('profile-led-')) return 'ledMinimum';
  return 'unknown';
}
