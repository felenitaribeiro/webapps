import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

await import("../scripts/copy-runtime.mjs");

test("the Vite dev server exposes every FireANTs runtime asset", async () => {
  const server = await createServer({
    configFile: fileURLToPath(new URL("../vite.config.js", import.meta.url)),
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0 },
  });
  try {
    await server.listen(0);
    const base = server.resolvedUrls.local[0];
    for (const path of ["cfireants/cfireants-mt.js", "cfireants/cfireants.js", "cfireants/cfireants-gpu.js", "cfireants/worker.js"]) {
      const response = await fetch(new URL(path, base));
      assert.equal(response.ok, true, `${path} returned ${response.status}`);
      assert.match(response.headers.get("content-type"), /javascript/);
      assert.doesNotMatch(await response.text(), /<!doctype html>/i);
    }
    for (const path of ["cfireants/cfireants-mt.wasm", "cfireants/cfireants.wasm", "cfireants/cfireants-gpu.wasm"]) {
      const response = await fetch(new URL(path, base));
      assert.equal(response.ok, true, `${path} returned ${response.status}`);
      assert.deepEqual([...new Uint8Array(await response.arrayBuffer()).slice(0, 4)], [0, 97, 115, 109]);
    }
  } finally {
    await server.close();
  }
});
