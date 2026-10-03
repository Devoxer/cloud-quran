import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GATES, runAll } from '../lint-all.mjs';

describe('pnpm lint runs every gate', () => {
  it('keeps going past a failure and names every gate that failed', () => {
    const ran = [];
    const failed = runAll(
      [
        ['first', 'a'],
        ['second', 'b'],
        ['third', 'c'],
      ],
      (command) => {
        ran.push(command);
        return command === 'b' ? 0 : 1;
      }
    );
    assert.deepEqual(ran, ['a', 'b', 'c']);
    assert.deepEqual(failed, ['first', 'third']);
  });

  it('answers no failures when every gate passes', () => {
    assert.deepEqual(
      runAll(GATES, () => 0),
      []
    );
  });

  it('covers biome and all six project gates', () => {
    assert.deepEqual(
      GATES.map(([name]) => name),
      ['biome', 'layers', 'style', 'i18n', 'native-patches', 'header-controls', 'mushaf-glyphs']
    );
  });
});
