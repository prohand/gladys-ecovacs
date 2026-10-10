// -----------------------------------------------------------------------------
// What a robot says, and what we say to it.
//
// Ecovacs robots (Deebot vacuums, GOAT lawn mowers) speak two generations of the same JSON protocol: the recent
// ones (T8 and later, X1, T10...) want the `_V2` commands (`getCleanInfo_V2`,
// `clean_V2`), the older ones (OZMO 920/950, N8...) the plain ones. Nothing in
// the robot list says which: the first status read tries V2 and falls back,
// and the answer is remembered per robot.
//
// The robot reports Ecovacs words (`clean`, `pause`, `goCharging`...); Gladys
// wants the generic vacuum-cleaner values below (mirrored from the Gladys core
// constants: the SDK does not export them).
// -----------------------------------------------------------------------------

import { EcovacsError } from './client.js';

// Gladys VACUUM_CLEANER_STATE (feature vacuum-cleaner / state).
export const VACUUM_STATE = {
  STOPPED: 0,
  RUNNING: 1,
  PAUSED: 2,
  ERROR: 3,
  RETURNING_TO_DOCK: 4,
  CHARGING: 5,
  DOCKED: 6,
};

// Gladys VACUUM_CLEANER_MODE (feature vacuum-cleaner / run-mode). Mapping
// (2) is a Gladys value no Ecovacs command starts: not offered.
export const RUN_MODE = { IDLE: 0, CLEANING: 1 };

// Ecovacs suction levels (getSpeed / setSpeed), by the key Gladys stores.
// The key is the value of the `text`/`select` feature: never rename one.
export const SUCTION_LEVELS = [
  { key: 'quiet', speed: 1000, label: 'Quiet' },
  { key: 'standard', speed: 0, label: 'Standard' },
  { key: 'max', speed: 1, label: 'Max' },
  { key: 'max_plus', speed: 2, label: 'Max+' },
];

// Consumables read with getLifeSpan, by robot kind and Ecovacs type. The key
// is part of a feature external id: never rename one.
export const CONSUMABLES = {
  vacuum: [
    { type: 'brush', key: 'main-brush', name: 'Main brush' },
    { type: 'sideBrush', key: 'side-brush', name: 'Side brush' },
    { type: 'heap', key: 'filter', name: 'Filter' },
  ],
  mower: [
    { type: 'blade', key: 'blade', name: 'Blades' },
    { type: 'lensBrush', key: 'lens-brush', name: 'Camera lens brush' },
  ],
};

/**
 * 'mower' for the GOAT lawn mowers, 'vacuum' for everything else (Deebot).
 * The cloud list has no reliable type field across generations: the product
 * name does say it ("GOAT G1", "GOAT O800 RTK"...).
 */
export function robotKind(info) {
  return /\bgoat\b/i.test(`${info?.deviceName ?? ''} ${info?.name ?? ''}`) ? 'mower' : 'vacuum';
}

// The codes `getError` reports (the ones users actually meet). 0 and 100 mean
// "no error"; an unknown code is still reported, with its number.
export const ERROR_MESSAGES = {
  101: { en: 'Battery low', fr: 'Batterie faible' },
  102: { en: 'Robot stuck in a loop', fr: 'Robot bloqué dans une boucle' },
  103: { en: 'Wheel problem', fr: 'Problème de roue' },
  104: { en: 'Cliff sensor problem', fr: 'Problème de capteur anti-chute' },
  105: { en: 'Robot stuck', fr: 'Robot coincé' },
  106: { en: 'Side brush worn out', fr: 'Brosse latérale usée' },
  107: { en: 'Dust bin full', fr: 'Bac à poussière plein' },
  108: { en: 'Side brush blocked', fr: 'Brosse latérale bloquée' },
  109: { en: 'Main brush blocked', fr: 'Brosse principale bloquée' },
  110: { en: 'Dust bin missing', fr: 'Bac à poussière absent' },
  111: { en: 'Bumper problem', fr: 'Problème de pare-chocs' },
  112: { en: 'Laser sensor problem', fr: 'Problème du capteur laser' },
  113: { en: 'Main brush worn out', fr: 'Brosse principale usée' },
  114: { en: 'Dust bin full', fr: 'Bac à poussière plein' },
  115: { en: 'Battery problem', fr: 'Problème de batterie' },
  116: { en: 'Front sensor problem', fr: 'Problème du capteur avant' },
  117: { en: 'Gyroscope problem', fr: 'Problème de gyroscope' },
  118: { en: 'Filter blocked', fr: 'Filtre bouché' },
  119: { en: 'Fan problem', fr: 'Problème de ventilateur' },
  120: { en: 'Water tank problem', fr: "Problème de réservoir d'eau" },
  204: { en: 'Wheel stuck', fr: 'Roue coincée' },
  312: { en: 'Replace the dust bag', fr: 'Remplacez le sac à poussière' },
  1007: { en: 'Mop plate loose', fr: 'Support de serpillière mal fixé' },
};

export const NO_ERROR = { en: 'No error', fr: 'Aucune erreur' };

export function errorMessage(code) {
  if (!code) {
    return NO_ERROR;
  }
  return ERROR_MESSAGES[code] ?? { en: `Error ${code}`, fr: `Erreur ${code}` };
}

/** Error code of a `getError` answer: `{ code: [105] }`, 0 when none. */
export function parseErrorCode(data) {
  const codes = Array.isArray(data?.code) ? data.code : [data?.code];
  const real = codes
    .map(Number)
    .filter((code) => Number.isFinite(code) && code !== 0 && code !== 100);
  return real[0] ?? 0;
}

/**
 * Gladys state from what the robot reported.
 * @param {object} status
 * @param {object} [status.cleanInfo] getCleanInfo(_V2) data
 * @param {object} [status.charge] getChargeState data
 * @param {number} [status.battery] percent
 * @param {number} [status.errorCode]
 */
export function toVacuumState({ cleanInfo, charge, battery, errorCode }) {
  if (errorCode) {
    return VACUUM_STATE.ERROR;
  }
  const state = cleanInfo?.state;
  const motion = cleanInfo?.cleanState?.motionState;
  if (state === 'goCharging' || motion === 'goCharging') {
    return VACUUM_STATE.RETURNING_TO_DOCK;
  }
  if (state === 'clean') {
    return motion === 'pause' ? VACUUM_STATE.PAUSED : VACUUM_STATE.RUNNING;
  }
  if (Number(charge?.isCharging) === 1) {
    return battery >= 100 ? VACUUM_STATE.DOCKED : VACUUM_STATE.CHARGING;
  }
  return VACUUM_STATE.STOPPED;
}

export function suctionKey(speed) {
  return SUCTION_LEVELS.find((level) => level.speed === Number(speed))?.key;
}

/** Percent left of a consumable from a getLifeSpan entry `{ type, left, total }`. */
export function lifePercent(entry) {
  const left = Number(entry?.left);
  const total = Number(entry?.total);
  if (!Number.isFinite(left) || !Number.isFinite(total) || total <= 0) {
    return undefined;
  }
  return Math.max(0, Math.min(100, Math.round((left / total) * 100)));
}

/**
 * One robot of the account, with the protocol generation it speaks.
 */
export class Robot {
  /**
   * @param {import('./client.js').EcovacsClient} client
   * @param {object} info the robot as GetGlobalDeviceList describes it
   */
  constructor(client, info) {
    this.client = client;
    this.info = info;
    // null until the first status read tells 'v2' from 'v1'.
    this.protocol = null;
  }

  get did() {
    return this.info.did;
  }

  get name() {
    return this.info.nick || this.info.deviceName || this.info.name || this.info.did;
  }

  get model() {
    return this.info.deviceName || this.info.class;
  }

  get kind() {
    return robotKind(this.info);
  }

  get consumables() {
    return CONSUMABLES[this.kind];
  }

  send(name, data) {
    return this.client.command(this.info, name, data);
  }

  async readCleanInfo() {
    if (this.protocol !== 'v1') {
      try {
        const data = await this.send('getCleanInfo_V2');
        this.protocol = 'v2';
        return data;
      } catch (err) {
        // A robot that does not know V2 refuses the command; a robot that
        // did not answer at all tells us nothing, keep asking V2 next time.
        if (this.protocol === 'v2' || !isRefusal(err)) {
          throw err;
        }
        this.protocol = 'v1';
      }
    }
    return this.send('getCleanInfo');
  }

  /**
   * Read everything the features show. A part the robot does not support is
   * left undefined; the robot not answering at all throws.
   */
  async readStatus() {
    const cleanInfo = await this.readCleanInfo();
    const [battery, charge, speed, error] = await Promise.all([
      this.send('getBattery').catch(ignoreRefusal),
      this.send('getChargeState').catch(ignoreRefusal),
      // A mower has no suction to read.
      this.kind === 'vacuum' ? this.send('getSpeed').catch(ignoreRefusal) : undefined,
      this.send('getError').catch(ignoreRefusal),
    ]);
    const status = {
      cleanInfo,
      charge,
      battery: battery?.value !== undefined ? Number(battery.value) : undefined,
      charging: charge ? Number(charge.isCharging) === 1 : undefined,
      suction: speed ? suctionKey(speed.speed) : undefined,
      errorCode: error ? parseErrorCode(error) : 0,
    };
    status.state = toVacuumState(status);
    return status;
  }

  /** Consumables, as `{ key: percent }`: read far less often than the status. */
  async readConsumables() {
    const data = await this.send(
      'getLifeSpan',
      this.consumables.map((c) => c.type),
    );
    const entries = Array.isArray(data) ? data : [];
    const result = {};
    for (const consumable of this.consumables) {
      const percent = lifePercent(entries.find((entry) => entry.type === consumable.type));
      if (percent !== undefined) {
        result[consumable.key] = percent;
      }
    }
    return result;
  }

  // act: 'start' | 'pause' | 'resume' | 'stop'
  async clean(act) {
    if (this.protocol === null) {
      await this.readCleanInfo();
    }
    if (this.protocol === 'v2') {
      return this.send('clean_V2', {
        act,
        content: act === 'start' ? { type: 'auto' } : {},
      });
    }
    return this.send('clean', act === 'start' ? { act, type: 'auto' } : { act });
  }

  /** Start cleaning, or resume it when the robot is paused. */
  start(currentState) {
    return this.clean(currentState === VACUUM_STATE.PAUSED ? 'resume' : 'start');
  }

  stop() {
    return this.clean('stop');
  }

  pause() {
    return this.clean('pause');
  }

  returnToDock() {
    return this.send('charge', { act: 'go' });
  }

  setSuction(key) {
    const level = SUCTION_LEVELS.find((l) => l.key === key);
    if (!level) {
      throw new EcovacsError(`Unknown suction level "${key}"`);
    }
    return this.send('setSpeed', { speed: level.speed });
  }

  /** "I'm here": the robot plays its locate sound. */
  locate() {
    return this.send('playSound', { count: 1, sid: 30 });
  }
}

// The robot answered, but said no (unknown command, not supported here).
export function isRefusal(err) {
  return err instanceof EcovacsError && err.kind === 'api';
}

function ignoreRefusal(err) {
  if (isRefusal(err)) {
    return undefined;
  }
  throw err;
}
