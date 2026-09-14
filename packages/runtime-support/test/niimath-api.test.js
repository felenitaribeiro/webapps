import assert from 'node:assert/strict';
import test from 'node:test';
import { Niimath } from '../src/niimath/index.js';

test('niimath stages mask operands and releases its worker', async () => {
  let terminated = false;
  const OriginalWorker = globalThis.Worker;
  globalThis.Worker = class {
    constructor() {
      queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } }));
    }

    terminate() {
      terminated = true;
    }
  };
  try {
    const niimath = new Niimath();
    await niimath.init();
    const operation = niimath.image(new File([Uint8Array.of(1)], 'source.nii')).maskImage(new File([Uint8Array.of(1)], 'mask.nii'));
    assert.deepEqual(operation.commands.slice(0, 2), ['-mas', '__nimx0_mask.nii']);
    assert.equal(operation.extraFiles[0].data.name, 'mask.nii');
    niimath.dispose();
    assert.equal(terminated, true);
  } finally {
    globalThis.Worker = OriginalWorker;
  }
});
