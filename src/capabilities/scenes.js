// -----------------------------------------------------------------------------
// Scene triggers and scene actions (Gladys 5.1+).
//
// Triggers say something HAPPENED, once per transition, read from two
// consecutive polls of the same robot: the state itself stays a device
// feature. Their keys are declared in the manifest `scene_triggers` and stored
// in the users' scenes: never rename one.
// -----------------------------------------------------------------------------

import { VACUUM_STATE, errorMessage } from '../ecovacs/robot.js';

export const SCENE_TRIGGERS = {
  CLEANING_STARTED: 'cleaning_started',
  CLEANING_FINISHED: 'cleaning_finished',
  ROBOT_DOCKED: 'robot_docked',
  ROBOT_ERROR: 'robot_error',
  CONSUMABLE_LOW: 'consumable_low',
};

// A consumable at or below this share of its life is worth a notification.
export const CONSUMABLE_LOW_PERCENT = 10;

const CLEANING = [VACUUM_STATE.RUNNING, VACUUM_STATE.PAUSED];
const DONE = [
  VACUUM_STATE.STOPPED,
  VACUUM_STATE.RETURNING_TO_DOCK,
  VACUUM_STATE.CHARGING,
  VACUUM_STATE.DOCKED,
];
const ON_DOCK = [VACUUM_STATE.CHARGING, VACUUM_STATE.DOCKED];

/**
 * The scene events between two statuses of the same robot.
 * @param {object|undefined} previous status of the previous poll (none on the first one)
 * @param {object} current status just read
 * @param {{ device: string, name: string }} robot external id and name
 * @returns {Array<{ key: string, data: object }>}
 */
export function transitionEvents(previous, current, robot) {
  if (!previous) {
    // First read after a (re)start: nothing to compare with, and firing
    // here would replay an old error at every restart.
    return [];
  }
  const base = { device: robot.device, name: robot.name };
  const events = [];
  // Resuming after a pause is not a new start.
  if (current.state === VACUUM_STATE.RUNNING && !CLEANING.includes(previous.state)) {
    events.push({ key: SCENE_TRIGGERS.CLEANING_STARTED, data: base });
  }
  if (CLEANING.includes(previous.state) && DONE.includes(current.state)) {
    events.push({ key: SCENE_TRIGGERS.CLEANING_FINISHED, data: base });
  }
  if (ON_DOCK.includes(current.state) && !ON_DOCK.includes(previous.state)) {
    events.push({ key: SCENE_TRIGGERS.ROBOT_DOCKED, data: base });
  }
  if (current.errorCode && current.errorCode !== previous.errorCode) {
    events.push({
      key: SCENE_TRIGGERS.ROBOT_ERROR,
      data: { ...base, code: current.errorCode, message: errorMessage(current.errorCode).en },
    });
  }
  return events;
}

/**
 * The consumables that just went down to CONSUMABLE_LOW_PERCENT or below.
 * @param {Record<string, number>|undefined} previous percents of the previous read
 * @param {Record<string, number>} current percents just read
 * @param {Array<{ key: string, name: string }>} consumables of the robot kind
 * @param {{ device: string, name: string }} robot
 */
export function consumableEvents(previous, current, consumables, robot) {
  if (!previous) {
    return [];
  }
  const events = [];
  for (const consumable of consumables) {
    const before = previous[consumable.key];
    const now = current[consumable.key];
    if (before > CONSUMABLE_LOW_PERCENT && now <= CONSUMABLE_LOW_PERCENT) {
      events.push({
        key: SCENE_TRIGGERS.CONSUMABLE_LOW,
        data: {
          device: robot.device,
          name: robot.name,
          consumable: consumable.key,
          consumable_name: consumable.name,
          percent: now,
        },
      });
    }
  }
  return events;
}

// Scene actions, by manifest `scene_actions` key: (fields, fleet) -> outputs.
// A robot that does not answer is an output (`false`), not a failure: the
// scene author gates on it.
export const SCENE_ACTIONS = {
  start_robot: async (fields, fleet) => ({ sent: await fleet.act(fields.device, 'start') }),
  pause_robot: async (fields, fleet) => ({ sent: await fleet.act(fields.device, 'pause') }),
  stop_robot: async (fields, fleet) => ({ sent: await fleet.act(fields.device, 'stop') }),
  return_to_dock: async (fields, fleet) => ({ sent: await fleet.act(fields.device, 'dock') }),
  locate_robot: async (fields, fleet) => ({ located: await fleet.act(fields.device, 'locate') }),
};
