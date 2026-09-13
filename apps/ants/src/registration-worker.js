import { createRegistration } from "@neurodesk/registration";

let enginePromise;

// ANTs reads its inputs by file name, so gzipped NIfTI is inflated before it is written as .nii.
async function gunzip(bytes) {
  const input = new Uint8Array(bytes);
  if (input.length < 2 || input[0] !== 0x1f || input[1] !== 0x8b) return input;
  return new Uint8Array(await new Response(new Blob([input]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
}

function engine() {
  if (!enginePromise) {
    enginePromise = import(/* @vite-ignore */ new URL("../registration/syncro-registration.mjs", self.location.href).href)
      .then(({ default: createModule }) => createRegistration({ createModule, onLog: (message) => self.postMessage({ log: message }) }));
  }
  return enginePromise;
}

self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ phase: "Loading the ANTs WebAssembly kernel" });
    const ants = await engine();
    self.postMessage({ phase: "Preparing NIfTI images" });
    const [fixed, moving] = await Promise.all([gunzip(data.fixed), gunzip(data.moving)]);
    self.postMessage({ phase: "Registering with ANTs SyN (affine, then diffeomorphic)" });
    const result = ants.register({ fixed, moving });
    const transforms = Object.fromEntries(Object.entries(result.transforms).map(([name, bytes]) => [name, bytes.slice().buffer]));
    const image = result.warped.slice().buffer;
    ants.release(result);
    self.postMessage({ image, transforms }, [image, ...Object.values(transforms)]);
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
