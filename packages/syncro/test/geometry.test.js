import assert from 'node:assert/strict';
import test from 'node:test';
import { compatibleMaskGeometry, prepareAdditional, readAdditional, runSyncro, sameGeometry, thresholdBinary } from '../src/pipeline.js';
import { writeVolume } from '../../synthsr/src/index.js';

const affine = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
];
const volume = {
  dims: [5, 5, 5],
  affine,
  data: Float32Array.from({ length: 125 }, (_, index) => index + 1),
};
const lesion = { ...volume, data: new Uint8Array(125) };

test('matching dimensions cannot hide a different physical frame', () => {
  const moved = { ...volume, affine: affine.map((row) => row.slice()) };
  moved.affine[0][3] = 1;
  assert.equal(sameGeometry(volume, moved), false);
});

test('mask geometry accepts a one-voxel border but rejects a different frame', () => {
  const border = { ...lesion, dims: [4, 5, 5], affine: affine.map((row) => row.slice()) };
  border.affine[0][3] = 1;
  assert.equal(compatibleMaskGeometry(volume, border), true);
  border.affine[0][3] = 2;
  assert.equal(compatibleMaskGeometry(volume, border), false);
});

test('empty lesion remains empty after propagation threshold', () => {
  assert.equal(thresholdBinary(lesion).data.some(Boolean), false);
});

test('lesion validation rejects more than two intensity levels', () => {
  const encoded = new ArrayBuffer(352 + 125 * 8);
  new Uint8Array(encoded, 0, 352).set(new Uint8Array(writeVolume(volume), 0, 352));
  const raw = new DataView(encoded);
  raw.setInt16(70, 64, true);
  raw.setInt16(72, 64, true);
  raw.setFloat64(352, 1.000000001, true);
  raw.setFloat64(360, 0.5, true);
  assert.throws(() => readAdditional(encoded, 'binary'), /two discrete values/);
});

test('lesion maps use native SYNcro two-level scaling', () => {
  const encoded = writeVolume({ ...lesion, data: Uint8Array.from(lesion.data, (_, index) => index === 62 ? 255 : 0) });
  const decoded = readAdditional(encoded, 'binary');
  assert.equal(decoded.data[0], 0);
  assert.equal(decoded.data[62], 1);
});

test('constant foreground lesion maps remain foreground', () => {
  const encoded = writeVolume({ ...lesion, data: new Uint8Array(lesion.data.length).fill(1) });
  assert.equal(readAdditional(encoded, 'binary').data.every((value) => value === 1), true);
});

test('primary and pathological scans reject ordinary two-level masks', async () => {
  const source = writeVolume(volume);
  const mask = writeVolume({ ...lesion, data: Uint8Array.from(lesion.data, (_, index) => index === 62 ? 255 : 0) });
  let called = false;
  const common = {
    template: source,
    synthesize() {
      called = true;
    },
  };
  await assert.rejects(runSyncro({ ...common, input: mask, inputName: 'primary.nii' }), /primary scan.*binary mask/i);
  await assert.rejects(runSyncro({ ...common, input: source, inputName: 'primary.nii', pathological: { name: 'trace.nii', buffer: mask } }), /pathological modality.*binary mask/i);
  assert.equal(called, false);
});

test('duplicate native output names fail before inference', async () => {
  let called = false;
  await assert.rejects(runSyncro({
    input: writeVolume(volume),
    inputName: 'primary.nii',
    pathological: { name: 'bt1primary.nii', buffer: writeVolume(volume) },
    synthesize() {
      called = true;
    },
  }), /duplicate output names/);
  assert.equal(called, false);
});

test('lesion geometry errors fail before loading or executing models', async () => {
  const moved = { ...lesion, affine: affine.map((row) => row.slice()) };
  moved.affine[0][3] = 2;
  let called = false;
  await assert.rejects(runSyncro({
    input: writeVolume(volume),
    inputName: 'primary.nii',
    lesion: { name: 'lesion.nii', buffer: writeVolume(moved) },
    template: writeVolume(volume),
    synthesize() {
      called = true;
    },
  }), /must match/);
  assert.equal(called, false);
});

test('default pipeline matches command-line methods and output names', async () => {
  const source = writeVolume(volume);
  let extractor;
  let affineRegistrations = 0;
  const reslices = [];
  const registration = {
    provenance: { engine: 'Greedy' },
    registerAffine() {
      affineRegistrations += 1;
      return 'pathological-affine';
    },
    register({ moving }) {
      return { warped: new Uint8Array(moving), matrix: 'm', warp: Uint8Array.of(1) };
    },
    apply({ moving, fill, interpolation, precedingMatrix }) {
      reslices.push({ fill, interpolation, precedingMatrix });
      return new Uint8Array(moving);
    },
    release() {},
  };
  const imageMath = {
    smoothLesion: ({ buffer }) => new Uint8Array(buffer),
    thresholdLesion: ({ buffer }) => new Uint8Array(buffer),
    mask: ({ image }) => new Uint8Array(image),
  };
  const result = await runSyncro({
    input: source,
    inputName: 'primary.nii',
    pathological: { name: 'trace.nii', buffer: source },
    lesion: { name: 'lesion.nii', buffer: writeVolume(lesion) },
    template: source,
    keepSynth: true,
    synthesize: async () => ({ buffer: source, provenance: {} }),
    extractBrain: async ({ volume: inputVolume }) => {
      extractor = 'mindgrab';
      return { brain: inputVolume, mask: lesion, provenance: {} };
    },
    registration,
    imageMath,
  });
  assert.equal(extractor, 'mindgrab');
  assert.equal(result.provenance.normalization, 'greedy');
  assert.equal(affineRegistrations, 1);
  assert.deepEqual(reslices.map(({ fill }) => fill), [0, 0, 0]);
  assert.equal(reslices[2].interpolation, 'nearest');
  assert.equal(reslices[1].precedingMatrix, 'pathological-affine');
  assert.deepEqual(Object.keys(result.outputs), [
    't1primary.nii',
    'wbt1primary.nii',
    'wprimary.nii',
    'wtrace.nii',
    'wlesion.nii',
    'wbprimary.nii',
  ]);
});

test('CT reslicing uses the lower of zero and the source minimum', async () => {
  const ct = { ...volume, data: volume.data.slice() };
  ct.data[0] = -1024;
  const source = writeVolume(ct);
  let fill;
  await runSyncro({
    input: source,
    inputName: 'ct.nii',
    template: source,
    ct: true,
    synthesize: async () => ({ buffer: source, provenance: {} }),
    extractBrain: async ({ volume: inputVolume }) => ({ brain: inputVolume, provenance: {} }),
    registration: {
      provenance: {},
      register: ({ moving }) => ({ warped: new Uint8Array(moving), matrix: 'm', warp: Uint8Array.of(1) }),
      apply: ({ moving, fill: value }) => {
        fill ??= value;
        return new Uint8Array(moving);
      },
      release() {},
    },
  });
  assert.equal(fill, -1024);
});
