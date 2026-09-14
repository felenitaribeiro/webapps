import manifest from '../../../models/syncro-tutorials.manifest.json' with { type: 'json' };

const byName = new Map(manifest.assets.map((asset) => [asset.filename, asset]));

async function hash(buffer) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)),
    (value) => value.toString(16).padStart(2, '0'),
  ).join('');
}

export const tutorials = Object.freeze(manifest.tutorials);

export async function verifyTutorialAsset(asset, buffer) {
  return buffer.byteLength === asset.bytes && await hash(buffer) === asset.sha256;
}

export async function fetchTutorial(id, { fetchImpl = fetch, signal, onProgress = () => {} } = {}) {
  const tutorial = tutorials[id];
  if (!tutorial) throw new Error('Unknown SYNcro tutorial.');
  const names = [...new Set([tutorial.primary, tutorial.lesion, tutorial.pathological].filter(Boolean))];
  const files = {};
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const asset = byName.get(name);
    if (!asset) throw new Error(`Tutorial manifest is missing ${name}.`);
    onProgress(index / names.length, `Downloading tutorial image ${index + 1} of ${names.length}…`);
    let response;
    try {
      response = await fetchImpl(`${manifest.base_url}${name}`, { signal });
    } catch (error) {
      if (error.name === 'AbortError' || signal?.aborted) throw error;
      throw new Error(`Could not download tutorial image ${name}.`, { cause: error });
    }
    if (!response.ok) throw new Error(`Could not download tutorial image ${name}.`);
    const buffer = await response.arrayBuffer();
    if (!await verifyTutorialAsset(asset, buffer)) throw new Error(`Tutorial image ${name} failed checksum verification.`);
    files[name] = new Uint8Array(buffer);
  }
  onProgress(1, 'Tutorial images verified.');
  return {
    ...tutorial,
    primary: { name: tutorial.primary, bytes: files[tutorial.primary] },
    lesion: tutorial.lesion ? { name: tutorial.lesion, bytes: files[tutorial.lesion] } : null,
    pathological: tutorial.pathological ? { name: tutorial.pathological, bytes: files[tutorial.pathological] } : null,
  };
}
