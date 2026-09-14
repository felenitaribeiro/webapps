#!/usr/bin/env python3
"""Pack the OpenRecon fsaverage atlas; keep downloaded binaries outside the repo."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import urllib.request
import nibabel as nib
import numpy as np

SOURCES = {
    "sphere.reg": ("surf/lh.sphere.reg", "fddcf0eeecc6e0f62142164f7c0ac24fda1f0be8cb653d3f037970184c5ba98f"),
    "lh.cortex.label": ("label/lh.cortex.label", "e08216c1a840f0c192ac63c212fbbe12efc7e9731faa64a45083a098746b928a"),
    "rh.cortex.label": ("label/rh.cortex.label", "432e9ce95e095c066dae2ed2fb3e6c0c67af6e77d8f52ba2d3b560b4fc50b87f"),
}
BASE = "https://www.freesurfer.net/pub/dist/freesurfer/tutorial_versions_centos6/freesurfer/subjects/fsaverage/"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    for name, (path, digest) in SOURCES.items():
        target = args.directory / name
        if not target.exists():
            urllib.request.urlretrieve(BASE + path, target)
        if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
            raise ValueError(f"Checksum mismatch: {name}")
    points, _ = nib.freesurfer.read_geometry(str(args.directory / "sphere.reg"))
    masks = []
    for hemisphere in ("lh", "rh"):
        indices = nib.freesurfer.read_label(str(args.directory / f"{hemisphere}.cortex.label"))
        mask = np.zeros(len(points), dtype=np.uint8)
        mask[indices] = 1
        masks.append(mask.tobytes())
    packed = struct.pack("<I", len(points)) + points.astype("<f4").tobytes() + b"".join(masks)
    (args.directory / "fsaverage-cortex.bin").write_bytes(packed)
    print(json.dumps({"filename": "fsaverage-cortex.bin", "bytes": len(packed), "sha256": hashlib.sha256(packed).hexdigest(), "sources": SOURCES}, indent=2))


if __name__ == "__main__":
    main()
