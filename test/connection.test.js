import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODE_SENT,
  LANGUAGES,
  NOT_CONFIGURED,
  actionError,
  failureMessage,
  successMessage,
} from '../src/connection.js';
import { EcovacsError } from '../src/ecovacs/client.js';

const hasEveryLanguage = (message, where) =>
  assert.deepEqual(Object.keys(message), ['en', 'fr', 'de', 'es'], where);

test('the messages are written in English, French, German and Spanish', () => {
  assert.deepEqual(LANGUAGES, ['en', 'fr', 'de', 'es']);
  hasEveryLanguage(NOT_CONFIGURED, 'NOT_CONFIGURED');
  hasEveryLanguage(CODE_SENT, 'CODE_SENT');
});

test('failure messages say what to fix, in every language', () => {
  for (const kind of ['credentials', 'verification', 'code', 'network', 'api']) {
    hasEveryLanguage(failureMessage(new EcovacsError('boom', { kind })), kind);
  }
  assert.match(failureMessage(new EcovacsError('x', { kind: 'credentials' })).de, /Passwort/);
  assert.match(failureMessage(new EcovacsError('x', { kind: 'credentials' })).es, /contraseña/);
  assert.match(failureMessage(new EcovacsError('x', { kind: 'credentials' })).fr, /mot de passe/);
  assert.match(failureMessage(new EcovacsError('x', { kind: 'verification' })).fr, /code/);
});

test('an action error carries English and French only (shown as a failure)', () => {
  const error = actionError({ en: 'Wrong code.', fr: 'Code faux.' });
  assert.ok(error instanceof Error);
  assert.equal(error.message, 'Wrong code. / Code faux.');
  assert.equal(actionError({ en: 'Same', fr: 'Same' }).message, 'Same');
  assert.equal(
    actionError({
      en: 'Wrong code.',
      fr: 'Code faux.',
      de: 'Falscher Code.',
      es: 'Código erróneo.',
    }).message,
    'Wrong code. / Code faux.',
  );
});

test('success message lists the robots and the unsupported ones', () => {
  const message = successMessage('me***@example.com', [{ name: 'A' }, { name: 'B' }], ['Old']);
  assert.match(message.en, /2 robot\(s\) found \(A, B\)/);
  assert.match(message.fr, /Non pris en charge.*Old/);
  assert.match(message.de, /2 Roboter gefunden.*Nicht unterstützt.*Old/);
  assert.match(message.es, /2 robot\(s\) encontrado\(s\).*No compatible.*Old/);
  hasEveryLanguage(successMessage('x', []), 'no robot');
  assert.match(successMessage('x', []).en, /no robot/);
});
