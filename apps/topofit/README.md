# TopoFit web app

TopoFit reconstructs left and right white, pial, and spherical-registration surfaces from a T1-weighted brain MRI. Processing stays in a browser worker. The app downloads hash-verified, revision-pinned BrainNet 0.2 models in ONNX format from the Neurodesk Hugging Face dataset.

Use a desktop browser with cross-origin isolation and several gigabytes of available memory. The complete order-6 reconstruction contains 245,762 vertices and 491,520 faces per hemisphere. It is research software, not motion-cleared and not for prescription.

The browser uses the pinned npm `@niivue/niimath` WebAssembly worker to apply
`-conform -ras`, resampling axis-aligned and oblique NIfTI geometry onto a
centred 256³ 1 mm RAS grid. The original image and affine remain available for
the source-grid QC volume.

```bash
pnpm --filter topofit dev
pnpm --filter topofit build
pnpm --filter topofit test
pnpm --filter topofit test:e2e
```

For offline model development, set `TOPOFIT_ASSET_DIR` to the exported release directory and `VITE_TOPOFIT_ASSET_BASE=/model-assets/`. See [`packages/topofit/validation/README.md`](../../packages/topofit/validation/README.md) for the pinned-container comparison.

The browser exports six FreeSurfer triangular surface files, a source-grid QC
NIfTI, and a JSON processing manifest. White and pial surface checkboxes can be
combined over the anatomical slices or in 3D. The X-ray control appears while a
cortical surface is visible and defaults to 10%. Registration spheres use a
different dilated coordinate space, so they remain separate View actions and
are displayed without the anatomical volume. DICOM import uses the shared
dcm2niix worker. Images and results are not uploaded to a processing service.
