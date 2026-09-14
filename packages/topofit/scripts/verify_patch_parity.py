#!/usr/bin/env python3
"""Compare browser geometry with a local checkout of the public OpenRecon recipe."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import numpy as np


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference", type=Path)
    parser.add_argument("--surfaces", type=Path)
    parser.add_argument("--atlas", type=Path)
    args = parser.parse_args()
    sys.path.insert(0, str(args.reference))
    import topofit_core as reference
    from topofit_geometry import _outward_vertex_normals, triangle_voxel_mask
    script = Path(__file__).with_name("compare_patch_geometry.mjs")
    cases = []
    for slope, bend in [(0.3, 0), (0.15, 0.006), (0, 0.08)]:
        x, y = np.meshgrid(np.arange(31), np.arange(31))
        white = np.column_stack([x.ravel(), y.ravel(), (slope * x + bend * (x - 15)**2).ravel()])
        if bend:
            white[:, 2] += (0.03 * np.sin(x * 0.7) * np.cos(y * 0.4)).ravel()
        pial = white + [0, 0, 2]
        faces = np.asarray([(a, a + 1, a + 31) if t == 0 else (a + 1, a + 32, a + 31) for y in range(30) for x in range(30) for a in [x + y * 31] for t in range(2)])
        cases.append((f"plane-{slope}-{bend}", white, pial, faces, None, None))
    if args.surfaces:
        import nibabel as nib
        for hemi in ("lh", "rh"):
            white, faces = nib.freesurfer.read_geometry(str(args.surfaces / f"{hemi}.white"))
            pial, _ = nib.freesurfer.read_geometry(str(args.surfaces / f"{hemi}.pial"))
            registration, _ = nib.freesurfer.read_geometry(str(args.surfaces / f"{hemi}.registration"))
            cases.append((hemi, white, pial, faces, registration, hemi))
    for name, white, pial, faces, registration, hemi in cases:
        middle = (white + pial) / 2
        eligible = np.ones(len(white), dtype=bool)
        if registration is not None:
            eligible = reference.mapped_cortex_mask(registration, hemi, args.atlas)
            eligible = reference.erode_cortex_mask(middle, faces, eligible)
            eligible = reference.cortical_ribbon_mask(white, pial, eligible)
        expected = reference.find_ranked_patches(middle, faces, f"{hemi or 'lh'}.mid", eligible_vertices=eligible)
        normals, _ = _outward_vertex_normals(middle, faces, pial - white)
        normals[np.einsum('ij,ij->i', normals, pial - white) < 0] *= -1
        payload = dict(white=white.tolist(), pial=pial.tolist(), faces=faces.tolist())
        if registration is not None:
            payload.update(registration=registration.tolist(), hemisphere=hemi, atlas=str(args.atlas / "fsaverage-cortex.bin"))
        else:
            payload["volume"] = dict(dims=[35, 35, 50], affine=np.eye(4).tolist())
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json") as fixture:
            json.dump(payload, fixture)
            fixture.flush()
            actual = json.loads(subprocess.check_output(["node", str(script), fixture.name]))
        np.testing.assert_allclose(np.asarray(actual["normals"]).reshape(-1, 3), normals, atol=1e-10)
        np.testing.assert_array_equal(actual["eligible"], eligible)
        assert len(actual["patches"]) == len(expected), (name, len(actual["patches"]), len(expected))
        # Exact planar ties can rank differently after floating-point eigensolves.
        # Curved and real meshes require the same selected vertices and metrics.
        if name != "plane-0.3-0":
            for result, detection in zip(actual["patches"], expected):
                np.testing.assert_array_equal(result["indices"], detection.vertex_indices)
                np.testing.assert_array_equal(np.asarray(result["faces"]).reshape(-1, 3), detection.faces)
                np.testing.assert_allclose(result["normal"], detection.patch.normal_ras, atol=1e-9)
                np.testing.assert_allclose([result["rms"], result["area"], result["coherence"]], [detection.patch.rms_distance_mm, detection.patch.area_mm2, detection.patch.normal_coherence], atol=1e-9)
        if "volume" in payload:
            expected_mask = triangle_voxel_mask((35, 35, 50), np.eye(4), middle, faces)
            np.testing.assert_array_equal(actual["mask"], expected_mask.ravel(order="F"))
        print(f"{name}: normals, cortex mask, {len(expected)} patches and voxel intersections match")


if __name__ == '__main__':
    main()
