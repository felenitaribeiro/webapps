import { test, expect } from '@playwright/test';
import { writeFreeSurfer } from '../../../packages/topofit/src/results.js';
import { analyzeSurfaces } from '../../../packages/topofit/src/surface-analysis.js';
import { readVolume } from '../../../packages/topofit/src/volume.js';

function scan() {
  const buffer = Buffer.alloc(352 + 16 ** 3 * 4);
  buffer.writeInt32LE(348, 0);
  buffer.writeInt16LE(3, 40);
  for (let axis = 1; axis <= 3; axis += 1) {
    buffer.writeInt16LE(16, 40 + axis * 2);
    buffer.writeFloatLE(1, 76 + axis * 4);
  }
  buffer.writeInt16LE(16, 70);
  buffer.writeInt16LE(32, 72);
  buffer.writeFloatLE(352, 108);
  buffer.writeInt16LE(1, 254);
  buffer.writeFloatLE(1, 280);
  buffer.writeFloatLE(1, 300);
  buffer.writeFloatLE(1, 320);
  buffer.write('n+1\0', 344, 'ascii');
  for (let i = 0; i < 16 ** 3; i += 1) buffer.writeFloatLE(i % 16, 352 + i * 4);
  return { name: 'scan.nii', mimeType: 'application/nifti', buffer };
}

async function deliverSurfaces(page, analysisResult = { files: [], analysis: null }) {
  const surface = writeFreeSurfer(new Float32Array([2, 2, 2, 12, 2, 2, 2, 12, 2, 2, 2, 12]), new Int32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]));
  await page.addInitScript(({ bytes, qc, analysisFiles, analysis }) => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        this.fixture = String(url).includes('inference-worker');
      }
      postMessage(job, ...rest) {
        if (!this.fixture) return super.postMessage(job, ...rest);
        window.lastTopofitJob = job;
        for (let i = 0; i < 100; i += 1) this.onmessage({ data: { type: 'progress', value: i / 100, message: 'Loading topofit-t1w-1mm-white-order-6.onnx…' } });
        const files = ['lh', 'rh'].flatMap((h) => ['white', 'pial', 'registration'].map((s) => ({ id: `${h}-${s}`, name: `${h}.${s}`, mediaType: 'application/vnd.freesurfer.surface', bytes: Uint8Array.from(bytes).buffer })));
        files.push({ id: 'qc', name: 'qc.nii', mediaType: 'application/nifti', bytes: Uint8Array.from(qc).buffer });
        files.push(...analysisFiles.map((file) => ({ ...file, bytes: Uint8Array.from(file.bytes).buffer })));
        this.onmessage({ data: { type: 'result', files, provenance: { surfaceVertices: 4, surfaceAnalysis: analysis }, elapsedSeconds: 1 } });
      }
    };
  }, {
    bytes: Array.from(new Uint8Array(surface)),
    qc: Array.from(scan().buffer),
    analysis: analysisResult.analysis,
    analysisFiles: analysisResult.files.map((file) => ({ ...file, bytes: Array.from(new Uint8Array(file.bytes)) })),
  });
  await page.goto('/');
  await page.locator('#imageInput').setInputFiles(scan());
  await expect(page.locator('#runButton')).toBeEnabled();
  await page.locator('#runButton').click();
  await expect(page.locator('#outputSection')).toHaveAttribute('open', '');
  await expect(page.locator('#imageLabel')).toContainText(analysisResult.analysis ? 'PATCHES' : 'TOPOFIT QC');
}

test('all six surfaces load, anatomical views remain multiplanar, and repeated progress logs once', async ({ page }, testInfo) => {
  await deliverSurfaces(page);
  await expect(page.locator('.nd-console-message').filter({ hasText: 'Loading topofit-t1w-1mm-white-order-6.onnx' })).toHaveCount(1);
  for (const label of ['Left registration sphere', 'Right registration sphere', 'Left white surface', 'Left pial surface', 'Right white surface', 'Right pial surface']) {
    const row = page.locator('.nd-volume-toggle').filter({ hasText: label });
    if (label.includes('sphere')) await row.getByRole('button', { name: 'View', exact: true }).click();
    else await row.getByRole('checkbox').check();
    await expect(page.locator('#imageLabel')).toContainText(label.includes('sphere') ? 'REGISTRATION' : label.includes('white') ? 'WHITE' : 'PIAL');
    await expect(page.locator('#viewerError')).toBeHidden();
    await expect(page.locator('.nd-view-tab.active')).toHaveText(label.includes('sphere') ? '3D' : '3-Plane');
  }
  await page.screenshot({ path: testInfo.outputPath('surfaces-desktop.png') });
});

test('computed patches, local normals and QC can be viewed and downloaded', async ({ page }, testInfo) => {
  const white = [];
  const faces = [];
  for (let y = 0; y < 14; y += 1) {
    for (let x = 0; x < 14; x += 1) {
      white.push(x + 1, y + 1, 6);
      const i = x + y * 14;
      if (x < 13 && y < 13) faces.push(i, i + 1, i + 14, i + 1, i + 15, i + 14);
    }
  }
  const pial = Float64Array.from(white, (v, i) => i % 3 === 2 ? v + 2 : v);
  const vertices = {};
  for (const h of ['lh', 'rh']) {
    vertices[`${h}.white`] = Float64Array.from(white);
    vertices[`${h}.pial`] = pial;
    vertices[`${h}.registration`] = Float64Array.from(white, (_, i) => i % 3 === 0 ? 1 : 0);
  }
  const atlas = new ArrayBuffer(18);
  new DataView(atlas).setUint32(0, 1, true);
  new DataView(atlas).setFloat32(4, 1, true);
  new Uint8Array(atlas).set([1, 1], 16);
  const input = scan().buffer;
  const result = await analyzeSurfaces({
    source: readVolume(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)),
    vertices,
    faces: { lh: Int32Array.from(faces), rh: Int32Array.from(faces) },
    estimateNormals: true,
    patches: { hemisphere: 'lh', count: 1 },
    loadAtlas: async () => atlas,
  });
  expect(result.analysis.flat_patch_status).toBe('PATCHES_FOUND');
  await deliverSurfaces(page, result);
  expect(await page.locator('#controls').evaluate((controls) => {
    const right = controls.getBoundingClientRect().right;
    return [...controls.querySelectorAll('.nd-download-btn')].every((button) => button.getBoundingClientRect().right <= right);
  })).toBe(true);
  const patch = page.locator('.nd-volume-toggle').filter({ hasText: 'LH01' });
  await patch.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.locator('#imageLabel')).toContainText('LH01');
  const selected = result.analysis.flat_patches.LH01;
  await expect(page.locator('#location')).toContainText(selected.center_ras_mm.map(Math.round).join('×'));
  await expect(page.locator('#viewerError')).toBeHidden();
  await expect(page.locator('.nd-view-tab.active')).toHaveText('3-Plane');
  const normals = page.locator('.nd-volume-toggle').filter({ hasText: 'Left mid-surface normals' });
  await normals.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.locator('#infoDialog')).toContainText('nx_ras,ny_ras,nz_ras');
  await page.locator('#infoDialog').getByRole('button', { name: 'Close', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await normals.getByRole('button', { name: 'Download', exact: true }).click();
  expect((await downloading).suggestedFilename()).toBe('lh.mid.normals.csv');
  await page.screenshot({ path: testInfo.outputPath('computed-patch.png') });
});

test('surface-analysis controls preserve edited settings when collapsed and pass them to the worker', async ({ page }, testInfo) => {
  await deliverSurfaces(page);
  await page.locator('#surfaceAnalysisSettings > summary').click();
  await page.locator('#estimateNormals').check();
  await page.locator('#findPatches').check();
  await page.locator('#patchCount').fill('2');
  await page.locator('#patchRadius').fill('8');
  await page.locator('#patchHemisphere').selectOption('lh');
  await page.locator('#surfaceAnalysisSettings > summary').click();
  await page.locator('#surfaceAnalysisSettings > summary').click();
  await expect(page.locator('#patchRadius')).toHaveValue('8');
  await page.locator('#runButton').click();
  await expect.poll(() => page.evaluate(() => window.lastTopofitJob.patches)).toEqual({ count: 2, radius: 8, hemisphere: 'lh', maxRms: 0.5, minAreaFraction: 0.25 });
  expect(await page.evaluate(() => window.lastTopofitJob.estimateNormals)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('analysis-phone.png'), fullPage: true });
  await page.locator('.nd-app-bar [data-neurodesk-theme-toggle]').click();
  await page.screenshot({ path: testInfo.outputPath('analysis-phone-light.png'), fullPage: true, animations: 'disabled' });
});

test('invalid patch settings and a missing ROI are revealed before reconstruction', async ({ page }) => {
  await deliverSurfaces(page);
  await page.locator('#surfaceAnalysisSettings > summary').click();
  await page.locator('#findPatches').check();
  await page.locator('#patchCount').fill('0');
  await page.locator('#surfaceAnalysisSettings > summary').click();
  await page.locator('#runButton').click();
  await expect(page.locator('#surfaceAnalysisSettings')).toHaveAttribute('open', '');
  await expect(page.locator('#patchCount')).toBeFocused();
  await page.locator('#patchCount').fill('3');
  await page.locator('#patchQuality > summary').click();
  await page.locator('#patchRegion').selectOption('roi');
  await page.locator('#surfaceAnalysisSettings > summary').click();
  await page.locator('#runButton').click();
  await expect(page.locator('#patchRoi')).toBeAttached();
  await expect(page.locator('#surfaceAnalysisSettings')).toHaveAttribute('open', '');
  await expect(page.locator('#patchQuality')).toHaveAttribute('open', '');
  await expect(page.locator('#runButton')).toBeEnabled();
  expect(await page.evaluate(() => window.lastTopofitJob.patches)).toBeNull();
});

test('real reconstructed cortex displays patch QC, selected patches and registration spheres', async ({ page }, testInfo) => {
  const root = process.env.TOPOFIT_SURFACE_REPLAY;
  test.skip(!root, 'Requires external OpenRecon validation surfaces and surface-analysis replay outputs.');
  test.setTimeout(120_000);
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const outputs = JSON.parse(await readFile(join(root, 'outputs/files.json'), 'utf8'));
  const analysis = JSON.parse(await readFile(join(root, 'outputs/topofit_surface_analysis.json'), 'utf8'));
  const files = [
    ...['lh', 'rh'].flatMap((h) => ['white', 'pial', 'registration'].map((s) => ({ id: `${h}-${s}`, name: `${h}.${s}`, mediaType: 'application/vnd.freesurfer.surface' }))),
    ...outputs,
  ];
  const paths = new Map(files.map((file) => [file.name, join(root, outputs.includes(file) ? 'outputs' : 'surfaces', file.name)]));
  await page.route('**/__topofit_fixture__/*', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    const path = paths.get(name);
    return path ? route.fulfill({ path, contentType: 'application/octet-stream' }) : route.abort();
  });
  await page.addInitScript(({ files, analysis }) => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        this.fixture = String(url).includes('inference-worker');
      }
      async postMessage(job, ...rest) {
        if (!this.fixture) return super.postMessage(job, ...rest);
        const loaded = await Promise.all(files.map(async (file) => ({ ...file, bytes: await (await fetch(`/__topofit_fixture__/${file.name}`)).arrayBuffer() })));
        this.onmessage({ data: { type: 'result', files: loaded, provenance: { surfaceVertices: 245762, surfaceAnalysis: analysis }, elapsedSeconds: 0 } });
      }
    };
  }, { files, analysis });
  await page.goto('/');
  await page.locator('#imageInput').setInputFiles(join(root, 'source.nii.gz'));
  await expect(page.locator('#runButton')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#runButton').click();
  await expect(page.locator('#imageLabel')).toContainText('PATCHES', { timeout: 60_000 });
  await expect(page.locator('#viewerError')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('real-patch-qc.png') });
  await page.locator('.nd-volume-toggle').filter({ hasText: 'LH01' }).getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.locator('#imageLabel')).toContainText('LH01');
  await expect(page.locator('#viewerError')).toBeHidden();
  await expect(page.locator('.nd-view-tab.active')).toHaveText('3-Plane');
  await page.screenshot({ path: testInfo.outputPath('real-selected-patch.png') });
  for (const label of ['Left registration sphere', 'Right registration sphere', 'Left white surface', 'Right pial surface']) {
    const row = page.locator('.nd-volume-toggle').filter({ hasText: label });
    if (label.includes('sphere')) await row.getByRole('button', { name: 'View', exact: true }).click();
    else await row.getByRole('checkbox').check();
    await expect(page.locator('#imageLabel')).toContainText(label.includes('sphere') ? 'REGISTRATION' : label.includes('white') ? 'WHITE' : 'PIAL');
    await expect(page.locator('#viewerError')).toBeHidden();
  }
});
