import type { RenderQuality } from './types';

export const QUALITY_STORAGE_KEY = 'renda_render_quality';

export const RENDER_QUALITY = {
  performance: { pixelRatio: 1, shadowSize: 1024, samples: 0, bloom: false, contactShadows: false },
  balanced: { pixelRatio: 1.5, shadowSize: 2048, samples: 2, bloom: true, contactShadows: false },
  cinematic: { pixelRatio: 2, shadowSize: 4096, samples: 4, bloom: true, contactShadows: true },
} as const;

export function isRenderQuality(value: string | null): value is RenderQuality {
  return value === 'performance' || value === 'balanced' || value === 'cinematic';
}

export function readRenderQuality(softwareRenderer: boolean): RenderQuality {
  // A URL override makes it possible to compare every pipeline on the same device.
  const requested = new URLSearchParams(window.location.search).get('quality');
  if (isRenderQuality(requested)) return requested;
  try {
    const saved = localStorage.getItem(QUALITY_STORAGE_KEY);
    if (isRenderQuality(saved)) return saved;
  } catch { /* Storage may be disabled in embedded players. */ }
  return softwareRenderer ? 'performance' : 'balanced';
}
