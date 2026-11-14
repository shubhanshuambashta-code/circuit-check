# Circuit Check — Tinkercad + Wokwi — v0.5.1

One local Chromium extension for both simulators. The selected circuit tab determines the reader and repair workflow. The panel names the detected platform; saved evidence is separated by platform and project ID.

See [installation](INSTALL.md). Extract the ZIP, enable Developer mode, choose Load unpacked and select the folder containing the root manifest.

## Platform features

| Tool | Tinkercad | Wokwi |
| --- | --- | --- |
| Live capture | Actual components, electrical nets and exposed breadboard aliases | Current in-memory diagram.json; Monaco fallback |
| Live checking | About every 1.6 seconds while the panel is visible | About every 1.6 seconds while the panel is visible |
| Wiring checks | Supported supply shorts, open/bypassed parts, resistor values and simple LED paths | Basic resistors/LEDs and recognized board supply pins |
| Native simulator warnings | Current component flags while running/paused | Not read |
| Reviews, comparisons, notes, exceptions, profiles and reports | Included | Included |
| Visual repair workspace and SVG/PNG figures | Included | Included |
| Approved live resistor edits and restore | Guarded preview/Apply/reread workflow | Separate exported proposal |
| Native wiring export | Figure and connection guide | Reviewed diagram.json |
| Open/paste diagram.json | Not applicable | Included |

## Everyday use

Open a project and choose **Check circuit**. The header shows **Tinkercad** or **Wokwi**. Switching between live circuit tabs automatically selects the corresponding reader. An unrelated tab clears the live result. Saved/file reviews stay frozen until you choose **Check circuit** again.

Findings retain exact component IDs, pins/nets, evidence and suggested actions. **Circuit** inspects captured parts/connections. **Reviews** saves baselines, compares revisions and exports JSON/HTML reports or full library backups. **Rules** configures checks and an optional user-supplied LED resistance minimum. **Coverage** records evaluated, partial, disabled and unchecked rules. Accepted exceptions retain their findings and counts; changed evidence requires review.

Reviews, comments, repairs and drafts have separate `tinkercad:<id>` and `wokwi:<id>` identities. Identical IDs on both sites cannot mix history. Cross-platform comparisons and visual-draft substitution are rejected.

**Open visual workspace** opens in the currently selected browser tab. Use the browser Back button to return to the circuit. The captured draft is saved locally before navigation.

## Repair a circuit

**Tinkercad:** duplicate your design first if you want to retain a remote original. Stop Simulation, inspect a standard resistor and select **Preview resistor value**. Review the prediction, then **Apply approved change & recheck**. The adapter checks the current design signature and editor/simulation state, edits through the existing undo recorder, rereads the actual value and saves before/after reviews. **Preview corrections** supports approved batches of up to 20 existing resistor values; supply shorts block batch Apply. A batch stops on failure and reports completed changes; it is not atomic. **Reviews → Restore last Tinkercad resistor value** requires a matching current source. Imported repair history cannot authorize live restore. Restart simulation to verify behavior.

**Wokwi:** choose **Open visual workspace**, review/edit the proposal, then **Export Wokwi diagram.json**. Save a copy of the project in Wokwi and replace its diagram.json contents with the exported JSON. Run simulation and check again. Resistor previews and **Preview corrections** download candidates; they do not automatically write to Wokwi.

**Both:** the visual workspace retains captured parts, including unknown models. Reconnect/disconnect named pins, change resistor values, add/remove parts, or replace types with explicit pin mappings. **Generate repair diagram** covers proven simple LED paths and explicitly chosen resistor values. LED reversal requires the forward-operation choice; no universal resistance is guessed. Figure positions are separate from physical breadboard placement. Export SVG/PNG, draft JSON and connection guides. Wokwi additionally has native diagram export; its button is hidden for Tinkercad projects.

Wokwi native export preserves root metadata, custom attributes and original part positions. Unchanged nets retain wire colors/routes; changed nets use green automatically routed wires. New parts are placed to the right for adjustment. Export checks a normalization round trip and rejects split recognized MCU ground aliases.

## Supported scope

Tinkercad supports common resistors, two-pin LEDs, supported batteries, capacitors, DC motors and Uno supply pins. It uses captured electrical nets and exposed current simulator flags. Unknown or branched paths stop LED inference.

Wokwi recognizes supply-to-ground shorts on Uno, Nano, Mega, ESP32 DevKit v1 / DevKit C v4, Pico, Pico W, Pico 2 and Pico 2 W. Resistor/LED checks use their native pin names. Named supported board ground aliases are merged. An omitted resistor value uses the documented 1000-ohm default; unparsed expressions have incomplete coverage. Serial monitor endpoints are preserved.

Wokwi breadboard strips, junctions and switch internals have **partial coverage**: parts and explicit wires are retained, but internal connections are not merged. Firmware, GPIO states, arbitrary chips/modules, general ratings, current budgets, complex analog behavior and physical builds are not fully checked. Zero findings means none in the supported enabled checks. Wokwi simulator diagnostics are not read. Native KiCad/PCB features remain in the separate local CircuitCheck app at 127.0.0.1:8000.

## Storage, imports and permissions

Import JSON review/library backups from both earlier editions. Platform identity is retained or inferred from historical source/diagram metadata; findings and provenance are recomputed and imports are marked historical. Export older libraries before removing those extensions. This installation does not read another extension's private storage automatically.

Data stays in this browser profile. Export a library backup before uninstalling. Limits: 60 reviews, 500 notes/project, 8 MB workspace, 500 components and 30,000 terminals. Wokwi diagrams also have a 2 MB / 10,000 wire limit. Draft revision checks reject stale concurrent saves.

Permissions: activeTab, scripting, sidePanel, storage. Hosts: HTTPS tinkercad.com, www.tinkercad.com, editor.tinkercad.com and wokwi.com only. No server, API key, external AI, analytics or extension network uploads. Explanations are deterministic evidence guides. Readers do not collect cookies, credentials, sketches or unrelated files. Explicit Tinkercad Apply changes only reviewed resistor properties; exports create local files.

Editor interfaces may change. Failed/malformed captures clear the live result. Wokwi file/paste checking remains available independently of its live reader.

## Development and verification

Plain JavaScript modules; no build step or runtime packages. Run `npm test` with Node 18+. Keep both manifests consistent.

**96 automated tests pass.** A fresh isolated Edge installation verified site switching, separate histories for identical IDs, an approved Tinkercad resistor edit/reread on a controlled fixture, Wokwi visual repair/native export, platform-specific export controls and clearing stale live results. The same installation read a real public Tinkercad circuit and Wokwi's real new Arduino Uno editor. Public projects were read only; mutation tests used a controlled fixture. See [verification](docs/verification.md).

Independent extension; not affiliated with Autodesk or Wokwi.
