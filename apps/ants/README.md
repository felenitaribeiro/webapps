# ANTs

ANTs registers a moving image to a stationary image entirely in the browser:
an affine stage followed by SyN symmetric diffeomorphic registration with the
Mattes mutual-information metric, using the ANTs 2.6.2 WebAssembly kernel and
ANTsPy `SyN` schedule that SYNcro already ships (`packages/registration`). The
interface is Greedy's: moving, stationary and resliced images in three linked
NiiVue panels, dcm2niix for DICOM, MindGrab brain extraction for custom inputs.

The supplied examples are already brain extracted and load on start; SyN on
the 1 mm examples took 49 s on an Apple M4 Pro and is slower on older hardware, so
registration starts when you press **Register images**. Outputs: the registered image, the affine matrix and the
forward and inverse warps, in ANTs' own formats.

## Build and test

```bash
pnpm --filter ants dev        # stages the ANTs and MindGrab runtime into public/ (gitignored), then Vite
pnpm --filter ants test
pnpm --filter ants lint
pnpm --filter ants build
pnpm --filter ants test:e2e   # ANTS_LIVE_DATA=1 additionally registers the real 1 mm examples
```

Example data comes from the `reg/` folder of the `neurodeskorg/webapps` Hugging
Face dataset at a pinned revision, shared with Greedy.
