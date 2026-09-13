# TopoFit parity validation

The release gate compares the production browser app with OpenRecon TopoFit 0.5.1 in two cases based on OpenNeuro `ds000001/sub-01/anat/sub-01_T1w.nii.gz`.

- The controlled case gives both implementations the identical browser-resampled 1 mm RAS volume and runs OpenRecon with `--no-conform`. It isolates ONNX conversion, browser execution, geometry, and serialization.
- The end-to-end case gives both implementations the original anisotropic volume. Both use the pinned OpenRecon cubic conform contract.

The reference is the real CPU neural path from the immutable container `vnmd/topofit_0.5.1@sha256:dff22ad5577a1a7ba0530759e009f293271ea5ddfc3441fb35b61322bbd6ec29`. It is not the container's mock mode. The browser run loads the same scan through the public UI, executes the production worker and ONNX Runtime WebAssembly, and downloads the same six FreeSurfer files and QC NIfTI exposed to a user.

Run from the repository root with an empty work directory. The controlled input is pinned to the immutable published release; its SHA-256 is `69dc5c8be1850422e30ce8b03c6b434bb919c0427a3ec79e79b7552b4c00db5e`.

```bash
topofit_work=/storage/tmp/topofit-validation
mkdir -p "$topofit_work"
curl -fL https://s3.amazonaws.com/openneuro.org/ds000001/sub-01/anat/sub-01_T1w.nii.gz -o "$topofit_work/sub-01_T1w.nii.gz"
curl -fL https://huggingface.co/datasets/neurodeskorg/webapps/resolve/b438d1162e7192ca425ca47282b06fe62340c85a/topofit/0.5.1/onnx-20260911/validation/inputs/sub-01_T1w.browser-1mm.nii.gz -o "$topofit_work/sub-01_T1w.browser-1mm.nii.gz"
packages/topofit/validation/capture-openrecon.sh "$topofit_work/sub-01_T1w.nii.gz" "$topofit_work/reference"
packages/topofit/validation/capture-openrecon.sh "$topofit_work/sub-01_T1w.browser-1mm.nii.gz" "$topofit_work/reference-controlled" --no-conform

TOPOFIT_ASSET_DIR=/path/to/exported-assets VITE_TOPOFIT_ASSET_BASE=/model-assets/ pnpm --filter topofit build
TOPOFIT_ASSET_DIR=/path/to/exported-assets pnpm --filter topofit preview --host 127.0.0.1 --port 4173 --strictPort
node packages/topofit/validation/browser-run.mjs http://127.0.0.1:4173/topofit/ "$topofit_work/sub-01_T1w.nii.gz" "$topofit_work/browser"
node packages/topofit/validation/browser-run.mjs http://127.0.0.1:4173/topofit/ "$topofit_work/sub-01_T1w.nii.gz" "$topofit_work/browser-repeat"
node packages/topofit/validation/browser-run.mjs http://127.0.0.1:4173/topofit/ "$topofit_work/sub-01_T1w.browser-1mm.nii.gz" "$topofit_work/browser-controlled" --no-conform
python packages/topofit/validation/compare.py "$topofit_work/reference" "$topofit_work/browser" --repeat "$topofit_work/browser-repeat" --input "$topofit_work/sub-01_T1w.nii.gz" --conversion-report /path/to/exported-assets/conversion-report.json --mode end-to-end --output "$topofit_work/end-to-end.json"
python packages/topofit/validation/compare.py "$topofit_work/reference-controlled" "$topofit_work/browser-controlled" --input "$topofit_work/sub-01_T1w.browser-1mm.nii.gz" --conversion-report /path/to/exported-assets/conversion-report.json --mode controlled --output "$topofit_work/controlled.json"
```

The comparison requires identical topology and finite output, then measures corresponding anatomical-vertex distance, registration-sphere angle and radius, exact sparse-label Dice, and symmetric QC-label coverage within one source voxel. It requires the input, inference, alignment-input, model-input, asset-set, and output hashes in the processing manifest to equal fixed values for the selected mode. Each `--repeat` directory must contain byte-identical outputs and a byte-identical manifest. Exact Dice is reported but is not the QC gate because subvoxel surface differences move points across rounding boundaries. Both comparison modes enforce the same release thresholds. These are engineering regression limits, not clinical validation. One healthy T1 scan does not establish performance across scanners, pathologies, contrasts, or browsers.

The checked-in end-to-end report passes: its conformed 256³ tensor is byte-identical to OpenRecon, mean corresponding anatomical surface distance is 0.046–0.068 mm, p95 distance is 0.098–0.164 mm, mean registration error is 0.028–0.038 degrees, and one-voxel QC coverage is at least 0.9996. Two independent production-browser runs produced byte-identical surfaces, QC output, and processing manifests. The controlled report records the same remaining ONNX-versus-PyTorch numerical scale.

## Oblique inputs

The browser conform originally refused oblique scans. It now evaluates the same order-3
B-spline through the full voxel mapping. Because the OpenRecon container cannot run without
Docker, that path is pinned to the contract's implementation instead:
`scipy-conform-check.py input.nii.gz` conforms the scan in Node and with
`scipy.ndimage.affine_transform(order=3, mode='constant')` and counts differing voxels after
the pipeline's integer cast. On a 192×256×256 int16 T1 with a 0.9 × 0.94 × 0.94 mm grid and a
2.7° obliquity (largest off-diagonal mapping term 0.046) all 16,777,216 voxels matched, and
the full browser reconstruction completed in 68 s. An OpenRecon end-to-end capture for an
oblique scan is still owed before the release gate covers this path. The checker requires
NumPy and SciPy, writes its large intermediate arrays into a temporary directory, and removes
that directory after either a passing or failing comparison.
