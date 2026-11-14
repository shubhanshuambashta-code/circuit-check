import {Download,PlugZap} from 'lucide-react';
import './extension-download.css';

const supported=[
 ['Tinkercad','Live circuit reader and supported wiring checks'],
 ['Wokwi','Live circuit reader, wiring checks and diagram.json proposal export'],
 ['SimDuino / compatible apps','Snapshot reader or compatible JSON import'],
 ['Falstad / CircuitJS','Live circuit reader or exported text / XML import'],
 ['CircuitLab','Limited live connection and resistor checks'],
 ['SimulIDE','Import a saved .sim1 or .simu circuit'],
 ['Proteus','Import an exported flat SDF or SPICE netlist'],
 ['LTspice','Import a SPICE .cir, .net or .sp netlist'],
];

export default function ExtensionDownload(){
 const downloadUrl=`${import.meta.env.BASE_URL}downloads/Circuit-Check-Multi-platform-v0.6.4.zip`;
 return <section className="cc-extension" aria-labelledby="extension-title">
  <div className="cc-extension-intro">
   <div className="cc-extension-copy"><p className="cc-extension-eyebrow"><PlugZap size={16} aria-hidden="true"/>CIRCUIT CHECK EXTENSION</p><h2 id="extension-title">Take Circuit Check into your simulator.</h2><p>Review circuits from Tinkercad, Wokwi, SimDuino, Falstad / CircuitJS, CircuitLab, SimulIDE, Proteus and LTspice in one visual workspace.</p></div>
   <div className="cc-extension-download"><a className="r2-primary" href={downloadUrl} download="Circuit-Check-Multi-platform-v0.6.4.zip"><Download size={17} aria-hidden="true"/>Download extension ZIP</a><span>v0.6.4 · Chrome &amp; Edge · 565 KB</span></div>
  </div>
  <details className="cc-extension-details"><summary>Supported software and installation</summary>
   <div className="cc-extension-body"><div><h3>Choose your workflow</h3><table><caption className="sr-only">Circuit Check extension compatibility</caption><thead><tr><th scope="col">Software</th><th scope="col">How it works</th></tr></thead><tbody>{supported.map(([name,mode])=><tr key={name}><th scope="row">{name}</th><td>{mode}</td></tr>)}</tbody></table><p className="cc-extension-note">Desktop tools use exported files in the extension; it does not install inside those applications. Other SimDuino sites need a compatible snapshot API or JSON format.</p></div>
   <div><h3>Install in three steps</h3><ol><li>Extract the ZIP into a permanent folder.</li><li>Open Chrome or Edge’s Extensions page, enable <strong>Developer mode</strong>, choose <strong>Load unpacked</strong> and select the folder containing <code>manifest.json</code>.</li><li>Refresh your simulator tab, open Circuit Check and choose <strong>Check circuit</strong>. For desktop tools, use <strong>Import a simulator circuit</strong>.</li></ol><p className="cc-extension-note">Updating? Replace files in the same installed folder, then reload the extension. The visual workspace opens in the same tab.</p><p className="cc-extension-note">Supported checks vary by simulator. CircuitLab supports limited connection and resistor checks. Run your simulator to verify firmware and complete circuit behavior.</p></div></div>
  </details>
 </section>;
}
