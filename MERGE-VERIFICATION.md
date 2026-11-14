# Combined Circuit Check workflows

This merge joins the assistant and extension work at `7139b8b` with the interactive 3D review work at `39bd3cf`. Both Git histories remain intact as merge parents.

The workspace includes design review, revision comparison, coverage, automatic schematics, the circuit assistant and the simulator extension. The 3D views retain component models, identifiers, component explanations, error and warning visibility, linked revision cameras and clickable camera axes. Automatic schematic routing and finding-to-assistant context remain available.

Validation performed on the combined source:

- Python suite: 67 passed, 13 skipped (native KiCad integration unavailable in this environment).
- Browser extension tests: 135 passed.
- Generated schematic tests: 12 passed.
- Browser checks: 16 passed, including a combined workflow test for 3D, original schematic navigation, the assistant and the downloadable extension ZIP.
- TypeScript and production, Pages and branch-static builds passed.

The complete application ZIP and branch-static snapshot are refreshed from the combined application. The existing manually triggered Pages deployment workflow is retained.
