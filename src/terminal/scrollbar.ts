// Shared HTML component for file windows and dropdown menus.
import { displayScale } from '../core/config.ts';

class TerminalScrollbar extends HTMLElement {
  static observedAttributes = ['value', 'max', 'page', 'step'];
  private thumb = document.createElement('span');
  private resize = new ResizeObserver(() => this.update());
  private dragOffset?: number;
  constructor() {
    super();
    this.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!this.max) return;
      const thumb = this.thumb.getBoundingClientRect();
      this.dragOffset = event.target === this.thumb ? event.clientY - thumb.top : thumb.height / 2;
      this.setPointerCapture(event.pointerId);
      this.focus({ preventScroll: true });
      this.drag(event.clientY);
    });
    this.addEventListener('pointermove', (event) => {
      if (this.dragOffset === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      this.drag(event.clientY);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.addEventListener(type, () => {
        this.dragOffset = undefined;
      });
    }
    this.addEventListener('keydown', (event) => {
      const step = Math.max(1, Number(this.getAttribute('step')) || 1),
        page = Math.max(1, Number(this.getAttribute('page')) || 1);
      const values: Record<string, number> = {
        Home: 0,
        End: this.max,
        ArrowUp: this.value - step,
        ArrowDown: this.value + step,
        PageUp: this.value - page,
        PageDown: this.value + page,
      };
      if (!(event.key in values)) return;
      event.preventDefault();
      event.stopPropagation();
      this.change(values[event.key]);
    });
  }
  connectedCallback() {
    this.classList.add('file-scroll');
    this.setAttribute('role', 'scrollbar');
    this.setAttribute('aria-orientation', 'vertical');
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    if (!this.thumb.parentNode) this.append(this.thumb);
    this.resize.observe(this);
    this.update();
  }
  disconnectedCallback() {
    this.resize.disconnect();
    this.dragOffset = undefined;
  }
  attributeChangedCallback() {
    this.update();
  }
  private get max() {
    return Math.max(0, Number(this.getAttribute('max')) || 0);
  }
  private get value() {
    return Math.max(0, Math.min(this.max, Number(this.getAttribute('value')) || 0));
  }
  private update() {
    const page = Math.max(1, Number(this.getAttribute('page')) || 1);
    const height = Math.min(
      this.clientHeight,
      Math.max(8, (this.clientHeight * page) / (page + this.max)),
    );
    this.thumb.style.height = `${height}px`;
    this.thumb.style.top = `${this.max ? (this.value / this.max) * (this.clientHeight - height) : 0}px`;
    this.setAttribute('aria-valuemin', '0');
    this.setAttribute('aria-valuemax', String(this.max));
    this.setAttribute('aria-valuenow', String(this.value));
    this.setAttribute('aria-disabled', String(!this.max));
  }
  private change(value: number) {
    const step = Math.max(1, Number(this.getAttribute('step')) || 1);
    const next = Math.max(0, Math.min(this.max, Math.round(value / step) * step));
    if (next === this.value) return;
    this.setAttribute('value', String(next));
    this.dispatchEvent(
      new CustomEvent('scrollbar-change', { bubbles: true, detail: { value: next } }),
    );
  }
  private drag(y: number) {
    const scale = displayScale();
    const top = this.getBoundingClientRect().top + this.clientTop * scale;
    const travel = this.clientHeight * scale - this.thumb.getBoundingClientRect().height;
    this.change(((y - top - this.dragOffset!) / Math.max(1, travel)) * this.max);
  }
}
if (!customElements.get('terminal-scrollbar'))
  customElements.define('terminal-scrollbar', TerminalScrollbar);
