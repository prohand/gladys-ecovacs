// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG, POLL_FREQUENCIES_MS } from '../src/config.js';
import { SCENE_ACTIONS, SCENE_TRIGGERS } from '../src/capabilities/scenes.js';
import { WIDGETS } from '../src/capabilities/widget.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const indexSource = await readFile(new URL('../index.js', import.meta.url), 'utf8');

const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// The field types the store schema accepts.
const FIELD_TYPES = [
  'string',
  'number',
  'boolean',
  'select',
  'multi_select',
  'secret',
  'oauth2',
  'section',
];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('every manifest action is registered in index.js', () => {
  for (const action of manifest.actions ?? []) {
    assert.match(
      indexSource,
      new RegExp(`onAction\\('${action.key}'`),
      `manifest action "${action.key}" has no handler`,
    );
  }
});

test('every field uses a type the store accepts', () => {
  for (const field of allFields) {
    assert.ok(FIELD_TYPES.includes(field.type), `field "${field.key}": type "${field.type}"`);
  }
});

test('the integration is declared cloud-only', () => {
  // Ecovacs robots are only reachable through the Ecovacs cloud.
  assert.deepEqual(manifest.transports, ['cloud']);
});

// The store vocabulary of catalog shelves (an unknown key is silently dropped).
const CATEGORIES = [
  'climate',
  'lighting',
  'energy',
  'security',
  'multimedia',
  'appliances',
  'environment',
  'protocols',
  'network',
  'notifications',
  'assistants',
  'services',
  'transport',
  'vehicles',
  'servers',
  'leisure',
];

test('categories and Gladys 5.1 capabilities require a recent enough Gladys', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.equal(new Set(manifest.categories).size, manifest.categories.length);
  for (const category of manifest.categories) {
    assert.ok(CATEGORIES.includes(category), `unknown category "${category}"`);
  }
  assert.ok(isAtLeast(minGladysVersion(), [4, 86, 0]));
  assert.ok(isAtLeast(minGladysVersion(), [5, 1, 0]), 'scene_triggers / scene_actions need 5.1.0');
});

test('keywords are 1 to 10 unique search terms of 2 to 30 characters', () => {
  assert.ok(Array.isArray(manifest.keywords));
  assert.ok(manifest.keywords.length >= 1 && manifest.keywords.length <= 10);
  const seen = new Set();
  for (const keyword of manifest.keywords) {
    const normalized = keyword.trim().toLowerCase();
    assert.ok(normalized.length >= 2 && normalized.length <= 30, `keyword "${keyword}"`);
    assert.ok(!seen.has(normalized), `duplicate keyword "${keyword}"`);
    seen.add(normalized);
  }
});

test('the robots are sold worldwide: no countries restriction', () => {
  assert.equal(manifest.countries, undefined);
});

test('keywords, countries and music require Gladys 5.3.0', () => {
  if (manifest.keywords || manifest.countries || manifest.music) {
    assert.ok(isAtLeast(minGladysVersion(), [5, 3, 0]), 'keywords / countries / music need 5.3.0');
  }
  assert.ok(isAtLeast(minGladysVersion(), [5, 3, 0]));
});

test('every scene_actions key has a handler, and vice versa', () => {
  const declared = keysOf(manifest.scene_actions);
  assert.deepEqual([...declared].sort(), Object.keys(SCENE_ACTIONS).sort());
  for (const action of manifest.scene_actions) {
    for (const output of action.outputs ?? []) {
      assert.ok(['string', 'number', 'boolean'].includes(output.type), output.key);
    }
  }
});

test('every scene trigger the code fires is declared, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(SCENE_TRIGGERS).sort());
});

test('every widgets key has a content and an action handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
  for (const key of Object.keys(WIDGETS)) {
    assert.equal(typeof WIDGETS[key].get, 'function');
    assert.equal(typeof WIDGETS[key].action, 'function');
  }
  assert.ok(manifest.widgets.length <= 5);
  for (const widget of manifest.widgets) {
    for (const [lang, text] of Object.entries(widget.description ?? {})) {
      assert.ok(text.length <= 100, `widget ${widget.key} description.${lang}: ${text.length}`);
    }
  }
});

test('index.js registers the scene actions and the widgets', () => {
  assert.match(indexSource, /onSceneAction\(key/);
  assert.match(indexSource, /onWidgetGet\(key/);
  assert.match(indexSource, /onWidgetAction\(key/);
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `DEFAULT_CONFIG.${field.key}`);
    }
  }
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    assert.ok(keysOf(manifest.config_schema).includes(key), `"${key}" is not in config_schema`);
  }
});

test('the password is a secret field', () => {
  const password = manifest.config_schema.find((f) => f.key === 'password');
  assert.equal(password.type, 'secret');
});

test('every poll frequency offered is one Gladys accepts', () => {
  const field = manifest.config_schema.find((f) => f.key === 'poll_frequency');
  assert.deepEqual(
    field.options.map((o) => o.value).sort(),
    Object.keys(POLL_FREQUENCIES_MS).sort(),
  );
});

test('country options are ISO alpha-2 codes, the default among them', () => {
  const field = manifest.config_schema.find((f) => f.key === 'country');
  for (const option of field.options) {
    assert.match(option.value, /^[A-Z]{2}$/);
  }
  assert.ok(field.options.some((o) => o.value === field.default));
});

test('section fields are purely presentational', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  for (const field of allFields.filter((f) => f.source !== undefined)) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, field.key);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`), manifest.docker_image);
});

// Every text a user reads comes in the four languages of the Gladys interface.
const LANGUAGES = ['en', 'fr', 'de', 'es'];

test('the catalog description holds 10 to 100 characters per language', () => {
  assert.deepEqual(Object.keys(manifest.description), LANGUAGES);
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});

test('texts are multi-language objects in English, French, German and Spanish', () => {
  const check = (value, where) => {
    assert.equal(typeof value, 'object', where);
    assert.deepEqual(Object.keys(value), LANGUAGES, `${where} needs ${LANGUAGES.join(', ')}`);
    for (const lang of LANGUAGES) {
      assert.ok(typeof value[lang] === 'string' && value[lang].trim(), `${where}.${lang}`);
    }
  };
  for (const field of allFields) {
    check(field.label, `${field.key}.label`);
    if (field.description) check(field.description, `${field.key}.description`);
    if (field.placeholder) check(field.placeholder, `${field.key}.placeholder`);
    for (const option of field.options ?? []) check(option.label, `${field.key}.${option.value}`);
    for (const link of field.links ?? []) check(link.label, `${field.key} link`);
  }
  for (const item of [
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
    ...(manifest.widgets ?? []),
  ]) {
    check(item.label, `${item.key}.label`);
    if (item.description) check(item.description, `${item.key}.description`);
    for (const entry of [...(item.variables ?? []), ...(item.outputs ?? [])]) {
      check(entry.label, `${item.key}.${entry.key}.label`);
    }
  }
});

test('no multi-language object anywhere misses a language', () => {
  // A catch-all over the whole manifest, for what the checks above do not list.
  const walk = (value, where) => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${where}[${index}]`));
    } else if (value && typeof value === 'object') {
      if (typeof value.en === 'string') {
        assert.deepEqual(Object.keys(value), LANGUAGES, where);
      } else {
        for (const [key, entry] of Object.entries(value)) walk(entry, `${where}.${key}`);
      }
    }
  };
  walk(manifest, 'manifest');
});

test('texts stay within the store length limits in every language', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    for (const lang of LANGUAGES) {
      assert.ok((section.description?.[lang] ?? '').length <= 1000, `${section.key}.${lang}`);
    }
  }
  for (const widget of manifest.widgets ?? []) {
    for (const lang of LANGUAGES) {
      const length = widget.label[lang].length;
      assert.ok(length >= 3 && length <= 30, `widget ${widget.key} label.${lang}: ${length}`);
    }
  }
});
