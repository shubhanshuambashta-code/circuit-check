# Current verification

Verified locally on 2026-11-15, Windows, Python 3.14.6 and KiCad 10.0.7.

| Check | Result |
|---|---|
| Complete Python suite | 102 passed: 89 portable and 13 native integration tests |
| Pinned tscircuit adapter / rule suite | 13 passed with @tscircuit/checks 0.0.279, circuit-json 0.0.550 and solver-utils 0.0.25 |
| Live supplemental-check browser journey | Passed: required-pin finding, exact source-component highlighting, evidence download, valid input, incomplete input, coverage states and mobile overflow; temporary projects removed |
| Browser extension | 135 passed |
| Schematic reconstruction | 12 passed |
| TypeScript / production build | Passed |
| Generated API-schema drift check | Passed |
| Recorded browser regression | 16 passed with Edge in the circuit-check staging checkout, including 3D, comparison, updated Tools navigation and responsive widths |
| Live workspace browser journey | Passed: R1/U1/GND board and schematic selection, keyboard component selection, issue navigation, filter persistence/deletion, evidence links, mobile layout |
| Live operations journey | Passed using temporary QA projects: heartbeat readiness, cancellation, fresh retry, native SVG publication, backup restore, preview cleanup; QA projects removed |
| Windows Credential Manager adapter | Temporary dummy write/read/delete passed |
| Standalone Windows diagnostics | Passed |

Live fixture cleanup preserved source hashes and native DRC reports. Existing user project source revisions and recorded analysis were unchanged by the workspace checks. Tests isolate every provider-credential lookup path and use an in-memory vault.

The native worker rejects late publication after cancellation/lease loss and retains prior results while attempts run in separate artifact directories. Cancellation is verified both at progress checkpoints and during a real child-process wait. Native tests exercise DRC, ERC, hierarchy, fabrication profiles, repairs, reports and revision comparison.

The CI and release workflows are local files. Their Linux runner, official KiCad 10.0 release-channel installation, and GitHub artifact upload have not run remotely yet. CI records the actual installed KiCad patch version; local evidence above is for 10.0.7. Live Groq completion has not been verified in this update; reconnect a provider key through the local form to use it. Otherwise the assistant remains explicitly evidence-only.

The tscircuit tests include required-pin and voltage violations, valid and incomplete captures, exact identifiers and duplicate pin-name mapping, pin-specification warnings, invalid input and injected check/process failure. Native test results and source hashes remain independent of supplemental failures. Checking uses a local Node process and requires no AI key. Clean npm ci and production build passed. The Docker recipe now includes the same pinned Node runtime and production dependencies; Docker was unavailable, so that image has not been built or exercised here.

Historical unsupported-feature lists were replaced by the current README and release notes. Generated schematics preserve recorded open pins and intended net membership, not inferred wiring. Native schematic net highlights mark connected symbol anchors. Arbitrary GLBs have no assumed component mapping; illustrative packages do not prove fit. No functional-circuit or fabrication certification is claimed.

