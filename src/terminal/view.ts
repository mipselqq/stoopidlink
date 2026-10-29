import './interface.css';
import './scrollbar.ts';
import { asset } from '../core/config.ts';
import type { TerminalAction, TerminalContent, TerminalState } from '../core/types.ts';
import { mountFeature } from '../features/loader.ts';
import timeline from '../generated/terminal-timeline.json';
import shapes from '../generated/boot-shapes.json';

type DisplayItem = { characterId?: string; opacity: number };
const MOBILE = '(max-width: 959px), (pointer: coarse)';

export class TerminalView {
  readonly root = document.createElement('div');
  private state!: TerminalState;
  private touchStart?: { x: number; y: number };
  private document?: HTMLElement;
  private documentKey = '';
  private featureDispose?: () => void;
  private featureGeneration = 0;
  private featureLoading = false;
  get isLoading() {
    return this.featureLoading;
  }
  private expanded = false;
  private transitioning = false;
  private observer: ResizeObserver;
  private bootFrames = Array.from({ length: 95 }, (_, frame) => {
    const display = new Map<string, DisplayItem>();
    for (const mutation of timeline.rootTimeline) {
      if (mutation.frame > frame) break;
      if (!('depth' in mutation) || !mutation.depth) continue;
      if (mutation.type === 'RemoveObject2Tag') {
        display.delete(mutation.depth);
        continue;
      }
      const item = { ...(display.get(mutation.depth) ?? { opacity: 1 }) };
      if ('characterId' in mutation && mutation.characterId)
        item.characterId = mutation.characterId;
      if ('colorTransform' in mutation && mutation.colorTransform)
        item.opacity =
          'alphaMultTerm' in mutation.colorTransform
            ? Number(mutation.colorTransform.alphaMultTerm) / 256
            : 1;
      display.set(mutation.depth, item);
    }
    return display;
  });
  constructor(
    private content: TerminalContent,
    private onAction: (action: TerminalAction) => void,
    private onScrollLimit: (limit: number) => void,
  ) {
    this.root.className = 'terminal-ui';
    this.root.setAttribute('aria-label', 'Personal terminal');
    this.observer = new ResizeObserver(() => this.layout());
    this.observer.observe(this.root);
    this.root.addEventListener('click', (event) => {
      if (this.state.phase === 'attract') {
        this.onAction({ type: 'start' });
        return;
      }
      if (this.state.phase !== 'ready' || this.transitioning || this.featureLoading) return;
      const target = event.target as HTMLElement;
      if (target.closest('[data-expand]')) {
        void this.toggleExpanded();
        return;
      }
      const folder = target.closest<HTMLElement>('[data-folder]');
      const entry = target.closest<HTMLElement>('[data-entry]');
      if (folder) this.onAction({ type: 'folder', index: Number(folder.dataset.folder) });
      else if (entry) this.onAction({ type: 'entry', index: Number(entry.dataset.entry) });
      else if (target.closest('.bottom')) this.onAction({ type: 'back' });
    });
    this.root.addEventListener(
      'wheel',
      (event) => {
        if (this.featureLoading) {
          event.preventDefault();
          return;
        }
        if (
          this.state.phase !== 'ready' ||
          (event.target as HTMLElement).closest(
            '.game-canvas, .pixel-board, .voice-scroll-area, button, input, select',
          )
        )
          return;
        event.preventDefault();
        if ((event.target as HTMLElement).closest('.folder-list'))
          this.onAction({ type: 'folder-scroll', amount: Math.sign(event.deltaY) });
        else if ((event.target as HTMLElement).closest('.file-navigation'))
          this.onAction({ type: 'entry-scroll', amount: Math.sign(event.deltaY) });
        else this.onAction({ type: 'scroll', amount: Math.sign(event.deltaY) * 32 });
      },
      { passive: false },
    );
    this.root.addEventListener(
      'touchstart',
      (event) => {
        const touch = event.touches[0];
        if (touch) this.touchStart = { x: touch.clientX, y: touch.clientY };
      },
      { passive: true },
    );
    this.root.addEventListener(
      'touchmove',
      (event) => {
        const touch = event.touches[0],
          start = this.touchStart;
        if (
          !touch ||
          !start ||
          this.featureLoading ||
          this.state.phase !== 'ready' ||
          (event.target as HTMLElement).closest(
            '.game-canvas, .pixel-board, .voice-scroll-area, button, input, select',
          )
        )
          return;
        if ((event.target as HTMLElement).closest('.file-navigation')) {
          if (Math.abs(touch.clientY - start.y) >= 30) {
            event.preventDefault();
            this.onAction({ type: 'entry-scroll', amount: touch.clientY < start.y ? 1 : -1 });
            this.touchStart = { x: touch.clientX, y: touch.clientY };
          }
        } else if ((event.target as HTMLElement).closest('.body')) {
          event.preventDefault();
          this.onAction({ type: 'scroll', amount: start.y - touch.clientY });
          this.touchStart = { x: touch.clientX, y: touch.clientY };
        }
      },
      { passive: false },
    );
    this.root.addEventListener('scrollbar-change', (event) => {
      if (this.featureLoading || !(event.target as HTMLElement).closest('.file-navigation')) return;
      this.onAction({
        type: 'entry-scroll',
        amount: (event as CustomEvent<{ value: number }>).detail.value - this.state.entryOffset,
      });
    });
    this.root.addEventListener(
      'scroll',
      (event) => {
        if ((event.target as HTMLElement).classList.contains('folder-list')) this.layout();
      },
      true,
    );
    this.root.addEventListener('keydown', (event) => {
      if (this.featureLoading) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    });
  }
  dispose() {
    this.observer.disconnect();
    this.featureDispose?.();
    this.featureGeneration++;
    this.setLoading(false);
  }
  private setLoading(loading: boolean) {
    this.featureLoading = loading;
    this.root.inert = loading;
    this.root.setAttribute('aria-busy', String(loading));
    this.touchStart = undefined;
  }
  setState(state: TerminalState) {
    const previous = this.state;
    this.state = { ...state };
    if (state.phase !== 'ready') {
      this.featureDispose?.();
      this.featureDispose = undefined;
      this.document = undefined;
      this.documentKey = '';
      this.featureGeneration++;
      this.setLoading(false);
      if (state.phase === 'boot') this.renderBoot();
      else this.root.innerHTML = this.renderScreen();
      return;
    }
    // Keep the scrollbar connected while dragging; only its rows and connector change.
    if (
      this.document &&
      previous?.phase === 'ready' &&
      this.root.classList.contains('is-expanded') === this.expanded &&
      (Object.keys(state) as (keyof TerminalState)[]).every(
        (key) => key === 'entryOffset' || key === 'scroll' || state[key] === previous[key],
      )
    ) {
      if (state.entryOffset !== previous.entryOffset) {
        this.root.querySelector('.entry-list')!.innerHTML = this.fileRows();
        this.root
          .querySelector('.file-navigation terminal-scrollbar')!
          .setAttribute('value', String(state.entryOffset));
        this.root.querySelector('.connector')?.remove();
        this.root.insertAdjacentHTML('beforeend', this.desktopConnector());
      }
      this.layout();
      return;
    }
    const entry = this.content.folders[state.folderIndex]?.entries[state.entryIndex];
    const key = `${state.folderIndex}:${entry?.id}:${state.corrupted}`;
    const preserved = key === this.documentKey ? this.document : undefined;
    const folderScroll = this.root.querySelector('.folder-list')?.scrollLeft ?? 0;
    if (!preserved) {
      this.featureDispose?.();
      this.featureDispose = undefined;
      this.featureGeneration++;
      this.setLoading(false);
    }
    this.root.classList.toggle('is-expanded', this.expanded);
    this.root.innerHTML = this.renderScreen();
    const folderList = this.root.querySelector<HTMLElement>('.folder-list')!;
    folderList.scrollLeft = folderScroll;
    if (matchMedia(MOBILE).matches) {
      const selected = folderList.querySelector<HTMLElement>(
        `[data-folder="${state.folderIndex}"]`,
      )!;
      const listBounds = folderList.getBoundingClientRect(),
        selectedBounds = selected.getBoundingClientRect();
      if (selectedBounds.left < listBounds.left)
        folderList.scrollLeft -= listBounds.left - selectedBounds.left;
      else if (selectedBounds.right > listBounds.right)
        folderList.scrollLeft += selectedBounds.right - listBounds.right;
    }
    const placeholder = this.root.querySelector<HTMLElement>('.document-content')!;
    if (preserved) {
      placeholder.replaceWith(preserved);
      this.document = preserved;
    } else {
      this.document = placeholder;
      this.documentKey = key;
      if (entry?.module && !state.corrupted) {
        const host = this.document.querySelector<HTMLElement>('[data-feature]')!;
        const generation = this.featureGeneration;
        this.setLoading(true);
        void mountFeature(entry, host, () => generation === this.featureGeneration)
          .then((dispose) => {
            if (generation !== this.featureGeneration) dispose?.();
            else this.featureDispose = dispose;
          })
          .catch((error) => {
            if (generation === this.featureGeneration)
              host.textContent = `MODULE ERROR: ${error instanceof Error ? error.message : String(error)}`;
          })
          .finally(() => {
            if (generation !== this.featureGeneration) return;
            this.setLoading(false);
            this.layout();
          });
      }
    }
    this.document.style.transform = state.scroll ? `translateY(-${state.scroll}px)` : '';
    this.layout();
  }
  private layout() {
    this.root.style.setProperty(
      '--boot-scale',
      String(Math.min(1, this.root.clientWidth / 960, this.root.clientHeight / 720)),
    );
    const body = this.root.querySelector<HTMLElement>('.body');
    if (body && this.document) {
      const limit = Math.max(0, this.document.scrollHeight - body.clientHeight);
      this.onScrollLimit(limit);
      this.state.scroll = Math.min(this.state.scroll, limit);
      this.document.style.transform = this.state.scroll
        ? `translateY(-${this.state.scroll}px)`
        : '';
    }
    const svg = this.root.querySelector<SVGSVGElement>('.mobile-connector');
    if (!svg || !matchMedia(MOBILE).matches || this.expanded) return;
    const folder = this.root.querySelector<HTMLElement>(
      `[data-folder="${this.state.folderIndex}"]`,
    );
    const file = this.root.querySelector<HTMLElement>(`[data-entry="${this.state.entryIndex}"]`);
    if (!folder || !file) {
      svg.style.visibility = 'hidden';
      return;
    }
    svg.style.visibility = '';
    const root = this.root.getBoundingClientRect(),
      a = folder.getBoundingClientRect(),
      b = file.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${root.width} ${root.height}`);
    // Travel in the outside gutter and row gaps, never through another file tile.
    const x1 = a.left - root.left + a.width / 2,
      y1 = a.top - root.top;
    const x2 = b.left - root.left + b.width / 2,
      y2 = b.top - root.top;
    const navigation = this.root
      .querySelector<HTMLElement>('.file-navigation')!
      .getBoundingClientRect();
    const content = this.root.querySelector<HTMLElement>('.content-box')!.getBoundingClientRect();
    const rowGap = parseFloat(getComputedStyle(this.root.querySelector('.entry-list')!).rowGap);
    const fileGap = b.top === navigation.top ? navigation.top - content.bottom : rowGap;
    const folderGap = a.top - navigation.bottom;
    svg
      .querySelector('path')!
      .setAttribute(
        'd',
        `M ${x1} ${y1} V ${y1 - folderGap / 2} H 9 V ${y2 - fileGap / 2} H ${x2} V ${y2}`,
      );
  }
  private async toggleExpanded() {
    if (this.transitioning) return;
    this.transitioning = true;
    this.root.classList.add('is-transitioning');
    // Match boot frames 86 → 88 → 90: full tiles, bottom strips, then clear.
    // Keep each asset at its original coordinates; stretching the two cropped
    // SVGs to the same box made the grid jump and alternating them made it blink.
    await Promise.all(
      [100, 102].map(
        (id) =>
          new Promise<void>((resolve) => {
            const preload = new Image();
            preload.onload = () => resolve();
            preload.onerror = () => resolve();
            preload.src = asset(`ui/original-shape-${id}.svg`);
          }),
      ),
    );
    const overlay = document.createElement('div');
    overlay.className = 'square-transition';
    overlay.setAttribute('aria-hidden', 'true');
    this.root.append(overlay);
    for (const id of [100, 102]) {
      const bounds = shapes[String(id) as keyof typeof shapes];
      const height = id === 100 ? 607.9 : 578.9;
      overlay.innerHTML = `<svg viewBox="0 0 960 720" preserveAspectRatio="none"><image href="${asset(`ui/original-shape-${id}.svg`)}" x="${bounds.x}" y="${bounds.y}" width="917.95" height="${height}"/></svg>`;
      await new Promise((resolve) => setTimeout(resolve, (2 * 1000) / 24));
    }
    this.expanded = !this.expanded;
    this.transitioning = false;
    this.root.classList.remove('is-transitioning');
    this.setState(this.state);
  }
  renderBoot() {
    if (this.state.phase !== 'boot') return;
    const frame = Math.min(
      90,
      Math.floor(((performance.now() - this.state.bootStartedAt) / 1000) * 24) + 2,
    );
    const display = this.bootFrames[frame];
    const shape = (id: string | undefined, dx = 0, dy = 0) => {
      const bounds = shapes[id as keyof typeof shapes];
      return bounds
        ? `<img class="boot-art" alt="" src="${asset(`ui/original-shape-${id}.svg`)}" style="left:${bounds.x + dx}px;top:${bounds.y + dy}px">`
        : '';
    };
    const logo = display.get('18');
    const brand =
      frame < 86
        ? `<div class="boot-brand" style="opacity:${logo?.opacity ?? 0}"><img src="${asset('ui/stoopidlink.svg')}" alt="STOOPIDLINK"><span>AN LM-LINK PRODUCT</span></div>`
        : shape(logo?.characterId);
    const progress = shape(display.get('29')?.characterId);
    const copyright =
      frame >= 8 && frame < 86 ? '<div class="boot-copyright">(C) LM-LINK DATA SYSTEMS</div>' : '';
    const twinkle =
      frame >= 40 && frame < 58
        ? shape(
            String([69, 70, 71, 72, 73, 72, 71, 70, 69][Math.floor((frame - 40) / 2)]),
            826.55,
            178.95,
          )
        : '';
    this.layout();
    this.root.innerHTML = `<div class="boot-screen"><div class="boot-stage">${brand}${progress}${copyright}${twinkle}${frame >= 88 ? '<div class="topbar">PERSONAL TERMINAL <span class="battery"></span></div>' : ''}</div></div>`;
  }
  private renderScreen() {
    const s = this.state,
      folder = this.content.folders[s.folderIndex],
      entry = folder?.entries[s.entryIndex];
    if (s.phase === 'attract')
      return '<div class="attract"><div class="attract-inner"><strong>STOOPIDLINK</strong>PERSONAL TERMINAL<br><br><span class="flicker">PRESS ANY KEY</span></div></div>';
    if (s.phase === 'boot') return '';
    if (s.phase === 'fallen') return '<div class="damage">Conputer suffered because of you</div>';
    const folders = this.content.folders
      .map((f, i) => {
        const pos = i - s.folderOffset;
        if (pos < 0 || pos > 3) return '';
        return `<button class="folder ${i === s.folderIndex ? (s.level === 'folders' ? 'highlighted' : 'selected') : ''}" style="top:${pos * 128.6}px" data-folder="${i}" aria-pressed="${i === s.folderIndex}">${f.label}</button>`;
      })
      .join('');
    const entries = folder?.entries ?? [],
      visible = entries.slice(s.entryOffset, s.entryOffset + 5);
    const fileHeight = 32,
      fileGap = 4,
      listHeight = Math.max(1, visible.length) * 36 - 4;
    const mobileRows = Math.ceil(Math.max(1, visible.length) / 2);
    const connector = this.desktopConnector(),
      files = this.fileRows();
    const rail = `<terminal-scrollbar class="file-scroll" aria-label="Files" max="${Math.max(0, entries.length - 5)}" value="${s.entryOffset}" page="5"></terminal-scrollbar>`;
    const feature = !s.corrupted && entry?.module;
    const body = s.corrupted
      ? '<h2>DATA CORRUPTED</h2><p>All terminal records are inaccessible.</p>'
      : (entry?.html ?? '') +
        (feature ? `<div data-feature="${feature}" class="feature-host"></div>` : '');
    const arrow = this.expanded
      ? 'M2 2h2v2h2v2h2V4h2V2h2v4h-2v2H8v2H6V8H4V6H2z'
      : 'M6 2h2v2h2v2h2v4h-2V8H8V6H6v2H4v2H2V6h2V4h2z';
    return `<div class="topbar">PERSONAL TERMINAL <span class="battery"></span></div><div class="folder-label">FOLDERS</div><div class="folder-list">${folders}</div>${connector}<svg class="mobile-connector" aria-hidden="true"><path/></svg><section class="entry-panel" style="--file-height:${fileHeight}px;--file-gap:${fileGap}px;--file-list-height:${listHeight}px;--mobile-file-rows:${mobileRows}"><nav class="file-navigation" aria-label="Files"><div class="entry-list">${files}</div>${rail}</nav><div class="content-box${feature ? ' has-feature' : ''}"><div class="content-cap"></div><button class="expand-button" data-expand aria-label="${this.expanded ? 'Collapse document' : 'Expand document'}" aria-expanded="${this.expanded}"><svg viewBox="0 0 14 12" aria-hidden="true"><path d="${arrow}"/></svg></button><div class="body"><div class="document-content">${body}</div></div></div></section><footer class="bottom"><span><b>UP / DOWN</b> HIGHLIGHT</span><span>· · · <b>E</b> SELECT · · ·</span><span><b>PGUP / PGDN</b> SCROLL</span><span>· · <b>Q</b> BACK</span></footer>`;
  }
  private fileRows() {
    const s = this.state;
    return this.content.folders[s.folderIndex].entries
      .slice(s.entryOffset, s.entryOffset + 5)
      .map(
        (item, pos) =>
          `<button data-entry="${s.entryOffset + pos}" class="entry-title ${s.entryIndex === s.entryOffset + pos ? 'highlighted' : ''}" aria-pressed="${s.entryIndex === s.entryOffset + pos}">${escape(s.corrupted ? 'DATA CORRUPTED' : item.title)}</button>`,
      )
      .join('');
  }
  private desktopConnector() {
    const s = this.state,
      row = s.folderIndex - s.folderOffset;
    if (row < 0 || row > 3 || s.entryIndex < s.entryOffset || s.entryIndex >= s.entryOffset + 5)
      return '';
    const title = 92.6 + (s.entryIndex - s.entryOffset) * 36,
      folder = 244.15 + row * 128.6;
    return `<div class="connector" style="top:${Math.min(title, folder)}px;height:${Math.abs(folder - title)}px;${title > folder ? 'transform:scaleY(-1)' : ''}"></div>`;
  }
}
function escape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
