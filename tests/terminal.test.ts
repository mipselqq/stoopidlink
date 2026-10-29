import test from 'node:test';
import assert from 'node:assert/strict';
import { TerminalController } from '../src/core/terminal.ts';
import type { TerminalContent } from '../src/core/types.ts';

const content: TerminalContent = {
  folders: Array.from({ length: 7 }, (_, folder) => ({
    id: String(folder),
    label: `FOLDER ${folder}`,
    entries: Array.from({ length: 5 }, (_, entry) => ({
      id: `${folder}-${entry}`,
      title: `DOCUMENT ${entry}`,
      kind: 'document',
    })),
  })),
};
function ready() {
  const controller = new TerminalController(content);
  controller.dispatch({ type: 'start' }, 0);
  controller.tick(4000);
  return controller;
}
test('keyboard selection keeps the active folder inside the four visible slots', () => {
  const controller = ready();
  controller.dispatch({ type: 'back' });
  for (let i = 0; i < 5; i++) controller.dispatch({ type: 'move', direction: 1 });
  assert.equal(controller.state.folderIndex, 6);
  assert.equal(controller.state.folderOffset, 3);
  for (let i = 0; i < 7; i++) controller.dispatch({ type: 'move', direction: -1 });
  assert.equal(controller.state.folderIndex, 0);
  assert.equal(controller.state.folderOffset, 0);
});
test('five files stay visible and additional files scroll in whole rows', () => {
  const controller = ready();
  for (let i = 0; i < 4; i++) controller.dispatch({ type: 'move', direction: 1 });
  assert.equal(controller.state.entryIndex, 4);
  assert.equal(controller.state.entryOffset, 0);
  controller.dispatch({ type: 'entry-scroll', amount: 1 });
  assert.equal(controller.state.entryOffset, 0);
  controller.folder.entries.push(
    { id: 'extra-5', title: 'SIXTH', kind: 'document' },
    { id: 'extra-6', title: 'SEVENTH', kind: 'document' },
  );
  controller.dispatch({ type: 'entry', index: 6 });
  assert.equal(controller.state.entryOffset, 2);
  assert.equal(controller.state.level, 'content');
  controller.dispatch({ type: 'entry-scroll', amount: -1 });
  assert.equal(controller.state.entryOffset, 1);
  controller.dispatch({ type: 'entry-scroll', amount: 99 });
  assert.equal(controller.state.entryOffset, 2);
  controller.dispatch({ type: 'entry', index: 0 });
  assert.equal(controller.state.entryOffset, 0);
  controller.folder.entries.splice(5);
});
test('scroll limits follow measured content and reset on document changes', () => {
  const controller = ready();
  controller.setScrollLimit(350);
  controller.dispatch({ type: 'scroll', amount: 999 });
  assert.equal(controller.state.scroll, 350);
  controller.dispatch({ type: 'entry', index: 1 });
  assert.equal(controller.state.scroll, 0);
  controller.setScrollLimit(0);
  controller.dispatch({ type: 'scroll', amount: 240 });
  assert.equal(controller.state.scroll, 0);
});
test('three impacts reboot and corrupt every record', () => {
  const controller = ready();
  for (let i = 0; i < 3; i++) {
    controller.dispatch({ type: 'hit' }, 5000 + i * 100);
  }
  assert.equal(controller.state.phase, 'boot');
  assert.equal(controller.state.corrupted, true);
  controller.tick(10000);
  assert.equal(controller.state.phase, 'ready');
});
