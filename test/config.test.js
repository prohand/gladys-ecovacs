import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, isConfigured, normalizeConfig } from '../src/config.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  const config = normalizeConfig();
  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    assert.equal(config[key], value, key);
  }
  assert.equal(config.poll_frequency_ms, 60_000);
  assert.equal(isConfigured(config), false);
});

test('normalizeConfig trims the email and uppercases the country', () => {
  const config = normalizeConfig({ email: '  me@example.com ', password: 'x', country: 'be' });
  assert.equal(config.email, 'me@example.com');
  assert.equal(config.country, 'BE');
  assert.equal(isConfigured(config), true);
});

test('an invalid country or poll frequency falls back to the default', () => {
  const config = normalizeConfig({ country: 'France', poll_frequency: '5' });
  assert.equal(config.country, 'FR');
  assert.equal(config.poll_frequency, '60');
  assert.equal(config.poll_frequency_ms, 60_000);
});

test('the poll frequency is converted to the milliseconds Gladys knows', () => {
  assert.equal(normalizeConfig({ poll_frequency: '15' }).poll_frequency_ms, 15_000);
  assert.equal(normalizeConfig({ poll_frequency: 30 }).poll_frequency_ms, 30_000);
});
