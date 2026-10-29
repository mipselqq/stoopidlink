// Original grid-aligned drawings: recognizable logo motifs, no icon font or raster payload.
const art: Record<string, string> = {
  Go: '<path fill="#69D2DF" d="M4 1h8v1h2v2h1v8h-1v2h-2v1H4v-1H2v-2H1V4h1V2h2zM0 3h2v4H0zm14 0h2v4h-2z"/><path fill="#FFF" d="M3 4h4v4H3zm6 0h4v4H9z"/><path fill="#001308" d="M4 5h1v2H4zm6 0h1v2h-1zM6 8h4v1H6z"/><path fill="#F3D2A2" d="M5 9h6v2H5z"/><path fill="#FFF" d="M6 11h1v2H6zm3 0h1v2H9z"/>',
  PostgreSQL:
    '<path d="M3 2h10v2h2v6h-2V5h-2v8h2v2H9v-4H7v3H5v-4H3V8H1V4h2z"/><path class="icon-cutout" d="M4 4h2v3H4zm6 0h2v2h-2zM7 7h2v3H7z"/>',
  Docker:
    '<path d="M1 9h12V7h2v2h1v2h-2v2h-2v1H5v-1H3v-1H2v-1H1zM2 5h3v3H2zm4 0h3v3H6zm4 0h3v3h-3zM6 1h3v3H6zm4 0h3v3h-3z"/><path class="icon-cutout" d="M4 10h1v1H4z"/>',
  Git: '<path d="M7 0h2l7 7v2l-7 7H7L0 9V7z"/><path class="icon-cutout" d="M5 3h2v2h2v2h2v2H9V8H7v4H5V5H4V3zm4 8h3v3H9z"/>',
  'GitHub Actions':
    '<path d="M1 1h6v6H1zm8 8h6v6H9zM9 1h6v6H9zM4 7h1v4h4v2H3V7z"/><path class="icon-cutout" d="M3 3h2v2H3zm8 8h2v2h-2zm0-8h2v2h-2z"/>',
  Linux:
    '<path d="M6 1h4v1h2v3h1v5h1v3h1v2h-5v-1H6v1H1v-2h1v-3h1V5h1V2h2z"/><path class="icon-cutout" d="M6 3h1v2H6zm3 0h1v2H9zM5 8h6v5H5z"/><path d="M6 5h4v2H6z"/>',
  Prometheus:
    '<path d="M7 0h2v4h2V2h2v5h-1v2h-2v1H5V9H3V7H2V3h2v3h2V3h1zM3 11h10v2H3zm2 3h6v2H5z"/>',
  Grafana:
    '<path d="M7 0h3v2h3v2h2v4h-2V5h-2V4H6v1H4v6h2v2h5v-2h2v3h-2v2H5v-2H2v-3H0V6h2V3h3V2h2zM7 6h5v2H8v2h3v2H6V7h1z"/>',
  JavaScript:
    '<path d="M1 1h14v14H1z"/><path class="icon-cutout" d="M6 5h2v7H7v1H4v-1H3v-2h2v1h1zm4 0h4v2h-3v1h2v1h1v3h-1v1H9v-2h3v-1h-2V9H9V6h1z"/>',
  Python:
    '<path d="M3 1h8v2h2v4H7v2H1V5h2zm2 9h4V8h6v4h-2v3H5z"/><path class="icon-cutout" d="M5 2h2v2H5zm5 10h2v2h-2z"/>',
  Rust: '<path d="M6 0h4v2h3v1h1v3h2v4h-2v3h-1v1h-3v2H6v-2H3v-1H2v-3H0V6h2V3h1V2h3z"/><path class="icon-cutout" d="M4 4h6v1h2v4h-2v1h2v2H9l-2-3H6v3H4zm2 2v1h4V6z"/>',
  Redis: '<path d="M1 4l7-3 7 3-7 3zM1 7l7 3 7-3v2l-7 3-7-3zM1 11l7 3 7-3v2l-7 3-7-3z"/>',
  gRPC: '<path d="M0 5h5v6H0zm11 0h5v6h-5zM6 0h4v4H6zm0 12h4v4H6zM5 7h6v2H5zm2-3h2v8H7z"/>',
  TSQL: '<path d="M3 1h10v2h2v11h-2v1H3v-1H1V3h2zm0 3v2h10V4zM3 8v2h10V8zm0 4v1h10v-1z"/>',
  'C#': '<path d="M4 1h8v2h2v3h-3V4H5v8h6v-2h3v3h-2v2H4v-2H2V3h2zM7 6h1V5h1v1h1V5h1v1h1v1h-1v1h1v1h-1v1h-1V9H9v1H8V9H7V8h1V7H7zm2 1v1h1V7z"/>',
  'VS Code': '<path d="M11 0l5 2v12l-5 2-7-6-3 3-1-2 3-3-3-3 1-2 3 3zM6 8l5 4V4z"/>',
  'Arch Linux': '<path d="M7 0h2l2 5-3-2 4 5 4 8-5-3v-3H9V9H7v1H5v3l-5 3 4-8 2-4z"/>',
  'Fish Shell':
    '<path d="M1 7V4l4 3 3-3h5v1h2v2h1v2h-1v2h-2v1H8L5 9l-4 3V9h2V7z"/><path class="icon-cutout" d="M12 6h2v2h-2z"/>',
  Kitty:
    '<path d="M2 1l5 3h2l5-3v11l-3 3H5l-3-3z"/><path class="icon-cutout" d="M4 6h2v2H4zm6 0h2v2h-2zM6 10h4v2H6z"/>',
  Firefox:
    '<path d="M3 0l3 4h4l4-3v5h2v6h-2v2h-3v2H5v-2H2v-2H0V6h2zM6 6v2H4v3h2v2h5v-2h2V8h-2v2H7V9h2V6z"/>',
  'Kool Desktop Environment':
    '<path d="M1 0h4v6l5-5h4L8 7l7 8h-5l-5-6v6H1z"/><path d="M11 5h3v2h2v3h-2v2h-2l-2-2h2V7h-1z"/>',
};
export function techIcon(name: string) {
  return `<svg class="tech-icon${name === 'Go' ? ' tech-icon-gopher' : ''}" viewBox="0 0 16 16" role="img" aria-label="${name}" shape-rendering="crispEdges">${art[name] ?? ''}</svg>`;
}
