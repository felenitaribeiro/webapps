import NiiVue, { SHOW_RENDER, SLICE_TYPE } from '@niivue/niivue';
import '@neurodesk/webapp-components/styles/imaging-workspace.css';
import { readImageFiles } from '@neurodesk/runtime-support/dcm2niix-client';
import { mountImagingWorkspace } from '@neurodesk/webapp-components/core/mount-imaging-workspace';
import { downloadFile } from '@neurodesk/webapp-components/file-io';
import {
  StageResultList,
  bindFileDrop,
  createInfoDialog,
  renderConsole,
  renderViewerToolbar,
} from '@neurodesk/webapp-components/ui';
import manifest from '@neurodesk/topofit/manifest';

const $ = (id) => document.getElementById(id);
const assetBase = import.meta.env.VITE_TOPOFIT_ASSET_BASE || manifest.base_url;
mountImagingWorkspace({
  controls: '#controls',
  viewer: '#viewer',
  status: '#status',
  title: 'TopoFit',
  subtitle: 'Cortical surfaces, locally in your browser',
  mark: 'T',
  controlsContract: { about: '#aboutBtn', privacy: '#privacyBtn' },
});
const log = renderConsole({ id: 'technicalLog' });
$('viewer').append(log.root);
const info = createInfoDialog({ id: 'infoDialog' });
$('aboutBtn').onclick = () => info.open('About TopoFit', $('aboutContent'));
$('privacyBtn').onclick = () => info.open('Privacy', $('privacyContent'));

let viewer;
let viewerReady;
let source;
let worker;
let busy = false;
let outputs = new Map();
let importedImages = [];
let timer;
let started;
let surfaceAnalysis;

const toolbar = renderViewerToolbar({
  window: false,
  overlay: false,
  colormap: false,
  download: false,
  screenshot: false,
  views: [
    { id: 'multiplanar', label: '3-Plane', active: true },
    { id: 'render', label: '3D' },
  ].map((view) => ({
    ...view,
    onClick: () => {
      if (!viewer) return;
      viewer.sliceType = view.id === 'render' ? SLICE_TYPE.RENDER : SLICE_TYPE.MULTIPLANAR;
      viewer.drawScene();
      toolbar.setActive(view.id);
    },
  })),
});
$('viewer').prepend(toolbar.root);

const results = new StageResultList({
  element: $('resultList'),
  stageLabels: {
    qc: 'Source-grid QC overlay',
    'lh-white': 'Left white surface',
    'rh-white': 'Right white surface',
    'lh-pial': 'Left pial surface',
    'rh-pial': 'Right pial surface',
    'lh-registration': 'Left registration sphere',
    'rh-registration': 'Right registration sphere',
    provenance: 'Processing manifest',
    'lh-normals': 'Left mid-surface normals',
    'rh-normals': 'Right mid-surface normals',
    'patch-qc': 'Cortical patches and normals',
    'patch-geometry': 'Paired patch geometry and local normals',
    'surface-analysis': 'Surface analysis measurements',
  },
  onView: (stage) => void showResult(stage),
  onDownload: (stage) => {
    const file = outputs.get(stage);
    if (file) downloadFile(file);
  },
});

function status(message, error = false) {
  $('statusText').textContent = message;
  $('statusText').classList.toggle('error', error);
  log.log(message, error ? 'error' : 'info');
}

function setBusy(value) {
  busy = value;
  for (const input of $('controls').querySelectorAll('input, select')) input.disabled = value;
  $('exampleButton').disabled = value;
  $('runButton').disabled = value || !source;
  $('cancelButton').hidden = !value;
  if (!value) clearInterval(timer);
}

async function ensureViewer() {
  if (!viewerReady) {
    viewerReady = (async () => {
      viewer = new NiiVue({ isDragDropEnabled: false, backgroundColor: [0.04, 0.06, 0.08, 1] });
      await viewer.attachTo('gl1');
      viewer.sliceType = SLICE_TYPE.MULTIPLANAR;
      viewer.showRender = SHOW_RENDER.ALWAYS;
      viewer.createExtensionContext().on('locationChange', (event) => {
        $('location').textContent = event.detail.string;
      });
      return viewer;
    })();
  }
  return viewerReady;
}

async function showSource() {
  const nv = await ensureViewer();
  await nv.loadVolumes([{ url: source, name: source.name }]);
  for (const mesh of [...nv.meshes]) nv.removeMesh(mesh);
  nv.drawScene();
  $('emptyState').hidden = true;
  $('imageLabel').textContent = 'ORIGINAL IMAGE';
}

async function showResult(stage) {
  const file = outputs.get(stage);
  if (!file) return;
  if (file.type === 'application/json' || file.type === 'text/csv') {
    const content = document.createElement('pre');
    content.className = 'nd-console-output';
    const text = await file.text();
    content.textContent = text.length > 16000 ? `${text.slice(0, 16000)}\n\nPreview truncated. Download the complete file.` : file.type === 'application/json' ? JSON.stringify(JSON.parse(text), null, 2) : text;
    info.open(results.stageLabels[stage] || file.name, content, { wide: true });
    return;
  }
  try {
    const nv = await ensureViewer();
    for (const mesh of [...nv.meshes]) nv.removeMesh(mesh);
    if (stage === 'qc' || stage === 'patch-qc') {
      const overlay = stage === 'patch-qc' ? { colormap: 'hot', calMin: 1, calMax: 4095, isTransparentBelowCalMin: true } : {};
      await nv.loadVolumes([{ url: source, name: source.name }, { url: file, name: file.name, opacity: 0.75, ...overlay }]);
      nv.sliceType = SLICE_TYPE.MULTIPLANAR;
      $('imageLabel').textContent = stage === 'patch-qc' ? 'PATCHES · WHITE 2400 · PIAL 2700 · MID 3000 · NORMAL 4095' : 'ORIGINAL IMAGE · TOPOFIT QC';
      toolbar.setActive('multiplanar');
      const firstPatch = stage === 'patch-qc' && Object.values(surfaceAnalysis?.flat_patches || {})[0];
      if (firstPatch) nv.setCrosshairPos(firstPatch.center_ras_mm);
    } else {
      const registration = stage.includes('registration');
      if (registration) await nv.loadVolumes([]);
      else await nv.loadVolumes([{ url: source, name: source.name }]);
      const meshFile = registration ? new File([file], `${file.name}.sphere`, { type: file.type }) : file;
      await nv.loadMeshes([{ url: meshFile, name: file.name }]);
      nv.sliceType = registration ? SLICE_TYPE.RENDER : SLICE_TYPE.MULTIPLANAR;
      $('imageLabel').textContent = file.name.toUpperCase();
      toolbar.setActive(registration ? 'render' : 'multiplanar');
      const patch = surfaceAnalysis?.flat_patches?.[stage];
      if (patch) {
        nv.setCrosshairPos(patch.center_ras_mm);
        $('imageLabel').textContent = `${stage} · ${patch.area_mm2.toFixed(1)} mm² · RMS ${patch.rms_distance_mm.toFixed(3)} mm`;
      }
    }
    nv.drawScene();
    $('viewerError').hidden = true;
  } catch (error) {
    $('viewerError').hidden = false;
    $('viewerError').textContent = `Visualization unavailable: ${error.message}. Downloads remain available.`;
  }
}

async function load(file) {
  if (!file || busy) return;
  setBusy(true);
  try {
    if (!/\.nii(\.gz)?$/i.test(file.name)) throw new Error('Choose a .nii or .nii.gz image.');
    source = file;
    outputs = new Map();
    $('outputSection').open = false;
    $('fileInfo').hidden = false;
    $('fileInfo').textContent = file.name;
    $('dropZone').classList.add('has-files');
    $('progress').value = 0;
    await showSource();
    status('Image loaded · ready to reconstruct');
  } catch (error) {
    status(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function importFiles(filesPromise) {
  if (busy) return;
  setBusy(true);
  status('Reading images · converting DICOM if needed…');
  try {
    const images = await readImageFiles(await filesPromise);
    if (!images.length) throw new Error('Choose a NIfTI image or complete DICOM series.');
    importedImages = images;
    $('seriesSelect').replaceChildren(...images.map((file, index) => new Option(file.name, String(index))));
    $('seriesSelect').hidden = images.length < 2;
    setBusy(false);
    await load(images[0]);
  } catch (error) {
    status(error.message, true);
    setBusy(false);
  }
}

$('imageInput').onchange = () => {
  const files = Array.from($('imageInput').files);
  $('imageInput').value = '';
  if (files.length) void importFiles(Promise.resolve(files));
};
$('seriesSelect').onchange = () => void load(importedImages[Number($('seriesSelect').value)]);
bindFileDrop($('dropZone'), (files) => void importFiles(files));
$('exampleButton').onclick = async () => {
  if (busy) return;
  setBusy(true);
  status('Downloading OpenNeuro example…');
  try {
    const response = await fetch(manifest.validation.example_url);
    if (!response.ok) throw new Error('The example image could not be downloaded.');
    const bytes = await response.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (value) =>
      value.toString(16).padStart(2, '0'),
    ).join('');
    if (digest !== manifest.validation.example_sha256) {
      throw new Error('The example image checksum did not match the validated scan.');
    }
    setBusy(false);
    await load(new File([bytes], 'sub-01_T1w.nii.gz', { type: 'application/gzip' }));
  } catch (error) {
    status(error.message, true);
    setBusy(false);
  }
};

$('findPatches').onchange = () => { $('patchSettings').hidden = !$('findPatches').checked; };
$('patchRegion').onchange = () => { $('patchRoiField').hidden = $('patchRegion').value !== 'roi'; };

$('runButton').onclick = async () => {
  if (!source || busy) return;
  if ($('findPatches').checked) {
    const invalid = [...$('surfaceAnalysisSettings').querySelectorAll('input[type="number"]')].find((input) => !input.checkValidity());
    if (invalid) {
      for (let section = invalid.closest('details'); section; section = section.parentElement.closest('details')) section.open = true;
      invalid.reportValidity();
      return;
    }
  }
  let roiBuffer;
  if ($('findPatches').checked && $('patchRegion').value === 'roi') {
    setBusy(true);
    try {
      const images = await readImageFiles(Array.from($('patchRoi').files));
      if (images.length !== 1) throw new Error('Choose one ROI mask on the input image grid.');
      roiBuffer = await images[0].arrayBuffer();
    } catch (error) {
      $('surfaceAnalysisSettings').open = true;
      $('patchQuality').open = true;
      status(error.message, true);
      setBusy(false);
      return;
    }
  }
  outputs = new Map();
  setBusy(true);
  $('progress').value = 0;
  started = performance.now();
  timer = setInterval(() => {
    $('elapsed').textContent = `${Math.round((performance.now() - started) / 1000)} s`;
  }, 1000);
  worker = new Worker(new URL('./inference-worker.js', import.meta.url), { type: 'module' });
  const active = worker;
  worker.onmessage = async ({ data }) => {
    if (worker !== active) return;
    if (data.type === 'progress') {
      $('progress').value = data.value;
      status(data.message);
    }
    if (data.type === 'error') {
      active.terminate();
      worker = null;
      setBusy(false);
      status(data.message, true);
    }
    if (data.type === 'result') {
      surfaceAnalysis = data.provenance.surfaceAnalysis;
      for (const output of data.files) outputs.set(output.id, new File([output.bytes], output.name, { type: output.mediaType }));
      results.render(Object.fromEntries([...outputs].map(([id]) => [id, {}])));
      $('outputSection').open = true;
      $('progress').value = 1;
      active.terminate();
      worker = null;
      setBusy(false);
      status(`Surfaces ready · ${data.provenance.surfaceVertices.toLocaleString()} vertices per hemisphere · ${Math.round(data.elapsedSeconds)} s`);
      if (surfaceAnalysis?.flat_patch_status === 'NO_PATCH_MEETS_CRITERIA') status('Surfaces ready · no cortical patch meets the selected criteria');
      await showResult(outputs.has('patch-qc') ? 'patch-qc' : 'qc');
    }
  };
  worker.onerror = (event) => {
    active.terminate();
    worker = null;
    setBusy(false);
    status(`Reconstruction stopped: ${event.message || 'worker failure'}`, true);
  };
  worker.postMessage({
    file: source,
    model: $('model').value,
    conform: $('conform').checked,
    overlayThickness: Number($('thickness').value),
    estimateNormals: $('estimateNormals').checked,
    patches: $('findPatches').checked ? {
      count: Number($('patchCount').value),
      radius: Number($('patchRadius').value),
      hemisphere: $('patchHemisphere').value,
      maxRms: Number($('patchMaxRms').value),
      minAreaFraction: Number($('patchMinArea').value),
    } : null,
    roiBuffer,
    assetBase,
  });
};

$('cancelButton').onclick = () => {
  worker?.terminate();
  worker = null;
  setBusy(false);
  $('progress').value = 0;
  status('Reconstruction cancelled. Your original image is unchanged.');
};
window.addEventListener('pagehide', () => worker?.terminate());
