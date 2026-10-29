import { voiceName } from '../src/features/voice-notes.ts';
const target = document.querySelector('#fixtures')!;
const payloads = [
  '<img src=x onerror=alert(1)>',
  '<svg/onload=alert(1)>',
  "'); DROP TABLE voices;--",
  '&lt;script&gt;alert(1)&lt;/script&gt;',
];
for (const payload of payloads) target.append(voiceName(payload));
const passed =
  !target.querySelector('img,svg,script,iframe') &&
  Array.from(target.children).every(
    (node, i) =>
      node.textContent === payloads[i] &&
      node.childNodes.length === 1 &&
      node.firstChild?.nodeType === Node.TEXT_NODE,
  );
const result = document.querySelector<HTMLElement>('#result')!;
result.dataset.result = passed ? 'PASS' : 'FAIL';
result.textContent = JSON.stringify(
  {
    passed,
    literalTitles: target.children.length,
    executableElements: target.querySelectorAll('img,svg,script,iframe').length,
  },
  null,
  2,
);
