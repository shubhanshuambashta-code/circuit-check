# Combined extension verification — 14 November 2026

`npm test`: **96 passed, 0 failed**.

The suite retains shared rules, reviews, corrections, visual editing, SVG escaping, storage/import and concurrent draft-save checks; Tinkercad reader/guarded-edit tests; and Wokwi normalization/export tests. New platform tests verify exact URL hosts, tags, ambiguous frames, independent hashes/history, cross-platform comparison/draft rejection, Wokwi native-flag suppression, correct LED pin names and imports from both older editions.

A fresh isolated Microsoft Edge profile loaded the root combined manifest and verified:

1. Tinkercad detection, inspector and approved 330-ohm resistor edit on a controlled synthetic editor: exactly one writer call and actual-value reread.
2. Tinkercad visual workspace with Wokwi native export hidden.
3. Automatic switching to a controlled Wokwi project with the same project ID.
4. Saved Wokwi review, generated 330-ohm resistor repair, downloaded and parsed native diagram.json.
5. Separate tinkercad:review-fixture and wokwi:review-fixture histories; Tinkercad edits did not appear under Wokwi.
6. Automatic switch back to Tinkercad and clearing of live data on an unrelated tab.
7. Live reading of [Wokwi's new Uno editor](https://wokwi.com/projects/new/arduino-uno) using extension scripting/host permissions.
8. Live reading of [a public Tinkercad circuit](https://www.tinkercad.com/embed/jX5CXaqW8XH) using the same extension.
9. No extension panel or designer page errors.

No authenticated user project was changed. Public projects were read only; edits and repair export used controlled fixtures. Screenshots show the combined extension.

These checks do not establish firmware correctness, all component ratings, whole-circuit function or Wokwi internal breadboard connectivity. The preserved Tinkercad adapter and current Wokwi React project.files reader retain their documented coverage boundaries.

## v0.5.1 — same-tab workspace navigation

The visual workspace now navigates the currently selected browser tab after saving the captured visual project locally. It no longer creates a separate tab.

An isolated Edge test verified this on controlled Tinkercad and Wokwi editors: the browser tab ID list stayed identical, the correct captured project loaded in the visual workspace, platform-specific export controls stayed correct, and browser Back returned to the original circuit. No extension page errors occurred. Syntax verification passed for the modified panel module. Existing v0.5.0 rule/review verification above remains the baseline; its screenshots are historical.
