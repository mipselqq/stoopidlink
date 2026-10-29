import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyScenarios, type Scenario } from '../src/vendor/gravity/core/verify.ts';
test('Gravity Defied reproduces every upstream original-Java physics recording', () => {
  const pack = new Uint8Array(
    readFileSync(new URL('../public/assets/games/gravity/levels.mrg', import.meta.url)),
  );
  const scenarios = readFileSync(
    new URL('./fixtures/gravity-original.jsonl', import.meta.url),
    'utf8',
  )
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Scenario);
  assert.ok(scenarios.length > 20);
  assert.deepEqual(verifyScenarios(pack, scenarios), []);
});
