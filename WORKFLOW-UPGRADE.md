# Review workflow upgrade

- Design review is the opening view. Upload project and Explore example are available above the workspace; revision uploads still open comparison.
- Clicking or tapping a component pins an accessible details panel, including its related findings. Selecting a board finding retains the 3D view and marks the UUID-resolved component, pad or track. Geometry mode also colors selected objects. ERC findings open their schematic source.
- New local analysis retains component values, footprints, manufacturer/part number fields and assigned model paths. Missing values remain unspecified; older reports need a rerun for newly retained fields. Display metadata does not change legacy object signatures.
- Components & models provides search and distinguishes example library assignments, bundled model files, missing files, unresolved assignments and illustrative shapes. Assigned paths alone do not prove that KiCad rendered a model. The upload action accepts a project ZIP with assigned model files; complete GLBs can be opened locally.
- Revision 3D views mark added, removed and changed objects on their respective sides, report component-envelope movement and optionally synchronize camera orbit, zoom and pan. UUID matching does not establish equivalent electrical intent.
- Identifiers can be hidden independently of findings and work with pointer hover and keyboard focus; taps/clicks keep details open. Related findings are keyboard accessible, Escape dismisses details, and pinned details scroll within a bounded panel rather than covering the board.

Board errors and warnings are shown as red E and amber W markers. Nearby findings share a selection menu. Checkboxes independently hide each severity, including selected finding highlights. Excluded and schematic-only findings are not placed on the board; findings without mapped positions are counted without guessed locations.

The corner axis control rotates with the camera. Click an axis tip or a positive/negative axis button to face that direction without changing zoom; Home restores the initial view. Mapped boards use X/Y on the PCB and Z above it. Arbitrary GLBs use their model axes (Y-up). The idle camera animation is disabled so snapped views remain still. Linked revision cameras also synchronize axis clicks.

## Mapping limits

The recorded example and generated geometry previews have known coordinate frames and support linked annotations. Arbitrary uploaded or native-exported GLB assemblies remain viewable, but are not assigned guessed component coordinates. Switch to geometry preview for mapped inspection. Native exports still require installed KiCad and resolvable assigned STEP/WRL models. This environment cannot verify a real KiCad export end to end.

## Validation

- `npm run build` and `npm run build:pages` passed.
- All 15 browser checks passed: existing review/schematic/comparison/export behavior, labels and hover, binary model loading, first visit, responsive widths, pinned/keyboard/mobile details, related findings, inventory and supply action, changed components, actual pointer-driven synchronized orbit/zoom, red/amber finding markers with independent severity toggles, identifier visibility, six axis views, clickable axis tips, reset and synchronized axis clicks.
- 14 focused Python checks passed for component metadata, model export adapter and review/geometry behavior. Native engine integration tests were not run here.
- Comparing old and new source parsers preserved all 107 object signatures for the original example fixture.
