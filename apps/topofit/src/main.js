import NiiVue, { SHOW_RENDER, SLICE_TYPE } from '@niivue/niivue';
import '@neurodesk/webapp-components/styles/imaging-workspace.css';
import { readImageFiles } from '@neurodesk/runtime-support/dcm2niix-client';
import { mountImagingWorkspace } from '@neurodesk/webapp-components/core/mount-imaging-workspace';
import { createElement } from '@neurodesk/webapp-components/core';
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
let meshSceneReady = false;
let meshSpace;
const loadedMeshes = new Map();
const visibleMeshes = new Set();
const stageLabels = {
  qc: 'Source-grid QC overlay',
  'lh-white': 'Left white surface',
  'rh-white': 'Right white surface',
  'lh-pial': 'Left pial surface',
  'rh-pial': 'Right pial surface',
  'lh-registration': 'Left registration sphere',
  'rh-registration': 'Right registration sphere',
  provenance: 'Processing manifest',
};
const meshColors = {
  'lh-white': [0.35, 0.7, 1, 1],
  'rh-white': [1, 0.7, 0.3, 1],
  'lh-pial': [0.15, 0.35, 1, 1],
  'rh-pial': [1, 0.25, 0.15, 1],
  'lh-registration': [0.35, 0.7, 1, 1],
  'rh-registration': [1, 0.7, 0.3, 1],
};
const xrayValue = createElement('span', { id: 'meshXRayValue', text: '10%' });
const xrayInput = createElement('input', {
  id: 'meshXRay',
  type: 'range',
  min: 0,
  max: 1,
  step: 0.05,
  value: 0.1,
  'aria-label': 'Mesh X-ray',
  oninput: (event) => {
    const value = Number(event.currentTarget.value);
    xrayValue.textContent = `${Math.round(value * 100)}%`;
    if (viewer) viewer.meshXRay = value;
  },
});
const xrayControl = createElement('label', { className: 'nd-opacity-control', hidden: true }, [
  'X-ray',
  xrayInput,
  xrayValue,
]);

const toolbar = renderViewerToolbar({
  window: false,
  overlay: false,
  colormap: false,
  download: false,
  screenshot: false,
  actions: [xrayControl],
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
  stageLabels,
  onView: (stage) => void showResult(stage),
  onVisibilityChange: (stage, visible, _result, input) => void setMeshVisible(stage, visible, input),
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
  for (const id of ['imageInput', 'seriesSelect', 'exampleButton', 'model', 'conform', 'thickness']) $(id).disabled = value;
  $('runButton').disabled = value || !source;
  $('cancelButton').hidden = !value;
  if (!value) clearInterval(timer);
}

async function ensureViewer() {
  if (!viewerReady) {
    viewerReady = (async () => {
      viewer = new NiiVue({
        isDragDropEnabled: false,
        backgroundColor: [0.04, 0.06, 0.08, 1],
        meshXRay: Number(xrayInput.value),
      });
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

async function resetMeshes(nv, preservedInput) {
  await nv.removeAllMeshes();
  loadedMeshes.clear();
  visibleMeshes.clear();
  meshSceneReady = false;
  meshSpace = undefined;
  xrayControl.hidden = true;
  for (const input of $('resultList').querySelectorAll('.nd-result-visibility input')) {
    if (input !== preservedInput) input.checked = false;
  }
}

async function showSource() {
  const nv = await ensureViewer();
  await resetMeshes(nv);
  await nv.loadVolumes([{ url: source, name: source.name }]);
  nv.drawScene();
  $('emptyState').hidden = true;
  $('imageLabel').textContent = 'ORIGINAL IMAGE';
}

async function setMeshVisible(stage, visible, input) {
  const file = outputs.get(stage);
  if (!file || !Object.hasOwn(meshColors, stage)) return;
  input.disabled = true;
  try {
    const nv = await ensureViewer();
    const requestedSpace = stage.includes('registration') ? 'registration' : 'anatomical';
    if (visible && meshSceneReady && meshSpace !== requestedSpace) await resetMeshes(nv, input);
    const firstVisible = visible && visibleMeshes.size === 0;
    if (!meshSceneReady) {
      await nv.removeAllMeshes();
      await nv.loadVolumes(requestedSpace === 'registration' ? [] : [{ url: source, name: source.name }]);
      loadedMeshes.clear();
      visibleMeshes.clear();
      meshSceneReady = true;
      meshSpace = requestedSpace;
    }
    if (!loadedMeshes.has(stage)) {
      const index = nv.meshes.length;
      await nv.addMesh({ url: file, name: file.name, color: meshColors[stage], visible });
      loadedMeshes.set(stage, index);
    } else {
      await nv.setMesh(loadedMeshes.get(stage), { visible });
    }
    if (visible) visibleMeshes.add(stage);
    else visibleMeshes.delete(stage);
    input.checked = visible;
    if (firstVisible) {
      nv.sliceType = SLICE_TYPE.RENDER;
      toolbar.setActive('render');
    }
    xrayControl.hidden = visibleMeshes.size === 0;
    $('imageLabel').textContent = visibleMeshes.size
      ? Object.keys(meshColors).filter((id) => visibleMeshes.has(id)).map((id) => stageLabels[id]).join(' · ').toUpperCase()
      : 'ORIGINAL IMAGE';
    nv.drawScene();
    $('emptyState').hidden = true;
    $('viewerError').hidden = true;
  } catch (error) {
    input.checked = !visible;
    $('viewerError').hidden = false;
    $('viewerError').textContent = `Visualization unavailable: ${error.message}. Downloads remain available.`;
  } finally {
    input.disabled = false;
  }
}

async function showResult(stage) {
  const file = outputs.get(stage);
  if (!file) return;
  if (stage === 'provenance') {
    const content = document.createElement('pre');
    content.className = 'nd-console-output';
    content.textContent = await file.text();
    info.open('Processing manifest', content, { wide: true });
    return;
  }
  if (stage !== 'qc') return;
  try {
    const nv = await ensureViewer();
    await resetMeshes(nv);
    await nv.loadVolumes([{ url: source, name: source.name }, { url: file, name: file.name, opacity: 0.75 }]);
    nv.sliceType = SLICE_TYPE.MULTIPLANAR;
    $('imageLabel').textContent = 'ORIGINAL IMAGE · TOPOFIT QC';
    toolbar.setActive('multiplanar');
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
    results.render();
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

$('runButton').onclick = () => {
  if (!source || busy) return;
  outputs = new Map();
  results.render();
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
      for (const output of data.files) outputs.set(output.id, new File([output.bytes], output.name, { type: output.mediaType }));
      results.render(Object.fromEntries([...outputs].map(([id]) => [
        id,
        Object.hasOwn(meshColors, id) ? { visible: false } : {},
      ])));
      $('outputSection').open = true;
      $('progress').value = 1;
      active.terminate();
      worker = null;
      setBusy(false);
      status(`Surfaces ready · ${data.provenance.surfaceVertices.toLocaleString()} vertices per hemisphere · ${Math.round(data.elapsedSeconds)} s`);
      await showResult('qc');
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
