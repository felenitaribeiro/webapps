# topofit

## 0.4.20260914

### Minor Changes

- Add optional TopoFit mid-surface normals and flat cortical patches, matching OpenRecon's atlas eligibility, geodesic search, plane-fit criteria and local ribbon geometry. Export native-grid patch-and-normal QC, individual patch surfaces, paired geometry JSON, normals CSV and measurements; support hemisphere, radius, count, quality and native-grid ROI settings. Pin the fsaverage atlas on Hugging Face. Compare the geometry with OpenRecon on both full-resolution validation hemispheres.

  Keep anatomical surfaces in 3-Plane view and give registration sphere files the FreeSurfer parser extension for display. Remove the repeated sidebar warning and single-option contrast selector. Suppress consecutive duplicate technical-log messages across apps, including QSMbly and CALMaR, and report model-download progress when its percentage changes.

### Patch Changes

- Updated dependencies
  - @neurodesk/topofit@0.4.20260914
  - @neurodesk/webapp-components@0.1.4

## 0.3.20260912

### Minor Changes

- Reject unsafe conform allocations and pin prepared-input and asset hashes in both parity modes.

### Patch Changes

- Updated dependencies
  - @neurodesk/topofit@0.3.20260912

## 0.2.20260912

### Minor Changes

- Match OpenRecon cubic conforming, pin deterministic browser inference, and add reproducibility hashes and repeat-run validation.

### Patch Changes

- Updated dependencies
  - @neurodesk/topofit@0.2.20260912

## 0.1.20260912

### Patch Changes

- Correct the TopoFit release-matrix toolchain declaration.
- Harden public release verification, limit the UI to the validated model, and correct interface and conforming details.
- Updated dependencies
  - @neurodesk/topofit@0.1.20260912

## 0.1.20260911

### Minor Changes

- Add local browser-based TopoFit cortical surface reconstruction with immutable ONNX assets and OpenRecon parity validation.

### Patch Changes

- Updated dependencies
  - @neurodesk/topofit@0.1.20260911
