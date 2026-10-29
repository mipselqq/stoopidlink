// Only loaded with the two online Shared files; no frontend framework or socket library.
export const palette = [
  '#000f00',
  '#e5eee8',
  '#00cc66',
  '#83f7fb',
  '#75aaff',
  '#ffd166',
  '#ff9955',
  '#ff7272',
  '#d497ff',
  '#006633',
  '#087c42',
  '#31557f',
  '#86455b',
  '#704a2e',
  '#779b84',
  '#ffffff',
];
const base = (import.meta.env?.VITE_SHARED_API_URL || '/api').replace(/\/$/, '');
export const endpoint = (path: string) => `${base}/shared/${path}`;
export interface Board {
  width: number;
  height: number;
  pixels: number[];
}
export interface Pixel {
  x: number;
  y: number;
  color: number;
}
export interface Voice {
  id: number;
  name: string;
  createdAt: string;
  mime: string;
}
export class SharedApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${base}/${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new SharedApiError(response.status, detail?.error || `SERVER ERROR ${response.status}`);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return apiRequest<T>(`shared/${path}`, init);
}
export function connect(
  onBoard: (board: Board) => void,
  onPixels: (pixels: Pixel[]) => void,
  onVoices: () => void,
  onOnline: (online: boolean) => void,
) {
  let stream: EventSource | undefined,
    retry: ReturnType<typeof setTimeout> | undefined,
    closed = false;
  const open = () => {
    if (closed) return;
    stream = new EventSource(endpoint('events'));
    stream.addEventListener('canvas', (event) => {
      onBoard(JSON.parse((event as MessageEvent).data));
      onOnline(true);
      onVoices();
    });
    stream.addEventListener('pixels', (event) =>
      onPixels(JSON.parse((event as MessageEvent).data)),
    );
    stream.addEventListener('voices', onVoices);
    // An HTTP error from a stopped API/reverse proxy can permanently close EventSource.
    // Recreate it explicitly so recovery also works after 404/500 responses.
    stream.onerror = () => {
      stream?.close();
      onOnline(false);
      clearTimeout(retry);
      retry = setTimeout(open, 2500);
    };
  };
  open();
  return () => {
    closed = true;
    clearTimeout(retry);
    stream?.close();
  };
}
export function onlineStatus(host: HTMLElement) {
  const status = document.createElement('p');
  status.className = 'shared-status module-help';
  status.setAttribute('role', 'status');
  status.textContent = 'CONNECTING';
  host.append(status);
  const body = document.createElement('div');
  body.className = 'shared-body';
  body.hidden = true;
  host.append(body);
  return {
    body,
    set(online: boolean) {
      status.textContent = online ? 'LIVE / SHARED FILE' : '[ DATA CORRUPTED ]';
      status.classList.toggle('corrupted', !online);
      body.hidden = !online;
    },
  };
}
