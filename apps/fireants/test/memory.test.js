import assert from "node:assert/strict";
import test from "node:test";
import { formatBytes, startMemorySampler } from "../src/memory.js";

test("memory sampler retains peak page and GPU-attributed estimates", async () => {
  const stop = startMemorySampler(async () => ({
    bytes: 1536 * 1024 * 1024,
    breakdown: [{ bytes: 256 * 1024 * 1024, types: ["GPU"] }],
  }));
  assert.deepEqual(await stop(), {
    bytes: 1536 * 1024 * 1024,
    gpuBytes: 256 * 1024 * 1024,
  });
  assert.equal(formatBytes(1536 * 1024 * 1024), "1.5 GiB");
});
