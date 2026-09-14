export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit < 2 ? 0 : 1)} ${units[unit]}`;
}

export function startMemorySampler(measure = globalThis.performance?.measureUserAgentSpecificMemory?.bind(globalThis.performance)) {
  if (!measure) return async () => null;
  let active = true;
  let timer;
  let peakBytes = 0;
  let peakGpuBytes = 0;
  let current;
  const sample = async () => {
    try {
      const result = await measure();
      peakBytes = Math.max(peakBytes, Number(result.bytes) || 0);
      const gpuBytes = (result.breakdown || [])
        .filter((entry) => entry.types?.some((type) => /gpu/i.test(type)))
        .reduce((sum, entry) => sum + (Number(entry.bytes) || 0), 0);
      peakGpuBytes = Math.max(peakGpuBytes, gpuBytes);
    } catch {
      active = false;
    }
    if (active) {
      timer = setTimeout(() => {
        current = sample();
      }, 5000);
    }
  };
  current = sample();
  return async () => {
    active = false;
    clearTimeout(timer);
    await new Promise((resolve) => {
      let settled = false;
      const deadline = setTimeout(() => {
        settled = true;
        resolve();
      }, 2000);
      current.finally(() => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        resolve();
      });
    });
    return peakBytes ? { bytes: peakBytes, gpuBytes: peakGpuBytes } : null;
  };
}
