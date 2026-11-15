# CircuitCheck

Local KiCad engineering review with native checks, source evidence, linked board/schematic inspection, revision comparison, and an optional circuit assistant. The browser extension is a separate tool with simulator-specific limits.

## Install and diagnose

1. Install Python 3.11 or later and Node.js 24. Install KiCad 10.0.x for native designs. The local integration baseline is KiCad 10.0.7.
2. Extract the complete app package. Run **Setup CircuitCheck.cmd** once, then **Start CircuitCheck.cmd**. Node.js and npm dependencies are required for the local supplemental checker, including when using a prebuilt frontend.
3. Open [the local workspace](http://127.0.0.1:8000/). **Tools → Setup & diagnostics** checks Python, API, KiCad, worker heartbeat and storage independently. Failed checks have fixes and the diagnostic report is downloadable.
4. If Python or the API cannot start, run **Diagnose CircuitCheck.cmd**. This standalone PowerShell check does not need the Python API. Reports exclude credentials and circuit contents.

**Stop CircuitCheck.cmd** stops the background service. Readiness requires a live worker heartbeat; an installed KiCad executable alone does not establish readiness.

Configuration precedence is process environment, `.env`, local bootstrap `data/runtime.json`, then defaults. `CIRCUITCHECK_DATA` controls the database, projects, attempt artifacts, logs, temporary files and provider metadata. The bootstrap file contains local runtime paths and is excluded from releases. Direct API and worker entry points use the same resolver.

## Main review flow

**Upload → Analysis → Findings → Correction → Comparison** is the primary workflow. Preserve originals and upload a correction as revision B to compare results. The supported automatic repair is a selected straight-track width change: create a separate candidate, check it, review it, approve it, then recheck the applied revision. Other changes remain manual KiCad work.

The review queue provides Previous/Next issue, named browser-local filters, category/severity controls, and links between the selected issue, original engine evidence and its location. Search components and nets independently of findings. Select R1, U1 or GND and switch Board/Schematic to retain the selection. Native component anchors are selectable on the drawing too.

Native schematic net selection uses exported KiCad netlist membership to highlight connected symbol anchors. It does not infer native wire paths or symbol outlines. Board selection uses recorded component, pad and copper geometry. Without an original schematic, a reconstructed connection drawing uses available pad/pin assignments and labels its source, open pins and missing-data limits. Intended net membership does not prove copper routing or functional operation.

Coverage, automatic schematics, the assistant and extension downloads remain in secondary navigation. The extension banner lives in Tools.

## Analysis operations

The worker sends a heartbeat every two seconds during analysis and every idle poll. Readiness expires after 30 seconds without a heartbeat. API reads recover expired running jobs as failed, with explicit retry guidance. There is no silent automatic success or retry.

Queued work cancels immediately. Running checks stop cooperatively, including native-process waits. Each attempt uses a separate directory under the configured `analyses/` folder, and a lease gates publication. Cancelled or expired attempts cannot publish over a later result. Previous published reports and original design sources remain available.

Retry creates a new job on the same source revision and requests fresh checks. A failed/cancelled retry does not establish a clean circuit.

## Credentials and storage

Groq keys submitted through the app are validated and saved in the current user's OS credential store, using Windows Credential Manager on Windows. Provider JSON contains metadata only. A legacy plaintext key is removed only after successful write/read verification in the OS store. Failed migration retains the old file and reports the problem; no new plaintext fallback is used.

Environment keys remain supported. Linux/macOS need a supported system keyring backend to save keys through the app. Credentials are scoped to the configured data directory and excluded from circuit context, diagnostics, backups and release packages.

Tools → Project storage provides:

- Backups containing original source, revision history, published engineering exports and review notes.
- Restore into a **new** project, with source-hash validation and fresh checks queued. Existing projects are preserved. Restored reports are labelled as backup evidence pending recheck.
- A preview-cleanup plan showing generated SVG/GLB count and size before removal. Sources, findings, review history and native JSON/XML reports are retained. Rerun checks to regenerate previews.

Backups are limited to 25 MB compressed and 100 MB expanded. Machine settings and credentials are excluded.

## Development and regression checks

```powershell
npm ci
python -m pip install -r requirements.lock.txt
python scripts/generate_api_types.py
npm run build
npm run test:checks
python -m pytest -m "not native"
python -m pytest -m native
npm test --prefix browser-extension
node --experimental-strip-types --test tests/test_generated_schematic.mjs
npm run build:pages
npx playwright test --config playwright.pages.config.ts
```

`src/api.generated.ts` and `docs/openapi.json` come from FastAPI. `python scripts/generate_api_types.py --check` detects drift. Service, diagnostics, job and storage responses use generated contracts; historical geometry/report interfaces remain explicit domain interfaces. The API helper defaults to `unknown`, requiring a chosen response type. Project loading, diagnostics, job controls, storage tools, search and filters are focused hooks/components.

PR CI builds the frontend, checks schema drift, runs portable Python tests, extension tests, schematic tests and recorded browser journeys. A separate native KiCad job installs the official [10.0 release channel](https://www.kicad.org/download/linux-distros/), records its actual CLI version and runs native integration tests. Workflow execution requires committing these local files to GitHub.

## Releases and support limits

The release workflow runs on a version tag or manual dispatch. Tests and builds precede complete app/extension ZIP generation, checksums and a version manifest. Packages use an explicit allowlist and exclude credentials, `.env`, databases, saved projects and machine runtime settings. App version comes from `package.json`; extension manifest/package versions must agree. The workflow uploads artifacts; publication is separate.

After building, `python scripts/package_release.py --out-dir release` reproduces the packages locally. See [VERIFICATION.md](VERIFICATION.md), [RELEASE_NOTES.md](RELEASE_NOTES.md) and [the extension guide](browser-extension/README.md).

Pages is a recorded synthetic example. It does not host Python, live KiCad jobs, settings or project storage. Reconstructed schematics and illustrative 3D packages do not verify operation or fit. No overall circuit health score is calculated; results do not certify fabrication readiness.


## Local tscircuit checks integration

CircuitCheck uses [@tscircuit/checks](https://github.com/tscircuit/checks) **0.0.279**, pinned with **circuit-json 0.0.550** and **@tscircuit/solver-utils 0.0.25** in package.json/package-lock.json. The last dependency supplies an undeclared runtime import in checks 0.0.279. The installed package and the five enabled functions were tested together on Node.js 24.21.0. Upstream checks use the MIT license, copyright 2024 tscircuit Inc.; the full notice is retained in [public/licenses/tscircuit-checks-MIT.txt](public/licenses/tscircuit-checks-MIT.txt).

Run Setup CircuitCheck.cmd after installing Node.js 24. Setup now installs the locked npm dependencies even when a compiled frontend already exists. For an already configured checkout:

```powershell
npm ci
npm run build
& '.\Start CircuitCheck.cmd'
```

Open http://127.0.0.1:8000/. Upload a schema:1 Circuit Check captured JSON file/report through the existing project upload dialog, or rerun an existing native KiCad project. Try fixtures/captured-checks/required-pin-violation.json, valid.json, incomplete.json and underspecified.json. The worker runs the Node checker locally; no AI key, hosted checking service or network request is used by these checks. CIRCUITCHECK_NODE can select an explicit Node executable if it is not on PATH.

The Docker recipe includes Node and the locked production checker dependencies. It has not been built on the Windows verification host because Docker is unavailable; the tested startup path is the local Windows launcher.

Native KiCad DRC/ERC remains authoritative for native violations. The supplemental engine has its own source label, exact exported rule name, upstream error/warning type, original message, severity, input hash and retained tscircuit-report.json artifact. A supplemental error remains an error; a warning remains a warning. The separate evidence classification is a review suggestion because this is a captured-input check, not native KiCad verification. Supplemental failure is visible in coverage and a workspace alert; it does not rewrite native findings or disable an otherwise native-verified repair.

### Inputs and explicit metadata

Accepted captures are schema:1 objects with components[].terminals[], or exported reports containing snapshot or run.snapshot. Raw Wokwi diagram.json, photographs, PDFs and arbitrary Circuit JSON arrays are not new checker inputs; the pre-existing schematic importer remains separate. Limits: 5 MB, 500 components, 5,000 pins and 5,000 explicit connections. JSON accompanying native KiCad files remains associated data; it does not override native component facts.

The adapter preserves each component id, terminal key (or explicitly labelled source index when absent), pin name and exact net identifier in its source map. Duplicate pin names require distinct keys to remain distinguishable. Numeric zero/unknown values are not silently converted to connection facts. Known assignments use a nonempty net string; explicit null means no assigned net; omitted net means unknown and is not treated as a known open connection.

Optional captured metadata is explicit and must come from the actual source/component documentation:

- ftype: "simple_chip" declares a chip. Unknown component models become a structural simple_pinout container in Circuit JSON, with no inferred chip, power, ground, voltage or physical role.
- pinInventoryComplete: true and pinAttributesComplete: true declare complete captured inventories for chip specification checks. Do not set these merely to force a check to run.
- requiresPower: true and requiresGround: true declare whether the chip requires those roles. U-prefixed references, model names, VCC and GND pin/net names do not establish requirements.
- A terminal's attributes object uses Circuit JSON names such as must_be_connected, requires_power, requires_ground, is_input, is_passive, provides_voltage and requires_voltage. Unknown fields should be omitted. Voltage values supported by this adapter are explicit finite numbers in volts; ranges, prose and voltage tolerances are not evaluated.
- topologyComplete: true declares that all connections were captured. Optional connections use `{id, from:{componentId,pinKey}, to:{componentId,pinKey}}`. Optional component internalConnections lists groups of existing terminal keys; internal wiring is never inferred from board or model names.

Shared exact net membership and explicit connections become logical source_trace records. A single-pin named net does not create an invented connection. The adapter never creates PCB traces, pads, layers, board geometry, inferred grounds, component ratings, or missing wires.

### Enabled checks and coverage

| Upstream function | Required facts |
|---|---|
| checkPinMustBeConnected | Explicit must_be_connected flags, known net/null assignments and explicitly complete captured connectivity |
| checkAllPinsInComponentAreUnderspecified | Declared chip type and complete pin/attribute inventories |
| checkNoPowerPinDefined | Complete chip inventories and an explicitly declared power requirement; upstream-inapplicable all-passive packages are skipped |
| checkNoGroundPinDefined | Complete chip inventories and an explicitly declared ground requirement |
| checkSourcePinVoltageCompatibility | Complete connectivity and an actually connected pair with numeric provided/required nominal voltages; no undocumented tolerances or ranges |

Each function runs only on its eligible subset. Coverage distinguishes evaluated, partially evaluated, skipped, unsupported and failed checks, with item counts and reasons. Skipped, unsupported and failed rows have null finding counts rather than a claimed pass. A native PCB normally supplies intended net membership but not chip type, required-pin flags or complete pin metadata, so these supplemental checks are usually skipped for it. Existing native DRC/ERC still runs normally.

Routing, placement, copper clearance, board-edge, schematic styling, switch-contact and other aggregate upstream checks are unsupported here. runAllChecks is deliberately not used. Native KiCad geometry is not approximated into a tscircuit PCB model.

Captured findings select original component identities in the existing reconstructed schematic. Native mappings require an exact recorded pad or a unique component reference/anchor. Ambiguous references and absent coordinates remain unavailable; no generated layout is passed off as native geometry. A reconstructed drawing is withheld if captured net assignments are unknown. Original uploaded files remain unchanged.

### Integration verification

```powershell
npm run test:checks
python -m pytest tests/test_tscircuit_integration.py -q
python -m pytest -m native -q
npm run build
```

Fixtures cover a required floating pin, a valid documented circuit, incomplete captures, pin-specification warnings, duplicate pin-name identity mapping, explicit connections, voltage mismatch and injected check/process failure. Tests retain upstream severity, verify exact source mapping and source hashes, and keep native engine findings/repair authority independent of supplemental failures.

