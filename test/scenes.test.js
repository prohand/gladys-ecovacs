import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCENE_ACTIONS,
  SCENE_TRIGGERS,
  consumableEvents,
  transitionEvents,
} from '../src/capabilities/scenes.js';
import { CONSUMABLES, VACUUM_STATE } from '../src/ecovacs/robot.js';

const ROBOT = { device: 'ext:ecovacs:vacuum:e1', name: 'Deebot' };
const S = VACUUM_STATE;
const keys = (events) => events.map((e) => e.key);

test('nothing fires on the first read', () => {
  assert.deepEqual(transitionEvents(undefined, { state: S.ERROR, errorCode: 105 }, ROBOT), []);
  assert.deepEqual(consumableEvents(undefined, { filter: 0 }, CONSUMABLES.vacuum, ROBOT), []);
});

test('a cleaning cycle: started, finished, docked', () => {
  assert.deepEqual(keys(transitionEvents({ state: S.DOCKED }, { state: S.RUNNING }, ROBOT)), [
    SCENE_TRIGGERS.CLEANING_STARTED,
  ]);
  assert.deepEqual(
    keys(transitionEvents({ state: S.RUNNING }, { state: S.RETURNING_TO_DOCK }, ROBOT)),
    [SCENE_TRIGGERS.CLEANING_FINISHED],
  );
  assert.deepEqual(
    keys(transitionEvents({ state: S.RETURNING_TO_DOCK }, { state: S.CHARGING }, ROBOT)),
    [SCENE_TRIGGERS.ROBOT_DOCKED],
  );
  // Charging -> docked is still on the dock.
  assert.deepEqual(transitionEvents({ state: S.CHARGING }, { state: S.DOCKED }, ROBOT), []);
});

test('resuming after a pause is not a new start, pausing is not the end', () => {
  assert.deepEqual(transitionEvents({ state: S.PAUSED }, { state: S.RUNNING }, ROBOT), []);
  assert.deepEqual(transitionEvents({ state: S.RUNNING }, { state: S.PAUSED }, ROBOT), []);
});

test('a short job between two polls straight back on the dock: finished and docked', () => {
  assert.deepEqual(keys(transitionEvents({ state: S.RUNNING }, { state: S.CHARGING }, ROBOT)), [
    SCENE_TRIGGERS.CLEANING_FINISHED,
    SCENE_TRIGGERS.ROBOT_DOCKED,
  ]);
});

test('one error event per new error code', () => {
  const [event] = transitionEvents(
    { state: S.RUNNING, errorCode: 0 },
    { state: S.ERROR, errorCode: 105 },
    ROBOT,
  );
  assert.deepEqual(event, {
    key: SCENE_TRIGGERS.ROBOT_ERROR,
    data: { ...ROBOT, code: 105, message: 'Robot stuck' },
  });
  assert.deepEqual(
    transitionEvents({ state: S.ERROR, errorCode: 105 }, { state: S.ERROR, errorCode: 105 }, ROBOT),
    [],
  );
});

test('a consumable fires once, when it crosses 10 %', () => {
  const events = consumableEvents(
    { filter: 12, 'main-brush': 50 },
    { filter: 9, 'main-brush': 49 },
    CONSUMABLES.vacuum,
    ROBOT,
  );
  assert.deepEqual(events, [
    {
      key: SCENE_TRIGGERS.CONSUMABLE_LOW,
      data: { ...ROBOT, consumable: 'filter', consumable_name: 'Filter', percent: 9 },
    },
  ]);
  assert.deepEqual(consumableEvents({ filter: 9 }, { filter: 8 }, CONSUMABLES.vacuum, ROBOT), []);
});

test('scene actions return their outputs, false when the robot did not take it', async () => {
  const calls = [];
  const fleet = {
    act: async (device, act) => {
      calls.push([device, act]);
      return act !== 'pause';
    },
  };
  assert.deepEqual(await SCENE_ACTIONS.start_robot({ device: 'd' }, fleet), { sent: true });
  assert.deepEqual(await SCENE_ACTIONS.pause_robot({ device: 'd' }, fleet), { sent: false });
  assert.deepEqual(await SCENE_ACTIONS.stop_robot({ device: 'd' }, fleet), { sent: true });
  assert.deepEqual(await SCENE_ACTIONS.return_to_dock({ device: 'd' }, fleet), { sent: true });
  assert.deepEqual(await SCENE_ACTIONS.locate_robot({ device: 'd' }, fleet), { located: true });
  assert.deepEqual(
    calls.map((c) => c[1]),
    ['start', 'pause', 'stop', 'dock', 'locate'],
  );
});
