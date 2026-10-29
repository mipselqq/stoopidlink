import { TerminalController } from './core/terminal.ts';
import { CONFIG } from './core/config.ts';
import { terminalContent } from './terminal/content.ts';
import { TerminalView } from './terminal/view.ts';
import { TerminalAudio } from './terminal/audio.ts';
import './style.css';

const controller = new TerminalController(terminalContent);
const audio = new TerminalAudio();
const view = new TerminalView(
  terminalContent,
  (action) => controller.dispatch(action),
  (limit) => controller.setScrollLimit(limit),
);
document.querySelector('#app')!.append(view.root);
controller.onSound = (event) => audio.play(event);
let bootTimer = 0;
function render() {
  view.setState(controller.state);
  if (controller.state.phase === 'boot' && !bootTimer) {
    bootTimer = window.setInterval(() => {
      controller.tick(performance.now());
      if (controller.state.phase === 'boot') view.renderBoot();
      else {
        clearInterval(bootTimer);
        bootTimer = 0;
      }
    }, 1000 / CONFIG.screen.fps);
  }
}
controller.addEventListener('change', render);
void document.fonts.ready.then(render);
render();
window.addEventListener('keydown', (event) => {
  if (view.root.classList.contains('is-transitioning')) {
    event.preventDefault();
    return;
  }
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.key === 'Tab' ||
    event.key === 'Shift'
  )
    return;
  if (view.isLoading) {
    event.preventDefault();
    return;
  }
  if (
    (event.target as HTMLElement).closest(
      '[data-feature], .file-scroll, [data-expand], input, select',
    )
  )
    return;
  if (controller.state.phase === 'attract') {
    event.preventDefault();
    controller.dispatch({ type: 'start' });
    return;
  }
  const key = event.key.toLowerCase();
  if (key === 'arrowup' || key === 'arrowdown') {
    event.preventDefault();
    controller.dispatch({ type: 'move', direction: key === 'arrowup' ? -1 : 1 });
  } else if (key === 'e' || key === 'enter') {
    event.preventDefault();
    controller.dispatch({ type: 'select' });
  } else if (['q', 'escape', 'backspace'].includes(key)) {
    event.preventDefault();
    controller.dispatch({ type: 'back' });
  } else if (key === 'pageup' || key === 'pagedown') {
    event.preventDefault();
    controller.dispatch({ type: 'scroll', amount: key === 'pageup' ? -240 : 240 });
  }
});
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    clearInterval(bootTimer);
    audio.dispose();
    view.dispose();
  });
