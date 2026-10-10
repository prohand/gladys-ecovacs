// -----------------------------------------------------------------------------
// Device types: ROBOT VACUUM (Ecovacs Deebot) and LAWN MOWER (Ecovacs GOAT)
//
// One Gladys device per robot of the Ecovacs account, keyed on the cloud id
// of the robot (`did`): it never changes, even when the robot is renamed in
// the app. The features follow the Gladys `vacuum-cleaner` category (Gladys
// has no mower category, and a mower has the same life: work, pause, back to
// its station), plus the battery, the suction level (vacuums only), the last
// error and the wear of the consumables.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { SUCTION_LEVELS, VACUUM_STATE, errorMessage, robotKind } from '../ecovacs/robot.js';

// External id namespace per robot kind: never rename one.
export const DEVICE_TYPES = { vacuum: 'vacuum', mower: 'mower' };

// Feature keys: part of the external ids, never rename one.
export const FEATURE = {
  STATE: 'state',
  RUN_MODE: 'run-mode',
  DOCK: 'dock',
  SUCTION: 'suction',
  BATTERY: 'battery',
  CHARGING: 'charging',
  ERROR: 'error',
};

/**
 * External ids of a robot.
 * @param {object} gladys SDK instance
 * @param {object} info the robot as the cloud lists it (`did`, `deviceName`)
 */
export function robotIds(gladys, info) {
  return gladys.externalIds(DEVICE_TYPES[robotKind(info)], info.did);
}

/**
 * Discovery payload of one robot.
 * @param {object} gladys SDK instance
 * @param {import('../ecovacs/robot.js').Robot} robot
 * @param {object} config normalized config
 */
export function buildRobotDevice(gladys, robot, config) {
  const ids = robotIds(gladys, robot.info);
  const mower = robot.kind === 'mower';
  const { VACUUM_CLEANER, BATTERY, TEXT, MAINTENANCE } = DEVICE_FEATURE_CATEGORIES;
  const T = DEVICE_FEATURE_TYPES;
  return {
    name: robot.name,
    external_id: ids.device,
    model: robot.model,
    // Gladys polls only devices carrying both, and only at the frequencies
    // it knows (ms): see POLL_FREQUENCIES_MS in src/config.js.
    poll_frequency: config.poll_frequency_ms,
    should_poll: true,
    features: [
      {
        name: 'State',
        external_id: ids.feature(FEATURE.STATE),
        category: VACUUM_CLEANER,
        type: T.VACUUM_CLEANER.STATE,
        read_only: true,
        has_feedback: false,
        keep_history: true,
        min: VACUUM_STATE.STOPPED,
        max: VACUUM_STATE.DOCKED,
      },
      {
        // 1 starts (or resumes) a cleaning or a mowing, 0 stops it.
        name: mower ? 'Mowing' : 'Cleaning',
        external_id: ids.feature(FEATURE.RUN_MODE),
        category: VACUUM_CLEANER,
        type: T.VACUUM_CLEANER.RUN_MODE,
        read_only: false,
        has_feedback: false,
        keep_history: false,
        min: 0,
        max: 1,
      },
      {
        name: mower ? 'Return to station' : 'Return to dock',
        external_id: ids.feature(FEATURE.DOCK),
        category: VACUUM_CLEANER,
        type: T.VACUUM_CLEANER.DOCK,
        read_only: false,
        has_feedback: false,
        keep_history: false,
        min: 0,
        max: 1,
      },
      ...(mower ? [] : [suctionFeature(ids)]),
      {
        name: 'Battery',
        external_id: ids.feature(FEATURE.BATTERY),
        category: BATTERY,
        type: T.BATTERY.INTEGER,
        unit: DEVICE_FEATURE_UNITS.PERCENT,
        read_only: true,
        has_feedback: false,
        keep_history: true,
        min: 0,
        max: 100,
      },
      {
        name: 'Charging',
        external_id: ids.feature(FEATURE.CHARGING),
        category: BATTERY,
        type: T.BATTERY.CHARGING,
        read_only: true,
        has_feedback: false,
        keep_history: true,
        min: 0,
        max: 1,
      },
      {
        name: 'Last error',
        external_id: ids.feature(FEATURE.ERROR),
        category: TEXT,
        type: T.TEXT.TEXT,
        read_only: true,
        has_feedback: false,
        keep_history: false,
        min: 0,
        max: 0,
      },
      ...robot.consumables.map((consumable) => ({
        name: consumable.name,
        external_id: ids.feature(consumable.key),
        category: MAINTENANCE,
        type: T.MAINTENANCE.LIFE_REMAINING,
        unit: DEVICE_FEATURE_UNITS.PERCENT,
        read_only: true,
        has_feedback: false,
        keep_history: true,
        min: 0,
        max: 100,
      })),
    ],
  };
}

function suctionFeature(ids) {
  return {
    name: 'Suction power',
    external_id: ids.feature(FEATURE.SUCTION),
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.SELECT,
    read_only: false,
    has_feedback: false,
    keep_history: false,
    min: 0,
    max: 0,
    supported_options: SUCTION_LEVELS.map((level, index) => ({
      value: level.key,
      label: level.label,
      sort_order: index,
    })),
  };
}

/**
 * The states to publish for a status read by Robot.readStatus().
 * Parts the robot did not report are left out, not published as 0.
 */
export function statusStates(ids, status) {
  const states = [
    { device_feature_external_id: ids.feature(FEATURE.STATE), state: status.state },
    {
      device_feature_external_id: ids.feature(FEATURE.RUN_MODE),
      state: [VACUUM_STATE.RUNNING, VACUUM_STATE.PAUSED].includes(status.state) ? 1 : 0,
    },
    {
      device_feature_external_id: ids.feature(FEATURE.DOCK),
      state: status.state === VACUUM_STATE.RETURNING_TO_DOCK ? 1 : 0,
    },
    {
      device_feature_external_id: ids.feature(FEATURE.ERROR),
      text: errorText(status.errorCode),
    },
  ];
  if (status.battery !== undefined && Number.isFinite(status.battery)) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE.BATTERY),
      state: status.battery,
    });
  }
  if (status.charging !== undefined) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE.CHARGING),
      state: status.charging ? 1 : 0,
    });
  }
  if (status.suction !== undefined) {
    states.push({ device_feature_external_id: ids.feature(FEATURE.SUCTION), text: status.suction });
  }
  return states;
}

export function consumableStates(ids, consumables) {
  return Object.entries(consumables).map(([key, percent]) => ({
    device_feature_external_id: ids.feature(key),
    state: percent,
  }));
}

// The text feature holds one language: English, with the code so it can be
// looked up (docs/en.md, docs/fr.md).
export function errorText(code) {
  return code ? `${errorMessage(code).en} (${code})` : errorMessage(0).en;
}
