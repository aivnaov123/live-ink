// Rendering resolution.
// The canvas is rendered at the screen's REAL pixel resolution (crisp on Retina/phones), and the camera
// zooms by `view.zoom` so the game world + layout keep the same logical size (540x960 / 960x540 based).

export const view = { zoom: 1 };

/** Baked textures (ball, stars, particles, tiles) are drawn this many times larger, then shown scaled down. */
export const TEX = 3;

/** Logical game size: at least 540x960 (portrait) or 960x540 (landscape), extended to the screen's shape. */
export function logicalSize(w: number, h: number): { width: number; height: number } {
  const a = Math.max(0.3, Math.min(3.5, w / Math.max(1, h)));
  if (a < 1) return a < 540 / 960 ? { width: 540, height: Math.round(540 / a) } : { width: Math.round(960 * a), height: 960 };
  return a > 960 / 540 ? { width: Math.round(540 * a), height: 540 } : { width: 960, height: Math.round(960 / a) };
}

/** Physical canvas size + zoom for a parent element of cssW x cssH. Caps the pixel count for performance. */
export function renderSize(cssW: number, cssH: number) {
  const l = logicalSize(cssW, cssH);
  const touch = matchMedia('(pointer: coarse)').matches;
  const dpr = Math.min(window.devicePixelRatio || 1, touch ? 2 : 2.5);
  let zoom = (Math.max(1, cssW) * dpr) / l.width;
  const maxPixels = touch ? 2.2e6 : 4.5e6;            // phones: keep fill-rate in check
  const px = l.width * zoom * l.height * zoom;
  if (px > maxPixels) zoom *= Math.sqrt(maxPixels / px);
  zoom = Math.max(1, zoom);
  return { width: Math.round(l.width * zoom), height: Math.round(l.height * zoom), zoom };
}
