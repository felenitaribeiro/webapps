# Surface-analysis comparison, 14 September 2026

The JavaScript geometry was compared directly with the OpenRecon recipe using
`scripts/verify_patch_parity.py`. Both full-resolution controlled browser
hemispheres from the pinned TopoFit validation dataset passed. Each hemisphere
has 245,762 vertices and 491,520 faces.

The comparison requires local unit normals within 1e-10, identical mapped and
eroded cortex masks, identical selected vertex indices, and plane normals, RMS,
area and signed normal coherence within 1e-9. Three synthetic planes also check
triangle-to-voxel masks exactly. Curved synthetic cases require exact patch
membership. A perfectly planar case permits different rankings of numerically
tied candidates.

## Real reconstructed cortex

| Patch | Area, mm² | RMS, mm | Normal coherence |
| --- | ---: | ---: | ---: |
| LH01 | 149.511432 | 0.407652 | 0.959485628 |
| LH02 | 138.111057 | 0.320317 | 0.947653275 |
| LH03 | 168.316613 | 0.383922 | 0.948872109 |
| RH01 | 164.808119 | 0.314698 | 0.949394178 |
| RH02 | 155.059072 | 0.336236 | 0.948110412 |
| RH03 | 157.530376 | 0.374494 | 0.948343200 |

The complete analysis facade also wrote the paired geometry, normals CSV files,
patch surfaces and source-grid QC for this scan. These outputs stay in scratch
storage; no scan, subject surface or model is committed.

## Reference identity

Source recipe: https://github.com/neurodesk/neurocontainers/tree/main/recipes/topofit

| Source file | SHA-256 |
| --- | --- |
| topofit_core.py | `5f0524b571745595fb936365a4b978f503000474a691441c47a5f62bd90ed9e2` |
| topofit_geometry.py | `57514654ed4b64fe0fd706fd97beabec58f95e38482c09bd6eea6dd2e64390f4` |

The input surfaces are under `topofit/0.5.1/onnx-20260911/validation/browser/controlled/`
at Hugging Face revision `b438d1162e7192ca425ca47282b06fe62340c85a`.
`cortex-atlas.manifest.json` pins the packed atlas and original source checksums.

This validates the added geometry against OpenRecon on one reference scan. It
does not rerun or extend the existing neural-reconstruction validation. The browser
uses JSON instead of NPZ for local geometry and draws patch IDs in selectable
result rows rather than in the QC raster. Sulcal-middepth analysis is not added.

## Browser and interface checks

The production Chromium suite passed all 12 checks, including a replay of the
real reconstruction with the computed patch outputs. It verifies both registration
spheres, anatomical 3-Plane views, measured patch centering, native-grid QC,
CSV downloads, retained settings and invalid-input recovery. Desktop and phone
screenshots were inspected. The full 22-app build, interface audit, mobile suite,
shared workflow suite and real DICOM upload checks passed.
