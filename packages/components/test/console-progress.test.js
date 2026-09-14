import assert from 'node:assert/strict';
import test from 'node:test';
import { ConsoleOutput } from '../src/ui/ConsoleOutput.js';

test('repeated progress messages log once, while changes, levels and new runs remain visible', () => {
  const entries = [];
  const log = new ConsoleOutput({ mirror: (text, level) => entries.push([text, level]) });
  for (let i = 0; i < 100; i += 1) log.log('Loading model…');
  assert.equal(entries.length, 1);
  log.log('Loading model…', 'error');
  log.log('Reconstructing…');
  log.log('Loading model…');
  assert.equal(entries.length, 4);
  log.clear();
  log.log('Loading model…');
  assert.equal(entries.length, 5);
});
