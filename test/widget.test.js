import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { EcovacsClient } from '../src/ecovacs/client.js';
import { Fleet } from '../src/devices/index.js';
import { normalizeConfig } from '../src/config.js';
import { ROBOT_WIDGET, WIDGETS } from '../src/capabilities/widget.js';
import { createFakeGladys } from './helpers/fakeGladys.js';
import { ROBOT_GOAT, ROBOT_T8, createFakeEcovacs, offline } from './helpers/fakeEcovacs.js';

const T8_ID = 'ext:ecovacs:vacuum:e0000001';
const GOAT_ID = 'ext:ecovacs:mower:e0000004';

async function makeFleet() {
  const gladys = createFakeGladys();
  gladys.widgetRefreshes = [];
  gladys.requestWidgetRefresh = (key) => gladys.widgetRefreshes.push(key);
  const fake = createFakeEcovacs({ devices: [ROBOT_T8, ROBOT_GOAT] });
  const fleet = new Fleet(gladys);
  fleet.use(
    new EcovacsClient({
      email: 'me@example.com',
      password: 'secret',
      country: 'FR',
      fetch: fake.fetch,
    }),
    normalizeConfig({ email: 'me@example.com', password: 'secret', poll_frequency: '30' }),
  );
  await fleet.refresh();
  return { gladys, fake, fleet };
}

const widget = WIDGETS[ROBOT_WIDGET];
const buttons = (content) =>
  content.components.filter((c) => c.type === 'button').map((c) => c.action.key);

test('no robot chosen, or an unknown one: a valid hint', async () => {
  const { fleet } = await makeFleet();
  for (const settings of [{}, { device: 'ext:ecovacs:vacuum:nope' }]) {
    const content = widget.get(fleet, { settings, language: 'fr' });
    assert.deepEqual(validateWidgetContent(content), []);
    assert.equal(content.components[0].type, 'text');
  }
});

test('before the first poll: battery tile, waiting text, buttons', async () => {
  const { fleet } = await makeFleet();
  const content = widget.get(fleet, { settings: { device: T8_ID }, language: 'en' });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.ok(content.components.length <= 8);
  assert.deepEqual(buttons(content), ['start', 'stop', 'dock', 'locate']);
});

test('after polls: status rows, live battery, rendered exactly as sent', async () => {
  const { fleet, fake } = await makeFleet();
  fake.robots[ROBOT_T8.did].answers.getCleanInfo_V2 = {
    state: 'clean',
    cleanState: { motionState: 'working' },
  };
  await fleet.poll({ external_id: T8_ID });
  const content = widget.get(fleet, { settings: { device: T8_ID }, language: 'fr' });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.ttl_seconds, 30);

  const battery = content.components.find((c) => c.type === 'value');
  assert.equal(battery.device_feature, `${T8_ID}:battery`);
  const status = content.components.find((c) => c.type === 'status');
  const rows = Object.fromEntries(status.items.map((i) => [i.label.en, i.value]));
  assert.equal(rows.State, 'En marche');
  assert.equal(rows.Error, 'Aucune erreur');
  assert.equal(rows.Suction, 'Standard');
  assert.equal(rows['Main brush'], '83 %');
  assert.equal(rows.Connection, 'Cloud');
  // Working: the first button pauses.
  assert.deepEqual(buttons(content), ['pause', 'stop', 'dock', 'locate']);
});

test('the rows follow the reader language: German, Spanish, English otherwise', async () => {
  const { fleet, fake } = await makeFleet();
  fake.robots[ROBOT_T8.did].answers.getCleanInfo_V2 = {
    state: 'clean',
    cleanState: { motionState: 'working' },
  };
  await fleet.poll({ external_id: T8_ID });
  const rowsIn = (language) => {
    const content = widget.get(fleet, { settings: { device: T8_ID }, language });
    assert.deepEqual(validateWidgetContent(content), []);
    const status = content.components.find((c) => c.type === 'status');
    for (const item of status.items) {
      assert.deepEqual(Object.keys(item.label), ['en', 'fr', 'de', 'es'], item.label.en);
    }
    return Object.fromEntries(status.items.map((i) => [i.label.en, i.value]));
  };
  assert.equal(rowsIn('de').State, 'In Betrieb');
  assert.equal(rowsIn('de').Error, 'Kein Fehler');
  assert.equal(rowsIn('es').State, 'En marcha');
  assert.equal(rowsIn('es').Error, 'Sin errores');
  assert.equal(rowsIn('it').State, 'Working');
  const buttonLabels = widget
    .get(fleet, { settings: { device: T8_ID }, language: 'de' })
    .components.filter((c) => c.type === 'button')
    .map((c) => c.label);
  for (const label of buttonLabels) {
    assert.deepEqual(Object.keys(label), ['en', 'fr', 'de', 'es'], label.en);
  }
});

test('a mower: no suction row, its own consumables', async () => {
  const { fleet, fake } = await makeFleet();
  fake.robots[ROBOT_GOAT.did].answers.getLifeSpan = [
    { type: 'blade', left: 5, total: 100 },
    { type: 'lensBrush', left: 50, total: 100 },
  ];
  await fleet.poll({ external_id: GOAT_ID });
  const content = widget.get(fleet, { settings: { device: GOAT_ID }, language: 'en' });
  assert.deepEqual(validateWidgetContent(content), []);
  const items = content.components.find((c) => c.type === 'status').items;
  assert.ok(!items.some((i) => i.label.en === 'Suction'));
  const blade = items.find((i) => i.label.en === 'Blades');
  assert.equal(blade.value, '5 %');
  assert.equal(blade.color, 'warning');
});

test('every button action is handled, and answers a toast', async () => {
  const { fleet, fake, gladys } = await makeFleet();
  const content = widget.get(fleet, { settings: { device: T8_ID }, language: 'en' });
  for (const key of buttons(content)) {
    const toast = await widget.action(fleet, { actionKey: key, settings: { device: T8_ID } });
    assert.deepEqual(Object.keys(toast), ['en', 'fr', 'de', 'es'], key);
  }
  assert.ok(gladys.widgetRefreshes.includes(ROBOT_WIDGET));
  assert.ok(fake.commands(ROBOT_T8.did).some((c) => c.name === 'charge'));

  fake.robots[ROBOT_T8.did].answers.playSound = offline();
  const toast = await widget.action(fleet, { actionKey: 'locate', settings: { device: T8_ID } });
  assert.match(toast.en, /did not take the order/);
  await assert.rejects(
    widget.action(fleet, { actionKey: 'self-destruct', settings: { device: T8_ID } }),
    /Unknown widget action/,
  );
});

test('the fleet nudges the widget when a row changes, not at every poll', async () => {
  const { fleet, gladys } = await makeFleet();
  await fleet.poll({ external_id: T8_ID });
  const after = gladys.widgetRefreshes.length;
  await fleet.poll({ external_id: T8_ID });
  assert.equal(gladys.widgetRefreshes.length, after, 'nothing changed');
});
