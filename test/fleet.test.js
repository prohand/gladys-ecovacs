import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { EcovacsClient } from '../src/ecovacs/client.js';
import { Fleet, STATE_HEARTBEAT_MS } from '../src/devices/index.js';
import { FEATURE } from '../src/devices/robot.js';
import { POLL_FREQUENCIES_MS, normalizeConfig } from '../src/config.js';
import { VACUUM_STATE } from '../src/ecovacs/robot.js';
import { SCENE_TRIGGERS } from '../src/capabilities/scenes.js';
import { createFakeGladys, lastValue } from './helpers/fakeGladys.js';
import {
  ROBOT_GOAT,
  ROBOT_LEGACY,
  ROBOT_T8,
  createFakeEcovacs,
  offline,
} from './helpers/fakeEcovacs.js';

async function makeFleet(devices = [ROBOT_T8], config = {}) {
  let now = 1_700_000_000_000;
  const gladys = createFakeGladys({ now: () => now });
  const fake = createFakeEcovacs({ devices });
  const fleet = new Fleet(gladys, { now: () => now });
  fleet.use(
    new EcovacsClient({
      email: 'me@example.com',
      password: 'secret',
      country: 'FR',
      fetch: fake.fetch,
      now: () => now,
    }),
    normalizeConfig({ email: 'me@example.com', password: 'secret', ...config }),
  );
  await fleet.refresh();
  return { gladys, fake, fleet, advance: (ms) => (now += ms) };
}

const T8_ID = 'ext:ecovacs:vacuum:e0000001';
const feature = (key) => `${T8_ID}:${key}`;

test('refresh keeps the supported robots and names the legacy ones', async () => {
  const { fleet } = await makeFleet([ROBOT_T8, ROBOT_LEGACY, ROBOT_GOAT]);
  assert.deepEqual(
    fleet.robots.map((r) => r.did),
    [ROBOT_T8.did, ROBOT_GOAT.did],
  );
  assert.deepEqual(fleet.unsupported, ['Old one']);
});

test('discovered devices: Gladys-valid features, poll frequency in ms', async () => {
  const { fleet } = await makeFleet([ROBOT_T8], { poll_frequency: '30' });
  const [device] = fleet.discoveredDevices();
  assert.equal(device.external_id, T8_ID);
  assert.equal(device.name, 'Kitchen Deebot');
  assert.equal(device.model, 'DEEBOT OZMO T8');
  assert.equal(device.poll_frequency, 30_000);
  assert.ok(Object.values(POLL_FREQUENCIES_MS).includes(device.poll_frequency));
  assert.equal(device.should_poll, true);

  const ids = new Set();
  for (const f of device.features) {
    assert.ok(f.external_id.startsWith(`${T8_ID}:`), f.external_id);
    assert.ok(!ids.has(f.external_id), `duplicate ${f.external_id}`);
    ids.add(f.external_id);
    // min/max are NOT NULL in Gladys, every feature declares them.
    assert.equal(typeof f.min, 'number', `${f.external_id} min`);
    assert.equal(typeof f.max, 'number', `${f.external_id} max`);
    assert.ok(Object.values(DEVICE_FEATURE_CATEGORIES).includes(f.category), f.category);
    const typesOfCategory = Object.entries(DEVICE_FEATURE_CATEGORIES).find(
      ([, value]) => value === f.category,
    )[0];
    assert.ok(
      Object.values(DEVICE_FEATURE_TYPES[typesOfCategory]).includes(f.type),
      `${f.category}/${f.type}`,
    );
  }
  const suction = device.features.find((f) => f.external_id === feature(FEATURE.SUCTION));
  assert.deepEqual(
    suction.supported_options.map((o) => o.value),
    ['quiet', 'standard', 'max', 'max_plus'],
  );
});

test('a mower has its own namespace, no suction, its own consumables', async () => {
  const { fleet } = await makeFleet([ROBOT_GOAT]);
  const [device] = fleet.discoveredDevices();
  assert.equal(device.external_id, 'ext:ecovacs:mower:e0000004');
  const keys = device.features.map((f) => f.external_id.split(':').at(-1));
  assert.ok(!keys.includes(FEATURE.SUCTION));
  assert.ok(keys.includes('blade') && keys.includes('lens-brush'));
  assert.equal(device.features.find((f) => f.external_id.endsWith(':run-mode')).name, 'Mowing');
});

test('poll publishes the states, the consumables and the cloud badge', async () => {
  const { fleet, gladys } = await makeFleet();
  await fleet.poll({ external_id: T8_ID });
  assert.equal(lastValue(gladys, feature(FEATURE.STATE)), VACUUM_STATE.STOPPED);
  assert.equal(lastValue(gladys, feature(FEATURE.BATTERY)), 87);
  assert.equal(lastValue(gladys, feature(FEATURE.CHARGING)), 0);
  assert.equal(lastValue(gladys, feature(FEATURE.RUN_MODE)), 0);
  assert.equal(lastValue(gladys, feature(FEATURE.SUCTION)), 'standard');
  assert.equal(lastValue(gladys, feature(FEATURE.ERROR)), 'No error');
  assert.equal(lastValue(gladys, feature('main-brush')), 83);
  assert.deepEqual(gladys.transports, [{ external_id: T8_ID, transport: 'cloud' }]);
});

test('a poll only publishes what changed, and everything again after the heartbeat', async () => {
  const { fleet, gladys, fake, advance } = await makeFleet();
  await fleet.poll({ external_id: T8_ID });
  const first = gladys.published.length;
  advance(60_000);
  await fleet.poll({ external_id: T8_ID });
  assert.equal(gladys.published.length, first, 'nothing changed, nothing sent');

  fake.robots[ROBOT_T8.did].answers.getBattery = { value: 80, isLow: 0 };
  advance(60_000);
  await fleet.poll({ external_id: T8_ID });
  assert.deepEqual(
    gladys.published.slice(first).map((s) => s.device_feature_external_id),
    [feature(FEATURE.BATTERY)],
  );

  advance(STATE_HEARTBEAT_MS);
  const before = gladys.published.length;
  await fleet.poll({ external_id: T8_ID });
  assert.ok(gladys.published.length - before >= 6, 'heartbeat re-sends the stable values');
});

test('consumables are read every half hour, not at every poll', async () => {
  const { fleet, fake, advance } = await makeFleet();
  const lifeSpanReads = () =>
    fake.commands(ROBOT_T8.did).filter((c) => c.name === 'getLifeSpan').length;
  await fleet.poll({ external_id: T8_ID });
  advance(60_000);
  await fleet.poll({ external_id: T8_ID });
  assert.equal(lifeSpanReads(), 1);
  advance(30 * 60_000);
  await fleet.poll({ external_id: T8_ID });
  assert.equal(lifeSpanReads(), 2);
});

test('a robot that does not answer turns the badge unreachable, then back', async () => {
  const { fleet, fake, gladys } = await makeFleet();
  const answers = fake.robots[ROBOT_T8.did].answers;
  const saved = answers.getCleanInfo_V2;
  answers.getCleanInfo_V2 = offline();
  await fleet.poll({ external_id: T8_ID });
  answers.getCleanInfo_V2 = saved;
  await fleet.poll({ external_id: T8_ID });
  await fleet.poll({ external_id: T8_ID });
  assert.deepEqual(
    gladys.transports.map((t) => t.transport),
    ['unreachable', 'cloud'],
    'published on change only',
  );
});

test('scene triggers: cleaning finished, then a new error', async () => {
  const { fleet, fake, gladys } = await makeFleet();
  const answers = fake.robots[ROBOT_T8.did].answers;
  answers.getCleanInfo_V2 = { state: 'clean', cleanState: { motionState: 'working' } };
  await fleet.poll({ external_id: T8_ID });
  assert.equal(gladys.sceneEvents.length, 0, 'nothing on the first poll');

  answers.getCleanInfo_V2 = { state: 'goCharging', cleanState: {} };
  await fleet.poll({ external_id: T8_ID });
  assert.deepEqual(gladys.sceneEvents, [
    {
      key: SCENE_TRIGGERS.CLEANING_FINISHED,
      data: { device: T8_ID, name: 'Kitchen Deebot' },
    },
  ]);

  answers.getError = { code: [105] };
  await fleet.poll({ external_id: T8_ID });
  await fleet.poll({ external_id: T8_ID });
  assert.equal(gladys.sceneEvents.length, 2, 'one event per new error');
  assert.deepEqual(gladys.sceneEvents[1].data, {
    device: T8_ID,
    name: 'Kitchen Deebot',
    code: 105,
    message: 'Robot stuck',
  });
  assert.equal(lastValue(gladys, feature(FEATURE.ERROR)), 'Robot stuck (105)');
  assert.equal(lastValue(gladys, feature(FEATURE.STATE)), VACUUM_STATE.ERROR);
});

test('setValue routes the commands', async () => {
  const { fleet, fake, gladys } = await makeFleet();
  const device = { external_id: T8_ID };
  await fleet.setValue(device, { external_id: feature(FEATURE.RUN_MODE) }, 1);
  assert.equal(fake.commands(ROBOT_T8.did).at(-1).name, 'clean_V2');
  assert.equal(fake.commands(ROBOT_T8.did).at(-1).data.act, 'start');

  await fleet.setValue(device, { external_id: feature(FEATURE.RUN_MODE) }, 0);
  assert.equal(fake.commands(ROBOT_T8.did).at(-1).data.act, 'stop');

  await fleet.setValue(device, { external_id: feature(FEATURE.DOCK) }, 1);
  assert.equal(fake.commands(ROBOT_T8.did).at(-1).name, 'charge');

  const before = fake.commands(ROBOT_T8.did).length;
  await fleet.setValue(device, { external_id: feature(FEATURE.DOCK) }, 0);
  assert.equal(fake.commands(ROBOT_T8.did).length, before, 'dock 0 sends nothing');

  await fleet.setValue(device, { external_id: feature(FEATURE.SUCTION) }, 'max_plus');
  assert.deepEqual(fake.commands(ROBOT_T8.did).at(-1), {
    name: 'setSpeed',
    data: { speed: 2 },
  });
  assert.equal(lastValue(gladys, feature(FEATURE.SUCTION)), 'max_plus');

  await assert.rejects(
    fleet.setValue(device, { external_id: feature(FEATURE.BATTERY) }, 1),
    /cannot be controlled/,
  );
});

test('setValue resumes a paused robot instead of restarting it', async () => {
  const { fleet, fake } = await makeFleet();
  fake.robots[ROBOT_T8.did].answers.getCleanInfo_V2 = {
    state: 'clean',
    cleanState: { motionState: 'pause' },
  };
  await fleet.poll({ external_id: T8_ID });
  await fleet.setValue({ external_id: T8_ID }, { external_id: feature(FEATURE.RUN_MODE) }, 1);
  assert.equal(fake.commands(ROBOT_T8.did).at(-1).data.act, 'resume');
});

test('an unknown robot re-reads the list, at most every 5 minutes', async () => {
  const { fleet, fake, advance } = await makeFleet();
  const lists = () => fake.requests.filter((r) => r.url.pathname.endsWith('/appsvr/app.do')).length;
  await fleet.poll({ external_id: 'ext:ecovacs:vacuum:unknown' });
  assert.equal(lists(), 1, 'just listed');
  advance(6 * 60_000);
  await fleet.poll({ external_id: 'ext:ecovacs:vacuum:unknown' });
  assert.equal(lists(), 2);
  await assert.rejects(
    fleet.setValue({ external_id: 'ext:ecovacs:vacuum:unknown' }, { external_id: 'x' }, 1),
    /not on the Ecovacs account/,
  );
});

test('locate answers false when the robot does not answer', async () => {
  const { fleet, fake } = await makeFleet();
  assert.equal(await fleet.locate(T8_ID), true);
  fake.robots[ROBOT_T8.did].answers.playSound = offline();
  assert.equal(await fleet.locate(T8_ID), false);
  assert.equal(await fleet.locate('ext:ecovacs:vacuum:unknown'), false);
});
