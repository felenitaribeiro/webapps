# TopoFit

Browser packaging for BrainNet TopoFit 0.5.1. The package preserves the pinned
OpenRecon workflow's TReGA alignment, order-6 cortical topology, bilateral
white/pial/registration surfaces, and source-grid QC output.

The model release is external. Create a Python 3.11 environment from
`requirements-export.txt`, then run:

```bash
python scripts/export_models.py /path/to/topofit-release
python scripts/publish_release.py /path/to/topofit-release
python scripts/activate_manifest.py /path/to/topofit-release HUGGING_FACE_COMMIT model.manifest.json
```

The exporter validates every learned ONNX boundary before it writes
`conversion-report.json`. Activation additionally requires the production
browser comparison in `validation/`. The checked-in manifest points to an
immutable dataset commit and records every runtime asset's byte count and
SHA-256.

With conforming enabled, the package reproduces OpenRecon's centered 256³,
1 mm RAS, order-3 cubic preprocessing for supported axis-aligned NIfTI inputs.
ONNX Runtime WebAssembly uses one thread so repeated runs have a fixed executor
policy. The downloaded processing manifest contains SHA-256 hashes for the
input, conformed tensor, model inputs, assets, and outputs; elapsed time is kept
outside that stable manifest.

## Surface analysis

Set `estimateNormals: true` to export bilateral mid-surface positions and unit
normals as CSV. Set `patches: {}` to enable OpenRecon's flat-patch search with
its defaults. `patches` accepts `radius`, `count`, `hemisphere`, `maxRms` and
`minAreaFraction`. `loadAtlas()` supplies the verified bytes from
`cortex-atlas.manifest.json`. An optional `roiBuffer` contains a native-grid
NIfTI mask; positive voxels restrict selection.

The search maps fsaverage cortex labels through the registration spheres,
erodes the medial-wall boundary by 5 mm along mesh edges, and excludes ribbon
separations below 0.5 mm. Connected candidates use a 10 mm geodesic radius by
default. Acceptance requires RMS at most 0.5 mm, area at least 25% of the radius
disc, and signed normal coherence at least 0.9. Up to three disjoint patches
per hemisphere are returned. Empty ROIs fail; failed quality searches return
`NO_PATCH_MEETS_CRITERIA` without lowering thresholds.

Each accepted patch has a viewable FreeSurfer mid-surface. The analysis JSON
records its RAS and LPS center and representative unit normal, area, RMS,
coherence, score and median ribbon separation. `topofit_patch_geometry.json`
contains source vertex indices, local triangles, paired white/mid/pial RAS
coordinates, local unit normals and ribbon separations. This is the container's
geometry schema in JSON instead of NPZ. CSV and JSON coordinates use millimetres;
normals are dimensionless. Per-vertex normals use all incident mid-surface
triangles and are individually oriented toward the corresponding pial vertex.

`topofit_patch_qc.nii` is a source-grid overlay with white boundaries at 2400,
pial boundaries at 2700, filled mid-surface triangles at 3000 and normal glyphs
at 4095. The browser supplies the original anatomy underneath. The 4 mm center
ring and 20 mm projected normal follow OpenRecon's source-slice convention.
Patch IDs are selectable result rows rather than rasterized image text.

Rebuild the atlas outside the repository:

```bash
python3 scripts/pack_cortex_atlas.py "$TMPDIR/topofit-atlas"
```

Compare against a downloaded OpenRecon recipe directory containing
`topofit_core.py` and `topofit_geometry.py`:

```bash
python3 scripts/verify_patch_parity.py "$TMPDIR/topofit-reference" \
  --surfaces "$TMPDIR/topofit-reference/surfaces" \
  --atlas "$TMPDIR/topofit-reference/atlas"
```

The atlas directory must also contain `lh.sphere.reg`, `rh.sphere.reg` and the
two original cortex labels, as in OpenRecon. The surfaces directory contains
bilateral white, pial and registration outputs. Validation covers local normals,
atlas mapping, medial-wall erosion, exact patch membership and geometry metrics.
Synthetic cases additionally compare triangle-to-voxel intersection masks.
