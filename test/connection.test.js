import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failureMessage, successMessage } from '../src/connection.js';
import { EcovacsError } from '../src/ecovacs/client.js';

test('failure messages say what to fix, in both languages', () => {
  for (const kind of ['credentials', 'network', 'api']) {
    const message = failureMessage(new EcovacsError('boom', { kind }));
    assert.ok(message.en && message.fr, kind);
  }
  assert.match(failureMessage(new EcovacsError('x', { kind: 'credentials' })).fr, /mot de passe/);
});

test('success message lists the robots and the unsupported ones', () => {
  const message = successMessage('me***@example.com', [{ name: 'A' }, { name: 'B' }], ['Old']);
  assert.match(message.en, /2 robot\(s\) found \(A, B\)/);
  assert.match(message.fr, /Non pris en charge.*Old/);
  assert.match(successMessage('x', []).en, /no robot/);
});
