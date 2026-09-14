import { readFile } from 'node:fs/promises';
import { findPatches, surfaceNormals, erodeCortex } from '../src/patches.js';
import { mapCortex, readCortexAtlas } from '../src/cortex-atlas.js';
import { triangleVoxelMask } from '../src/analysis-qc.js';
const input = JSON.parse(await readFile(process.argv[2], 'utf8'));
const white = Float64Array.from(input.white.flat());
const pial = Float64Array.from(input.pial.flat());
const faces = Int32Array.from(input.faces.flat());
const { middle, normals } = surfaceNormals(white, pial, faces);
let eligible = Uint8Array.from(input.eligible || Array(white.length / 3).fill(1));
if (input.atlas) {
  const bytes = await readFile(input.atlas);
  const atlas = readCortexAtlas(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  eligible = mapCortex(Float64Array.from(input.registration.flat()), atlas, input.hemisphere);
  eligible = erodeCortex(middle, faces, eligible);
  for (let i = 0; i < eligible.length; i += 1) {
    if (Math.hypot(...[0, 1, 2].map((a) => pial[i * 3 + a] - white[i * 3 + a])) < 0.5) eligible[i] = 0;
  }
}
const patches = findPatches(middle, faces, eligible, input.options);
const result = { normals: Array.from(normals), patches, eligible: Array.from(eligible) };
if (input.volume) {
  const volume = { ...input.volume, data: new Float32Array(input.volume.dims.reduce((a, b) => a * b, 1)) };
  result.mask = Array.from(triangleVoxelMask(volume, middle, faces));
}
process.stdout.write(JSON.stringify(result));
