# Wokwi reader fix — v0.6.1 — 14 November 2026

## Reproduced cause

The reported public project at https://wokwi.com/projects/480654540170532865 exposes two React project references for the same ID: the live state-tree instance (findFile/syncDiagram functions and tempId) and a serialized saved project object. v0.6.0 rejected the object count before considering whether these represented the same project.

## Change

Read committed React props, prefer the inspected live editor instance without invoking any editor actions or the diagram getter, select by the numeric URL project ID, and deduplicate identical wrappers. Conflicting live instances still fail closed. Invalid current JSON cannot fall back to a clean saved copy. Pending React props are ignored. Disconnected finding counts now show “—” and “Circuit not checked”, rather than displaying a misleading zero.

## Verification

120 automated tests pass. Six regression tests cover live-plus-saved duplicates, unsaved disconnections overriding the saved copy, invalid current JSON, identical/conflicting live wrappers, pending props and route identity.

The actual root-manifest extension was installed in an isolated Edge profile. On the reported ESP32 project it captured seven entries (six actual parts plus the connected serial monitor), connected while Wokwi simulation was running, and read an unsaved local removal of the r1:2-to-led1:A wire. The exported review included openPins findings for both r1 and led1, with nine source wires rather than the saved ten. The captured broken project opened in the same-tab visual workspace without adding a browser tab. A deliberately malformed current diagram cleared the result and all finding counters showed unavailable values; no saved fallback appeared. No extension page errors occurred.

The saved public project was not modified. Test edits were confined to an isolated unauthenticated page and no Save action or project-saving API was invoked. The extension still checks supported static wiring; it does not read Wokwi physics/simulator diagnostics or verify firmware. The screenshot was taken from the fixed reader before the release version label was bumped.
