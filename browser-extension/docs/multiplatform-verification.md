# v0.6.0 verification — 14 November 2026

114 automated tests pass, including all earlier tests and 18 added importer/routing/evidence-persistence checks. Test cases cover SPICE suffixes, expressions/includes/subcircuits, SDF counts and pin conflicts, modern/legacy SimulIDE IDs, XML entity rejection, CircuitJS text/current XML, SimDuino snapshots/diagram form, CircuitLab geometry, source evidence persistence and exact host routing.

Browser integration: actual extension manifest loaded in isolated Edge; LTspice, Proteus, SimulIDE and Falstad import controls all loaded real-format circuit text without extension page errors. SimulIDE used the upstream basic_led.simu example. Public Falstad reader captured five parts. CircuitLab's public editor, using its downloaded official compiled build as a local response to avoid a slow asset transfer, loaded a resistor through its native editor JSON loader; the extension captured one real editor component. Its first empty editor capture was not counted as useful verification.

SimDuino's public site did not finish initialization within the browser timeout. A controlled replay of its downloaded official HTML, studio.js and app.js, with unrelated external assets/simulation services omitted, initialized its native getSnapshot() API and returned three components and three wires. The snapshot parser is unit tested. This establishes the API mapping, not universal live-host compatibility. Other similarly named sites have not been individually verified.

Desktop applications were not installed in this environment. Their file parsers and browser import workflows were tested; in-app plug-in installation, native saving and simulation behavior are not claimed. CircuitLab checks remain limited and no native modification is attempted. Same-tab visual navigation and original Tinkercad/Wokwi baseline verification are retained from v0.5.1.

Primary references inspected:

- [SimDuino format and pin documentation](https://simduino.com/docs.php); public app.js/studio.js v0.14.4.
- [CircuitJS JS API](https://github.com/pfalstad/circuitjs1/blob/master/war/doc/js-interface.html), current TS XML serializer and element source, plus legacy CircuitJS source.
- [SimulIDE official source and example circuits](https://github.com/SimulIDE/SimulIDE); basic_led.simu item/connector records.
- [Analog Devices LTspice syntax reference](https://github.com/analogdevicesinc/ltspice-reference/blob/main/ai_ref/SPICE-SYNTAX-REFERENCE.md).
- [Labcenter ISIS netlist format documentation](https://www.firstpr.com.au/temp/LabCenter/Proteus-Schematic-ISIS-7.10-help-converted-by-Atop-CHM-to-PDF.pdf); Labcenter-authored SDF/SPICE export sections.
- [CircuitLab export FAQ](https://www.circuitlab.com/docs/faq/); inspected public editor build 61dda3a489adba54f0742dc2ff9879d37ed27b62. The reader uses window.slm.c.S.elements, element toJSON() and actual pin coordinate getters; it does not invoke circuit net-assignment or save methods.

Research-only vendor JavaScript is not included in this release. Source parsers and adapters in the package are Circuit Check implementation code.

Final browser smoke check also verified source export is enabled for native captures and the imported project opens in the same tab, without exposing the Wokwi-only native export button.
