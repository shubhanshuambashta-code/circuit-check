# Example board component models

The two GLB assemblies use official KiCad library meshes, not generated component blocks:

- R1–R6: `Resistor_SMD.3dshapes/R_1206_3216Metric.wrl`
- U1: `Package_SO.3dshapes/SOIC-16W_7.5x10.3mm_P1.27mm.wrl`
- J1–J2: `Connector_PinHeader_2.54mm.3dshapes/PinHeader_1x06_P2.54mm_Vertical.wrl`

Source: https://github.com/KiCad/kicad-packages3D/tree/master

Original attribution is retained in each WRL. See LICENSE.md for CC-BY-SA 4.0 and the KiCad design exception.

These are visual package assignments for a synthetic fixture, not a bill of materials or proof of mechanical fit. Board geometry and recorded engineering results are unchanged. The GLBs include the original board/pad/track geometry plus nine library models at the component locations in each revision; the board body remains a rectangular envelope. No geometry scaling is applied to library models beyond the standard KiCad WRL unit conversion (2.54 mm per unit).

Rebuild with Node 24: `data/tools/node.exe scripts/build_example_models.mjs`.
The generator requires the installed Three.js dependency used by model-viewer. `assignments.json` records the model assigned to every component in each revision.
