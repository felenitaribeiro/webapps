# TopoFit parity and reproducibility

## Problem

The released browser differed from OpenRecon by 0.467 to 0.562 mm mean anatomical surface distance when both processed the original anisotropic `ds000001` scan. The distance fell to 0.052 to 0.062 mm when both received the same conformed volume. These results placed the largest error at the conforming boundary.

OpenRecon uses nibabel 5.3.2 `processing.conform`. It creates a centered `256 x 256 x 256` RAS grid at 1 mm, applies SciPy order-3 spline interpolation with constant-zero fill, and preserves the reference dtype boundary. The released browser used Niimath RAS reorientation and Lanczos resizing, which created a different field of view, center, and scalar representation.

Runtime repeatability had a separate gap. The released browser chose one to four ONNX Runtime WebAssembly threads from the host environment, and its processing manifest included elapsed seconds.

## Usage

The worker calls one reconstruction operation. The app owns the production
browser conformer and the executor records the settings that it uses.

`runTopofit()` receives the fixed browser session factory, tensor constructor,
verified asset loader, executor identity, and an optional conformer boundary.
The TopoFit worker supplies the pinned npm `@niivue/niimath` implementation.

With `conform: true`, the production browser runs niimath `-conform -ras`, which
accepts axis-aligned and oblique scans and emits the model's centered 256³ 1 mm
RAS grid. The package's cubic implementation remains the Node and validation
fallback when no boundary is supplied. With `conform: false`, the package
validates the input grid and uses it unchanged.

## Shape

The implementation uses JavaScript records. These type sketches describe the
stable result boundary.

```ts
type Shape3 = readonly [number, number, number];
type Matrix4 = readonly [Row4, Row4, Row4, Row4];
type Row4 = readonly [number, number, number, number];
type Sha256 = string & { readonly sha256: unique symbol };

type ModelVolume = {
  dims: Shape3;
  affine: Matrix4;
  data: Float32Array;
};

type StableProvenance = {
  schemaVersion: 2;
  inputSha256: Sha256;
  inferenceSha256: Sha256;
  alignmentInputSha256: Sha256;
  modelInputSha256: Sha256;
  outputSha256: Record<string, Sha256>;
  runtime: ExecutorIdentity;
};

type RunResult = {
  files: readonly DownloadFile[];
  provenance: StableProvenance;
  elapsedSeconds: number;
};
```

The production niimath worker performs linear conforming, intensity scaling, and
RAS orientation in WebAssembly. `conformVolume()` owns the fallback's RAS
orientation, integer-centered target affine, SciPy-compatible cubic spline
filtering, edge behavior, and integer output casting. Before the fallback
decodes voxel values, `readVolume()` estimates every simultaneous conform buffer
and rejects inputs above the 768 MiB preprocessing budget.

## Ownership

| Location | Responsibility |
| --- | --- |
| `packages/topofit/src/volume.js` | Decode NIfTI geometry, scaling, scalar type, and source-grid QC data. |
| `packages/topofit/src/conform.js` | Own the deterministic cubic fallback and its memory lifetime. |
| `packages/topofit/src/pipeline.js` | Invoke the supplied conformer or fallback, run the neural schedule, and assemble outputs. |
| `packages/topofit/src/browser.js` | Create ONNX Runtime sessions and bind executor settings to executor identity. |
| `packages/topofit/src/results.js` | Write deterministic FreeSurfer surfaces. |
| `apps/topofit/src/inference-worker.js` | Run pinned niimath `-conform -ras`, fetch verified assets, create one executor per worker, and transfer results. |
| `packages/topofit/validation` | Capture the pinned container, run the production browser, and compare immutable evidence. |

The worker disposes its niimath instance after each conform operation. The
original decoded source remains available for source-grid QC, and all output
names remain unchanged.

## Verification

The reference capture records the container, NumPy, SciPy, and nibabel identities, plus the effective dtype, conformed affine, and float32 model input. Compact fixture metadata belongs in Git. Large inputs and outputs belong in the immutable Hugging Face release.

Unit fixtures cover the cubic fallback's centered interpolation, integer
rounding, anisotropy, axis permutation, axis flips, and oblique mapping. The
production browser smoke test sends an oblique NIfTI through the real niimath
worker before allowing the model request. A fresh immutable end-to-end capture
is still required to set parity evidence for the niimath output tensor.

The end-to-end gate runs the original `ds000001` input through the production browser and the pinned container. It requires exact topology, finite vertices, mean anatomical distance at most 0.25 mm, p95 at most 0.5 mm, maximum distance at most 2 mm, the existing registration limits, and at least 0.99 source-voxel QC coverage. The previous 0.467 to 0.562 mm result is the failing baseline.

Repeatability runs the same production build at least twice with one thread. A fixed executor must produce identical surface, QC, and provenance bytes.

The comparison rejects mixed evidence by checking the conversion status, input digest, captured conform digest, runtime identity, asset-set digest, per-output digests, and repeat output bytes.

## Result

The checked-in capture shows that the cubic fallback matches all 16,777,216
OpenRecon voxels and the target affine. Its end-to-end mean anatomical surface
distance is 0.046 to 0.068 mm, p95 is 0.098 to 0.164 mm, and maximum distance is
0.238 to 0.467 mm. Those figures do not claim parity for the current browser
niimath path; its new end-to-end capture remains pending.

## Synthesis decision

Three candidates explored the design. Candidate 1 supplied the base: always run the reference branch when conforming is enabled, bind executor identity to execution, and require exact repeatability. Candidate 3's release-evidence consistency check is also included.

The current design favors the shared, maintained niimath WebAssembly conformer
for broad browser input support. It keeps the proven cubic implementation as a
validation fallback rather than maintaining two production conformers.

## Tradeoffs

- Browser preprocessing is shared with the other Neurodesk apps and handles oblique scans, but it is not numerically identical to OpenRecon's cubic conformer.
- The JavaScript cubic implementation remains available for deterministic Node tests and reference investigation, not as the browser default.
- We use one thread for a fixed production policy. This costs runtime but removes a host-dependent executor choice.
- We change the provenance schema so scientific metadata is byte-stable. Timing stays available to the UI and validation sidecars.

## Alternatives

Running the cubic JavaScript fallback in production preserves the closest
OpenRecon parity but duplicates a scientific image-processing operation and has
a larger memory footprint. Shipping Python, nibabel, and SciPy in WASM would add
a much larger runtime. The pinned niimath package is the smallest maintained
path that accepts real-world oblique NIfTI inputs in both dev and production.

## Next step

Capture the current niimath `-conform -ras` tensor and full reconstruction for
an axis-aligned reference and an oblique T1, then record the preprocessing
difference separately from controlled ONNX/runtime parity.
