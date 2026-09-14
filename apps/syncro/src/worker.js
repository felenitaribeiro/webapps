import { createRegistration } from '@neurodesk/registration';
import { gzip, gunzip, isGzip, loadGreedy, registerAffineGreedy, registerGreedy, resliceAffineGreedy, resliceGreedy } from '@neurodesk/greedy';
import { Niimath } from '@neurodesk/runtime-support/niimath';
import { runSyncro } from '../../../packages/syncro/src/pipeline.js';

const sha = async (buffer) => Array.from(
  new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)),
  (value) => value.toString(16).padStart(2, '0'),
).join('');
const progress = (stage, value, message) => self.postMessage({ type: 'progress', stage, value, message });

// A fresh worker per neural network releases ORT's WebAssembly arena between stages.
function infer(job, onProgress) {
  return new Promise((resolve, reject) => {
    const child = new Worker(new URL('./inference-worker.js', import.meta.url), { type: 'module' });
    const finish = (error, result) => {
      child.terminate();
      error ? reject(error) : resolve(result);
    };
    child.onerror = (event) => finish(new Error(event.message || 'Inference worker failed.'));
    child.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress(data.value, data.message);
      else if (data.type === 'log') self.postMessage(data);
      else if (data.type === 'error') finish(new Error(data.message));
      else if (data.type === 'result') finish(null, data.result);
    };
    child.postMessage(job);
  });
}

async function representation(buffer, compressed) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (compressed) return isGzip(bytes) ? bytes.slice() : gzip(bytes);
  return gunzip(bytes);
}

function createImageMath() {
  const niimath = new Niimath();
  let ready;
  const init = async () => {
    if (!ready) ready = niimath.init();
    await ready;
  };
  return {
    async smoothLesion({ buffer, name }) {
      await init();
      niimath.setOutputDataType('float');
      const file = new File([buffer], name);
      return new Uint8Array(await (await niimath.image(file).s(3 / 2.354820045).gz(0).run('lesion-smoothed.nii')).arrayBuffer());
    },
    async thresholdLesion({ buffer, name }) {
      await init();
      niimath.setOutputDataType('char');
      const compressed = name.toLowerCase().endsWith('.gz');
      const file = new File([buffer], name);
      return new Uint8Array(await (await niimath.image(file).thr(0.5).bin().gz(compressed ? 1 : 0).run(name)).arrayBuffer());
    },
    async mask({ image, mask, name }) {
      await init();
      niimath.setOutputDataType('input');
      const compressed = name.toLowerCase().endsWith('.gz');
      const source = new File([image], `source-${name}`);
      const brain = new File([mask], `mask-${name}`);
      return new Uint8Array(await (await niimath.image(source).maskImage(brain).gz(compressed ? 1 : 0).run(name)).arrayBuffer());
    },
    dispose() {
      niimath.dispose();
    },
  };
}

function createGreedyLoader(moduleURL) {
  let promise;
  return () => {
    if (!promise) {
      const threads = Math.min(8, navigator.hardwareConcurrency || 1);
      self.postMessage({ type: 'log', message: `Starting ${threads} Greedy CPU workers` });
      promise = loadGreedy(moduleURL, threads);
    }
    return promise;
  };
}

function greedyRegistration(load) {
  let fixed;
  return {
    provenance: { engine: 'Greedy', method: 'affine + NMI stationary velocity field', threads: Math.min(8, navigator.hardwareConcurrency || 1) },
    async registerAffine({ fixed: affineFixed, moving }) {
      const api = await load();
      return registerAffineGreedy({ api, fixed: affineFixed, moving });
    },
    async register({ fixed: registrationFixed, moving, compressed }) {
      const api = await load();
      fixed = new Uint8Array(registrationFixed);
      const result = registerGreedy({
        api,
        fixed,
        moving,
        mode: 'deformable',
        onProgress: (message) => progress('registration', null, message),
      });
      return {
        matrix: result.matrix,
        warp: result.warp,
        warped: await representation(result.image, compressed),
      };
    },
    async apply({ registration, moving, compressed, interpolation, fill, precedingMatrix }) {
      const api = await load();
      const output = resliceGreedy({ api, fixed, moving, registration, precedingMatrix, interpolation, fill });
      return representation(output, compressed);
    },
    release() {},
  };
}

function antsRegistration(loadGreedyApi, moduleURL) {
  let engine;
  return {
    provenance: { engine: 'ANTs 2.6.2', method: 'SyN', seed: 42, precision: 'float', threads: 1 },
    async registerAffine({ fixed, moving }) {
      const api = await loadGreedyApi();
      return registerAffineGreedy({ api, fixed, moving });
    },
    async register({ fixed, moving, compressed }) {
      const { default: createModule } = await import(/* @vite-ignore */ moduleURL);
      engine = await createRegistration({ createModule, onLog: (message) => self.postMessage({ type: 'log', message }) });
      const result = engine.register({ fixed, moving });
      return { ...result, warped: await representation(result.warped, compressed) };
    },
    async apply({ registration, moving, compressed, interpolation, fill, precedingMatrix, precedingFixed }) {
      let prepared = moving;
      if (precedingMatrix) {
        const api = await loadGreedyApi();
        prepared = resliceAffineGreedy({ api, fixed: precedingFixed, moving, matrix: precedingMatrix, interpolation, fill });
      }
      return representation(engine.apply({ registration, moving: prepared, interpolation, fill }), compressed);
    },
    release(registration) {
      engine.release(registration);
    },
  };
}

self.onmessage = async ({ data: job }) => {
  const imageMath = createImageMath();
  try {
    if (!self.crossOriginIsolated) throw new Error('Reload this page to enable isolated WebAssembly processing.');
    const templateResponse = await fetch(job.templateURL);
    if (!templateResponse.ok) throw new Error('Could not load the MNI template.');
    const template = await templateResponse.arrayBuffer();
    // Some static servers mark .nii.gz as Content-Encoding: gzip, so fetch
    // returns the decompressed NIfTI. Both representations are independently pinned.
    const templateHash = await sha(template);
    const templateRepresentations = {
      '32d5be33460f995a5d305507053c8862c823d9ca6bfb543381308df14590f212': 3219212,
      '18576c0190c0f6496f3d4a6bf40cfd6e9cddb4b6eaa8517bb0af2b88ff67c0c5': 14442416,
    };
    if (templateRepresentations[templateHash] !== template.byteLength) throw new Error('MNI template checksum mismatch.');
    const input = await job.input.arrayBuffer();
    const lesion = job.lesion ? { name: job.lesion.name, buffer: await job.lesion.arrayBuffer() } : null;
    const pathological = job.pathological ? { name: job.pathological.name, buffer: await job.pathological.arrayBuffer() } : null;
    const loadGreedyApi = createGreedyLoader(job.greedyURL);
    const registration = job.normalization === 'ants'
      ? antsRegistration(loadGreedyApi, job.registrationURL)
      : greedyRegistration(loadGreedyApi);
    const result = await runSyncro({
      input,
      inputName: job.input.name,
      lesion,
      pathological,
      ct: job.ct,
      keepSynth: job.keepSynth,
      template,
      brainExtractor: job.brainExtractor,
      normalization: job.normalization,
      synthesize: (args) => infer({ stage: 'synthsr', buffer: args.buffer, ct: job.ct, backend: job.synthsrBackend ?? 'webgpu', modelBase: job.modelBase }, args.onProgress),
      extractBrain: (args) => infer(job.brainExtractor === 'mindgrab'
        ? { stage: 'mindgrab', volume: args.volume, assetPath: job.mindgrabAssetPath }
        : { stage: 'synthstrip', volume: args.volume, modelBase: job.modelBase }, args.onProgress),
      registration,
      imageMath,
      represent: ({ buffer, compressed }) => representation(buffer, compressed),
      onProgress: progress,
    });
    result.provenance.templateHash = await sha(template);
    result.provenance.inputHash = await sha(input);
    result.outputs['provenance.json'] = new TextEncoder().encode(`${JSON.stringify(result.provenance, null, 2)}\n`);
    self.postMessage({ type: 'result', ...result }, [...new Set(Object.values(result.outputs).map((bytes) => bytes.buffer))]);
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || String(error) });
  } finally {
    imageMath.dispose();
  }
};
