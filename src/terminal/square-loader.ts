// Bounds and cadence of the two original Flash transition frames.
export const SQUARE_FRAMES = [
  { id: '100', x: 23, y: 71, width: 917.95, height: 607.9 },
  { id: '102', x: 23, y: 100, width: 917.95, height: 578.9 },
] as const;
export const SQUARE_FRAME_MS = (2 * 1000) / 24;

export function squareLoaderFrame(
  id: string | undefined,
  width: number,
  height: number,
  adaptive: boolean,
  source: string,
) {
  const frame = SQUARE_FRAMES.find((frame) => frame.id === id);
  if (!frame) return '';
  if (!adaptive)
    return `<svg class="square-loader" viewBox="0 0 960 720" preserveAspectRatio="none"><image href="${source}" x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}"/></svg>`;

  // Clip one original tile from the same artwork and repeat it, rather than stretching
  // the entire grid. The second frame retains its original downward displacement.
  const pitchX = 55.9,
    pitchY = 72,
    tileWidth = 23,
    tileHeight = 34,
    x = (pitchX - tileWidth) / 2,
    y = (pitchY - tileHeight) / 2 + frame.y - SQUARE_FRAMES[0].y,
    offsetX = (width - Math.max(1, Math.floor(width / pitchX)) * pitchX) / 2,
    offsetY = (height - Math.max(1, Math.floor(height / pitchY)) * pitchY) / 2;
  return `<svg class="square-loader" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><defs><pattern id="square-tiles-${id}" x="${offsetX}" y="${offsetY}" width="${pitchX}" height="${pitchY}" patternUnits="userSpaceOnUse" overflow="hidden"><image href="${source}" x="${x}" y="${y}" width="${frame.width}" height="${frame.height}"/></pattern></defs><rect width="100%" height="100%" fill="url(#square-tiles-${id})"/></svg>`;
}
