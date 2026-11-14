# Circuit Check Multi-platform — v0.6.4

**v0.6.4 retains plain-language finding explanations and removes the overall circuit score.**

**v0.6.2 adds LED polarity and series-resistance checks for recognized Arduino/ESP32/Pico GPIO paths.** Shared board ground aliases no longer suppress LED checks. A resistor may be on either side of the LED; parallel LEDs may share anodes. See [verification and deliberate-error examples](docs/led-gpio-fix-v0.6.2.md).

**v0.6.1 fixes Wokwi’s “Multiple project models found” connection failure.** It selects the live editor model over the saved React copy, reads unsaved wiring changes, and shows unavailable finding counts as “—” when reading fails. Verified on the reported ESP32 project with simulation running and with a deliberate unsaved resistor/LED disconnection. See [fix verification](docs/wokwi-reader-fix-v0.6.1.md).


One Chromium extension with a shared review library and visual workspace. Existing Tinkercad/Wokwi support remains. The six applications in the requested list now have supported circuit-data workflows; their integration depth differs.

## Compatibility

| Software | How to use Circuit Check | Verification and boundary |
| --- | --- | --- |
| Tinkercad | Open circuit → extension → Check circuit | Existing live reader, native warnings and guarded resistor edits retained |
| Wokwi | Open project → Check circuit, or open/paste diagram.json | Existing live reader and native proposal export retained |
| SimDuino | Open simduino.com → Check circuit; or import snapshot/diagram JSON | Official v0.14.4 frontend snapshot verified in controlled replay; public live initialization timed out |
| Other similar SimDuino sites | Select “Try compatible SimDuino / CircuitJS readers” and Check circuit after clicking the extension toolbar icon | Only sites exposing the same snapshot API work; compatible JSON can be imported. Arbitrary unrelated sites are not automatically supported |
| Falstad / CircuitJS | Open falstad.com/circuit or lushprojects.com/circuitjs → Check circuit; or import exported text/XML | Public live circuit read; basic legacy text and current XML formats supported |
| CircuitLab | Open its editor → Check circuit | Live geometry reader verified with a nonempty resistor circuit; limited explicit connections and resistor checks |
| SimulIDE | Save .sim1 or older .simu → choose SimulIDE under Import a simulator circuit → Open circuit file | XML item/connector parser tested, including an official .simu example; subcircuits and implicit supplies require review |
| Proteus | Export a flat SDF or SPICE netlist → choose Proteus → Open circuit file | Flat SDF and SPICE parser tested; binary .pdsprj/.dsn files are not read |
| LTspice | View → SPICE Netlist → copy/save text as .cir/.net/.sp → choose LTspice → import | Top-level SPICE parser tested; .asc symbol libraries are not resolved |

The desktop workflows run in Circuit Check in your browser. This package does not install a plug-in inside Proteus, SimulIDE or LTspice and does not monitor their open windows. Their exported circuit data can use the same findings, reviews, figures, pin editing and connection guides as the browser adapters.

## Installation and use

Extract **Circuit-Check-Multi-platform-v0.6.4.zip**. Open chrome://extensions or edge://extensions, enable Developer mode, choose Load unpacked and select the folder containing the root manifest. To update an installed copy, replace its files in the same folder, then Reload and refresh circuit tabs. Accept the added site permissions if requested. Keeping the same installed folder preserves its local library. The badge should read v0.6.4.

Click the extension icon for live review. For desktop files, use **Import a simulator circuit**, choose the software, name the project, and open/paste its exported file. Use the same project name for later revisions. You can also open **Extension options** from the browser's extension Details page to use the file-review page in a full tab.

**Open visual workspace** continues to open in the same selected browser tab. Browser Back returns to the circuit. Proposals are local drafts, not an automatically applied native design. Wokwi retains its native diagram.json export; other new adapters export figures, draft/review JSON and exact connection guides for manual application in the original tool. **Export source circuit** preserves the captured native text unchanged for backup/reimport; it is not an export of the edited proposal.

## Checks and coverage

The shared engine checks supported resistor values, open/bypassed two-terminal parts, proven supply shorts and supported simple LED paths. New DC source recognition uses explicitly fixed nonzero sources only. SPICE suffixes follow SPICE semantics (M is milli, MEG is mega). SimDuino uses its native ohms and A/K pin names. SimulIDE connector endpoints use component IDs and pin names. CircuitJS wires connect explicit endpoint coordinates; geometry is not inferred for unsupported complex elements. CircuitLab uses actual editor pins and wire endpoints, joins points lying on a wire, and keeps source polarity/diode roles unverified.

Unsupported directives, expressions, devices, internal connections and unknown pin geometry are reported in **Coverage**. Incomplete topology stops automatic LED-path inference. Source text and import notices survive reviews and visual drafts and contribute to source hashes. Zero findings is not whole-circuit verification. Firmware, arbitrary analog behavior, ratings, current budgets and desktop simulator diagnostics are not evaluated. SimulIDE .sim2 is not claimed. Complex SPICE subcircuits/includes are preserved as source text but not expanded. SDF can omit unused pins, so missing native pins are not invented. CircuitLab's adapter depends on its inspected editor build and may need updating if that interface changes.

No remote saves, external AI or uploads are used. Added host permissions are restricted to SimDuino, Falstad/Lushprojects and CircuitLab domains. Compatible-site probing is opt-in through the existing activeTab permission; it does not add access to all websites. Native imports never open referenced include files, firmware paths or external XML entities.

Limits remain 500 parts, 30,000 pins, a 2 MB native input and an 8 MB local library. Import failures clear the current result rather than leave a stale clean result. Save library backups before uninstalling. Platform namespaces separate histories, even when project IDs match.

See [verification and source references](docs/multiplatform-verification.md). See [the retained Tinkercad/Wokwi usage guide](docs/tinkercad-wokwi-guide-v0.5.1.md) for detailed instructions for those two adapters.


## Beginner explanations

Every selected finding includes plain-language meaning and possible consequences. These are conditional explanations, not simulated outcomes. Unknown rules are labelled as lacking an established consequence. Original technical evidence and check coverage are retained; no overall circuit score is calculated.

General explanation references: [KiCad DRC](https://docs.kicad.org/10.0/en/pcbnew/pcbnew.html#design-rules-checking), [Wokwi LED pins](https://docs.wokwi.com/parts/wokwi-led), [Arduino digital pins](https://github.com/arduino/docs-content/blob/main/content/learn/02.microcontrollers/01.digital-pins/digital-pins.md). These references do not verify an individual circuit.
