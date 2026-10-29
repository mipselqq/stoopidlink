import {
  connect,
  onlineStatus,
  palette,
  request,
  SharedApiError,
  type Board,
  type Pixel,
} from './shared-api.ts';

export function mount(host: HTMLElement) {
  const state = onlineStatus(host),
    body = state.body;
  body.innerHTML =
    '<div class="pixel-tools" role="group" aria-label="Drawing colors"></div><div class="pixel-stage"><canvas class="pixel-board" aria-label="Shared drawing canvas. Drag to draw; arrow keys and Space also draw." tabindex="0"></canvas></div><p class="module-help" data-feedback role="status"></p>';
  const tools = body.querySelector<HTMLElement>('.pixel-tools')!,
    stage = body.querySelector<HTMLElement>('.pixel-stage')!,
    canvas = body.querySelector<HTMLCanvasElement>('canvas')!,
    ctx = canvas.getContext('2d')!,
    feedback = body.querySelector<HTMLElement>('[data-feedback]')!;
  const bitmap = document.createElement('canvas'),
    pixels = bitmap.getContext('2d')!;
  let board: Board | undefined,
    color = 2,
    drawing = false,
    last: { x: number; y: number } | undefined,
    online = false,
    disposed = false,
    sending = false,
    timer: ReturnType<typeof setTimeout> | undefined,
    cursor = { x: 0, y: 0 };
  const pending = new Map<number, Pixel>();
  const render = () => {
    if (!board || !canvas.width || !canvas.height) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  };
  // Fit the shared grid into the available panel without changing its aspect ratio.
  const resize = () => {
    if (!board || !stage.clientWidth || !stage.clientHeight) return;
    canvas.width = board.width;
    canvas.height = board.height;
    const scale = Math.min(
      Math.max(1, stage.clientWidth - 16) / board.width,
      Math.max(1, stage.clientHeight - 16) / board.height,
    );
    canvas.style.width = `${board.width * scale}px`;
    canvas.style.height = `${board.height * scale}px`;
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  palette.forEach((value, i) => {
    const button = document.createElement('button');
    button.className = 'pixel-color';
    button.style.background = value;
    button.setAttribute('aria-label', `Color ${i + 1} ${value}`);
    button.setAttribute('aria-pressed', String(color === i));
    button.onclick = () => {
      color = i;
      for (const [index, node] of Array.from(tools.children).entries())
        node.setAttribute('aria-pressed', String(index === i));
    };
    tools.append(button);
  });
  const paint = (p: Pixel) => {
    if (!board) return;
    board.pixels[p.y * board.width + p.x] = p.color;
    pixels.fillStyle = palette[p.color];
    pixels.fillRect(p.x, p.y, 1, 1);
  };
  const flush = async () => {
    timer = undefined;
    if (disposed || sending || !online || !pending.size || !board) return;
    sending = true;
    let retryDelay = 50;
    const batch = Array.from(pending.values()).slice(0, 512);
    for (const p of batch) pending.delete(p.y * board.width + p.x);
    try {
      await request('pixels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
      if (!disposed) feedback.textContent = '';
    } catch (error) {
      if (disposed) return;
      if (error instanceof SharedApiError && [429, 503].includes(error.status)) {
        for (const p of batch) {
          const key = p.y * board.width + p.x;
          if (!pending.has(key)) pending.set(key, p);
        }
        retryDelay = 1000;
        feedback.textContent = error.message;
      } else {
        feedback.textContent = '[ DATA CORRUPTED ]';
        state.set(false);
        online = false;
        pending.clear();
      }
    } finally {
      sending = false;
      if (!disposed && pending.size) timer = setTimeout(flush, retryDelay);
    }
  };
  const mark = (x: number, y: number) => {
    if (!online || !board) return;
    const x0 = Math.floor((x * board.width) / canvas.width),
      x1 = Math.ceil(((x + 1) * board.width) / canvas.width),
      y0 = Math.floor((y * board.height) / canvas.height),
      y1 = Math.ceil(((y + 1) * board.height) / canvas.height);
    for (let yy = y0; yy < y1; yy++)
      for (let xx = x0; xx < x1; xx++) {
        const p = { x: xx, y: yy, color };
        paint(p);
        pending.set(yy * board.width + xx, p);
      }
    if (!timer && !sending) timer = setTimeout(flush, 50);
  };
  const stroke = (to: { x: number; y: number }) => {
    const from = last ?? to,
      steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      mark(Math.round(from.x + (to.x - from.x) * t), Math.round(from.y + (to.y - from.y) * t));
    }
    last = to;
    render();
  };
  const point = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          canvas.width - 1,
          Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          canvas.height - 1,
          Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height),
        ),
      ),
    };
  };
  canvas.onpointerdown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
    drawing = true;
    last = undefined;
    stroke(point(e));
  };
  canvas.onpointermove = (e) => {
    if (drawing) stroke(point(e));
  };
  canvas.onpointerup =
    canvas.onpointercancel =
    canvas.onlostpointercapture =
      () => {
        drawing = false;
        last = undefined;
      };
  canvas.onkeydown = (e) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    cursor = {
      x: Math.max(
        0,
        Math.min(
          canvas.width - 1,
          cursor.x + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          canvas.height - 1,
          cursor.y + (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0),
        ),
      ),
    };
    mark(cursor.x, cursor.y);
    render();
  };
  const close = connect(
    (snapshot) => {
      board = snapshot;
      bitmap.width = board.width;
      bitmap.height = board.height;
      const image = pixels.createImageData(board.width, board.height),
        colors = palette.map((hex) => [
          parseInt(hex.slice(1, 3), 16),
          parseInt(hex.slice(3, 5), 16),
          parseInt(hex.slice(5, 7), 16),
          255,
        ]);
      snapshot.pixels.forEach((c, i) => image.data.set(colors[c], i * 4));
      pixels.putImageData(image, 0, 0);
      for (const p of pending.values()) paint(p);
      resize();
    },
    (updates) => {
      for (const p of updates) paint(p);
      for (const p of pending.values()) paint(p);
      render();
    },
    () => {},
    (value) => {
      online = value;
      state.set(value);
      if (value) resize();
      else {
        drawing = false;
        last = undefined;
        pending.clear();
      }
    },
  );
  return () => {
    disposed = true;
    close();
    observer.disconnect();
    clearTimeout(timer);
    pending.clear();
  };
}
