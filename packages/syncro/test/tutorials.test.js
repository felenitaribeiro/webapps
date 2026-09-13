import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchTutorial, tutorials, verifyTutorialAsset } from '../src/tutorials.js';

test('tutorial catalog covers the four native walkthroughs', () => {
  assert.deepEqual(Object.keys(tutorials), ['trace-t1', 'trace-only', 't1-only', 'ct-only']);
  assert.equal(tutorials['trace-t1'].pathological, 'sub-101_rec-TRACE_dwi.nii.gz');
  assert.equal(tutorials['ct-only'].ct, true);
  assert.equal(tutorials['ct-only'].keep_synth, true);
});

test('tutorial asset verification checks both bytes and digest', async () => {
  const bytes = new TextEncoder().encode('syncro');
  const asset = {
    bytes: bytes.byteLength,
    sha256: '012fd72db80029cec04938217cdbd1a420b9a40be9ed40f9968f924ba9aba297',
  };
  assert.equal(await verifyTutorialAsset(asset, bytes.buffer), true);
  assert.equal(await verifyTutorialAsset({ ...asset, bytes: 1 }, bytes.buffer), false);
  assert.equal(await verifyTutorialAsset({ ...asset, sha256: '0'.repeat(64) }, bytes.buffer), false);
});

test('unknown tutorials fail before requesting the network', async () => {
  let fetched = false;
  await assert.rejects(fetchTutorial('missing', {
    fetchImpl() {
      fetched = true;
    },
  }), /Unknown SYNcro tutorial/);
  assert.equal(fetched, false);
});

test('tutorial network errors identify the asset that could not download', async () => {
  await assert.rejects(fetchTutorial('trace-only', {
    fetchImpl() {
      throw new TypeError('Failed to fetch');
    },
  }), /Could not download tutorial image sub-101_rec-TRACE_dwi\.nii\.gz/);
});
