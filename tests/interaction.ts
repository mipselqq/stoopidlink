import { TerminalController } from '../src/core/terminal.ts';
import { TerminalView } from '../src/terminal/view.ts';
import { terminalContent } from '../src/terminal/content.ts';
import '../src/style.css';
const content = structuredClone(terminalContent);
if (new URLSearchParams(location.search).has('overflow'))
  content.folders[0].entries.push(
    ...Array.from({ length: 3 }, (_, i) => ({
      id: `extra-${i}`,
      title: `EXTRA RECORD ${i + 1}`,
      kind: 'document' as const,
      html: `<p>Overflow record ${i + 1}</p>`,
    })),
  );
const controller = new TerminalController(content);
controller.state.phase = 'ready';
controller.state.folderIndex = 0;
if (new URLSearchParams(location.search).has('boot-check')) {
  controller.state.phase = 'boot';
  controller.state.bootStartedAt = performance.now() - 1500;
}
const view = new TerminalView(
  content,
  (a) => controller.dispatch(a),
  (limit) => controller.setScrollLimit(limit),
);
document.querySelector('#app')!.append(view.root);
const render = () => {
  view.setState(controller.state);
  view.root.dataset.testState = JSON.stringify(controller.state);
};
controller.addEventListener('change', render);
render();
if (new URLSearchParams(location.search).has('loading-check')) {
  const check = (condition: boolean, message: string) => {
    if (!condition) {
      view.root.dataset.loadingCheck = `FAIL: ${message}`;
      throw new Error(message);
    }
  };
  controller.dispatch({ type: 'folder', index: 3 });
  check(
    view.isLoading && view.root.inert && view.root.getAttribute('aria-busy') === 'true',
    'module loading locks the terminal',
  );
  check(!view.root.textContent?.includes('LOADING MODULE'), 'no loading placeholder is displayed');
  view.root.querySelector<HTMLButtonElement>('[data-folder="0"]')!.click();
  check(controller.state.folderIndex === 3, 'navigation remains blocked during loading');
  const observer = new MutationObserver(() => {
    if (view.isLoading) return;
    observer.disconnect();
    check(
      !view.root.inert && !!view.root.querySelector('canvas'),
      'module mounts and unlocks the terminal',
    );
    view.root.querySelector<HTMLButtonElement>('[data-folder="0"]')!.click();
    check(controller.state.folderIndex === 0, 'navigation works again after loading');
    view.root.dataset.loadingCheck = 'PASS';
  });
  observer.observe(view.root, { attributes: true, attributeFilter: ['aria-busy'] });
}
if (import.meta.hot) import.meta.hot.dispose(() => view.dispose());
