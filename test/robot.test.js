import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EcovacsClient } from '../src/ecovacs/client.js';
import {
  Robot,
  VACUUM_STATE,
  ERROR_MESSAGES,
  errorMessage,
  lifePercent,
  parseErrorCode,
  robotKind,
  toVacuumState,
} from '../src/ecovacs/robot.js';
import {
  ROBOT_920,
  ROBOT_GOAT,
  ROBOT_T8,
  createFakeEcovacs,
  defaultAnswers,
} from './helpers/fakeEcovacs.js';

function makeRobot(info = ROBOT_T8, devices = [info]) {
  const fake = createFakeEcovacs({ devices });
  const client = new EcovacsClient({
    email: 'me@example.com',
    password: 'secret',
    country: 'FR',
    fetch: fake.fetch,
  });
  return { fake, robot: new Robot(client, info) };
}

test('toVacuumState maps the Ecovacs words to the Gladys states', () => {
  assert.equal(toVacuumState({ cleanInfo: { state: 'idle' } }), VACUUM_STATE.STOPPED);
  assert.equal(
    toVacuumState({ cleanInfo: { state: 'clean', cleanState: { motionState: 'working' } } }),
    VACUUM_STATE.RUNNING,
  );
  assert.equal(
    toVacuumState({ cleanInfo: { state: 'clean', cleanState: { motionState: 'pause' } } }),
    VACUUM_STATE.PAUSED,
  );
  assert.equal(
    toVacuumState({ cleanInfo: { state: 'goCharging' } }),
    VACUUM_STATE.RETURNING_TO_DOCK,
  );
  assert.equal(
    toVacuumState({ cleanInfo: { state: 'idle' }, charge: { isCharging: 1 }, battery: 60 }),
    VACUUM_STATE.CHARGING,
  );
  assert.equal(
    toVacuumState({ cleanInfo: { state: 'idle' }, charge: { isCharging: 1 }, battery: 100 }),
    VACUUM_STATE.DOCKED,
  );
  assert.equal(
    toVacuumState({ cleanInfo: { state: 'clean' }, errorCode: 105 }),
    VACUUM_STATE.ERROR,
  );
});

test('parseErrorCode: 0 and 100 mean no error', () => {
  assert.equal(parseErrorCode({ code: [100] }), 0);
  assert.equal(parseErrorCode({ code: [0] }), 0);
  assert.equal(parseErrorCode({ code: [105] }), 105);
  assert.equal(parseErrorCode({ code: 109 }), 109);
  assert.equal(parseErrorCode(undefined), 0);
});

test('errorMessage: in four languages, unknown codes keep their number', () => {
  assert.deepEqual(errorMessage(105), {
    en: 'Robot stuck',
    fr: 'Robot coincé',
    de: 'Roboter festgefahren',
    es: 'Robot atascado',
  });
  assert.deepEqual(errorMessage(9999), {
    en: 'Error 9999',
    fr: 'Erreur 9999',
    de: 'Fehler 9999',
    es: 'Error 9999',
  });
  assert.equal(errorMessage(0).en, 'No error');
  for (const code of [0, ...Object.keys(ERROR_MESSAGES)]) {
    assert.deepEqual(Object.keys(errorMessage(Number(code))), ['en', 'fr', 'de', 'es'], code);
  }
});

test('lifePercent is bounded and tolerates garbage', () => {
  assert.equal(lifePercent({ left: 15000, total: 18000 }), 83);
  assert.equal(lifePercent({ left: 20000, total: 18000 }), 100);
  assert.equal(lifePercent({ left: 1, total: 0 }), undefined);
  assert.equal(lifePercent(undefined), undefined);
});

test('robotKind tells the GOAT mowers from the Deebot vacuums', () => {
  assert.equal(robotKind(ROBOT_GOAT), 'mower');
  assert.equal(robotKind(ROBOT_T8), 'vacuum');
  assert.equal(robotKind({}), 'vacuum');
});

test('readStatus on a V2 robot', async () => {
  const { robot, fake } = makeRobot();
  fake.robots[ROBOT_T8.did].answers.getCleanInfo_V2 = {
    state: 'clean',
    cleanState: { motionState: 'working' },
  };
  fake.robots[ROBOT_T8.did].answers.getSpeed = { speed: 1 };
  const status = await robot.readStatus();
  assert.equal(robot.protocol, 'v2');
  assert.equal(status.state, VACUUM_STATE.RUNNING);
  assert.equal(status.battery, 87);
  assert.equal(status.charging, false);
  assert.equal(status.suction, 'max');
  assert.equal(status.errorCode, 0);
});

test('an older robot falls back to the V1 commands, once', async () => {
  const { robot, fake } = makeRobot(ROBOT_920);
  fake.robots[ROBOT_920.did].answers = defaultAnswers({ v2: false });
  await robot.readStatus();
  assert.equal(robot.protocol, 'v1');
  await robot.readStatus();
  const names = fake.commands(ROBOT_920.did).map((c) => c.name);
  assert.equal(names.filter((n) => n === 'getCleanInfo_V2').length, 1, 'V2 asked once only');
  assert.equal(names.filter((n) => n === 'getCleanInfo').length, 2);

  await robot.start(VACUUM_STATE.STOPPED);
  assert.deepEqual(fake.commands(ROBOT_920.did).at(-1), {
    name: 'clean',
    data: { act: 'start', type: 'auto' },
  });
});

test('clean commands on a V2 robot: start, resume when paused, stop', async () => {
  const { robot, fake } = makeRobot();
  await robot.start(VACUUM_STATE.STOPPED);
  assert.deepEqual(fake.commands(ROBOT_T8.did).at(-1), {
    name: 'clean_V2',
    data: { act: 'start', content: { type: 'auto' } },
  });
  await robot.start(VACUUM_STATE.PAUSED);
  assert.deepEqual(fake.commands(ROBOT_T8.did).at(-1).data, { act: 'resume', content: {} });
  await robot.stop();
  assert.deepEqual(fake.commands(ROBOT_T8.did).at(-1).data, { act: 'stop', content: {} });
});

test('dock, suction and locate commands', async () => {
  const { robot, fake } = makeRobot();
  await robot.returnToDock();
  assert.deepEqual(fake.commands(ROBOT_T8.did).at(-1), { name: 'charge', data: { act: 'go' } });
  await robot.setSuction('quiet');
  assert.deepEqual(fake.commands(ROBOT_T8.did).at(-1), {
    name: 'setSpeed',
    data: { speed: 1000 },
  });
  await robot.locate();
  assert.deepEqual(fake.commands(ROBOT_T8.did).at(-1), {
    name: 'playSound',
    data: { count: 1, sid: 30 },
  });
  assert.throws(() => robot.setSuction('turbo'), /Unknown suction level/);
});

test('a missing part of the status is left undefined, not 0', async () => {
  const { robot, fake } = makeRobot();
  delete fake.robots[ROBOT_T8.did].answers.getSpeed;
  delete fake.robots[ROBOT_T8.did].answers.getBattery;
  const status = await robot.readStatus();
  assert.equal(status.suction, undefined);
  assert.equal(status.battery, undefined);
});

test('consumables of a vacuum and of a mower', async () => {
  const { robot } = makeRobot();
  assert.deepEqual(await robot.readConsumables(), {
    'main-brush': 83,
    'side-brush': 50,
    filter: 0,
  });

  const mower = makeRobot(ROBOT_GOAT);
  mower.fake.robots[ROBOT_GOAT.did].answers.getLifeSpan = [
    { type: 'blade', left: 90, total: 100 },
    { type: 'lensBrush', left: 30, total: 100 },
  ];
  assert.deepEqual(await mower.robot.readConsumables(), { blade: 90, 'lens-brush': 30 });
  assert.deepEqual(mower.fake.commands(ROBOT_GOAT.did).at(-1).data, ['blade', 'lensBrush']);
});

test('a mower is not asked for its suction', async () => {
  const { robot, fake } = makeRobot(ROBOT_GOAT);
  await robot.readStatus();
  assert.ok(!fake.commands(ROBOT_GOAT.did).some((c) => c.name === 'getSpeed'));
});
