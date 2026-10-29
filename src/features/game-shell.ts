export const COLORS = {
  bg: '#001308',
  green: '#00cc66',
  cyan: '#83f7fb',
  white: '#e5eee8',
  dim: '#087c42',
  amber: '#ffd166',
  red: '#ff7272',
};
export class GameShell {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly status: HTMLElement;
  readonly controls: HTMLElement;
  running = false;
  private raf = 0;
  private last = 0;
  private step = (_dt: number) => {};
  private draw = () => {};
  private abort = new AbortController();
  private resize: ResizeObserver;
  private releaseControls: (() => void)[] = [];
  onReset = () => {};
  constructor(readonly host: HTMLElement) {
    host.innerHTML = `<div class="module-toolbar game-toolbar"><span class="module-status" role="status"><span class="module-message">STANDBY</span><span class="module-best" hidden></span></span><button class="module-button" data-play>START <kbd class="game-key">P</kbd></button><button class="module-button" data-reset>RESTART</button></div><div class="game-stage"><canvas class="game-canvas" width="640" height="360" tabindex="0" aria-label="Station training simulation"></canvas></div><div class="game-pad"></div>`;
    this.canvas = host.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.resize = new ResizeObserver(() => {
      if (!this.canvas.clientWidth || !this.canvas.clientHeight) return;
      const width = Math.min(
        4096,
        Math.max(640, Math.round((360 * this.canvas.clientWidth) / this.canvas.clientHeight)),
      );
      if (this.canvas.width !== width) this.canvas.width = width;
      this.invalidate();
    });
    this.resize.observe(this.canvas);
    this.status = host.querySelector('.module-status')!;
    this.controls = host.querySelector('.game-pad')!;
    host.querySelector('[data-play]')!.addEventListener('click', () => {
      this.setRunning(!this.running);
      this.canvas.focus();
    });
    host.querySelector('[data-reset]')!.addEventListener('click', () => {
      this.onReset();
      this.setRunning(true);
      this.canvas.focus();
    });
    this.canvas.addEventListener('click', () => this.canvas.focus());
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) this.setRunning(false);
      },
      { signal: this.abort.signal },
    );
  }
  setRunning(value: boolean) {
    this.running = value;
    this.host.querySelector('[data-play]')!.innerHTML =
      `${value ? 'PAUSE' : 'RESUME'} <kbd class="game-key">P</kbd>`;
    this.last = performance.now();
    this.invalidate();
  }
  message(text: string) {
    const message = this.status.querySelector('.module-message')!;
    if (message.textContent !== text) message.textContent = text;
  }
  best(value: string) {
    const label = this.status.querySelector<HTMLElement>('.module-best')!;
    label.hidden = false;
    label.textContent = `BEST ${value}`;
  }
  newBest() {
    if (this.host.querySelector('.new-best-popup')) return;
    this.setRunning(false);
    const popup = document.createElement('dialog');
    popup.className = 'new-best-popup';
    popup.innerHTML =
      '<strong>NEW BEST!</strong><p>You could have done something useful instead.</p><button class="module-button" autofocus>OK</button>';
    this.host.append(popup);
    popup.querySelector('button')!.onclick = () => popup.close();
    popup.addEventListener(
      'close',
      () => {
        popup.remove();
        this.canvas.focus({ preventScroll: true });
      },
      { once: true },
    );
    popup.showModal();
  }
  keys(handler: (key: string, pressed: boolean, repeat: boolean) => void) {
    for (const kind of ['keydown', 'keyup'] as const)
      this.host.addEventListener(
        kind,
        (event) => {
          if ((event.target as HTMLElement).closest('select,input,button,a,[role=listbox]')) return;
          const key = event.key.toLowerCase();
          if (
            ![
              'arrowup',
              'arrowdown',
              'arrowleft',
              'arrowright',
              ' ',
              'w',
              'a',
              's',
              'd',
              'r',
              'p',
              'enter',
            ].includes(key)
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          if (kind === 'keydown' && key === 'p' && !event.repeat) this.setRunning(!this.running);
          else handler(key, kind === 'keydown', event.repeat);
          this.invalidate();
        },
        { signal: this.abort.signal },
      );
    this.host.addEventListener(
      'focusout',
      () => {
        if (!this.host.contains(document.activeElement)) handler('release', false, false);
      },
      { signal: this.abort.signal },
    );
  }
  button(
    label: string,
    down: () => void,
    up: () => void = () => {},
    repeat = false,
    shortcut = '',
  ) {
    const b = document.createElement('button');
    b.className = 'module-button';
    b.textContent = label;
    if (shortcut) {
      const hint = document.createElement('kbd');
      hint.className = 'game-key';
      hint.textContent = shortcut;
      b.append(hint);
    }
    this.controls.append(b);
    let timer = 0;
    const release = () => {
      clearInterval(timer);
      timer = 0;
      up();
      b.setAttribute('aria-pressed', 'false');
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      b.setAttribute('aria-pressed', 'true');
      this.canvas.focus();
      down();
      this.invalidate();
      if (repeat)
        timer = window.setInterval(() => {
          down();
          this.invalidate();
        }, 120);
    });
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
    this.releaseControls.push(release);
  }
  loop(step: (dt: number) => void, draw: () => void) {
    this.step = step;
    this.draw = draw;
    this.invalidate();
  }
  invalidate() {
    if (this.raf) return;
    this.raf = requestAnimationFrame((now) => {
      this.raf = 0;
      const dt = Math.min(0.06, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      if (this.running) this.step(dt);
      this.draw();
      if (this.running) this.invalidate();
    });
  }
  get width() {
    return this.canvas.width;
  }
  clear() {
    this.ctx.fillStyle = COLORS.bg;
    this.ctx.fillRect(0, 0, this.width, 360);
  }
  text(text: string, x: number, y: number, color = COLORS.white, size = 16) {
    this.ctx.font = `${size}px Jix,monospace`;
    this.ctx.fillStyle = color;
    this.ctx.fillText(text, x, y);
  }
  dispose = () => {
    this.host.querySelector<HTMLDialogElement>('.new-best-popup')?.remove();
    this.resize.disconnect();
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.releaseControls.forEach((release) => release());
  };
}
