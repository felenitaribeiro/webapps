#!/usr/bin/env python3
"""Compare the browser conform (packages/topofit/src/conform.js) with SciPy's order-3
affine_transform, the pinned OpenRecon cubic contract, on any NIfTI input.

    python packages/topofit/validation/scipy-conform-check.py input.nii.gz

Prints the mapping's largest off-diagonal term (0 for axis-aligned scans, which take the
separable path) and the voxel agreement after the integer cast the pipeline applies.
"""
import json, subprocess, sys, tempfile
from pathlib import Path
import numpy as np
from scipy import ndimage

root = Path(__file__).resolve().parents[3]
work = Path(tempfile.mkdtemp())
subprocess.run(["node", "--input-type=module", "-e", f"""
import {{ readFileSync, writeFileSync }} from 'node:fs';
import {{ readVolume }} from '{root}/packages/topofit/src/volume.js';
import {{ conformVolume }} from '{root}/packages/topofit/src/conform.js';
const v = readVolume(readFileSync({json.dumps(str(Path(sys.argv[1]).resolve()))}).buffer);
const c = conformVolume(v);
writeFileSync('{work}/conform.f32', Buffer.from(c.data.buffer));
writeFileSync('{work}/source.f64', Buffer.from(Float64Array.from(v.data).buffer));
writeFileSync('{work}/meta.json', JSON.stringify({{ dims: v.dims, affine: v.affine, outAffine: c.affine, datatypeCode: v.datatypeCode }}));
"""], check=True)
meta = json.loads((work / "meta.json").read_text())
dims = meta["dims"]
source = np.fromfile(work / "source.f64", dtype=np.float64).reshape(dims[::-1]).transpose(2, 1, 0)
browser = np.fromfile(work / "conform.f32", dtype=np.float32).reshape((256, 256, 256)).transpose(2, 1, 0)
mapping = np.linalg.inv(np.array(meta["affine"])) @ np.array(meta["outAffine"])
reference = ndimage.affine_transform(source, mapping[:3, :3], mapping[:3, 3], output_shape=(256, 256, 256), order=3, mode="constant")
ranges = {2: (0, 255), 4: (-32768, 32767), 8: (-2147483648, 2147483647), 256: (-128, 127), 512: (0, 65535), 768: (0, 4294967295)}
if meta["datatypeCode"] in ranges:
    reference = np.clip(np.where(reference > 0, np.floor(reference + 0.5), np.ceil(reference - 0.5)), *ranges[meta["datatypeCode"]])
mismatched = int((browser != reference.astype(np.float32)).sum())
print(f"off-diagonal max {np.abs(mapping[:3, :3] - np.diag(np.diag(mapping[:3, :3]))).max():.4f}")
print(f"mismatched {mismatched} of {browser.size} voxels, max abs diff {np.abs(browser - reference).max():.6g}")
sys.exit(1 if mismatched else 0)
