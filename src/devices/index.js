// -----------------------------------------------------------------------------
// The robots of the Ecovacs account, as Gladys devices.
//
// Unlike a fixed device catalog, the list comes from the cloud
// (GetGlobalDeviceList) and can change: the Fleet keeps one entry per robot,
// with what the previous poll saw (for the scene triggers) and the transport
// last published (for the badge).
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { Robot } from '../ecovacs/robot.js';
import { consumableEvents, transitionEvents } from '../capabilities/scenes.js';
import { ROBOT_WIDGET } from '../capabilities/widget.js';
import { FEATURE, buildRobotDevice, consumableStates, robotIds, statusStates } from './robot.js';

const logger = createLogger({ name: 'fleet' });

// Consumables wear slowly: read them every half hour, not at every poll.
const CONSUMABLES_EVERY_MS = 30 * 60_000;

// An unchanged state is sent again this often, so Gladys never shows a stable
// value as stale.
export const STATE_HEARTBEAT_MS = 30 * 60_000;

// A poll for a robot the list does not know (added in the app since the
// start) re-reads the list, at most this often.
const LIST_REFRESH_MIN_MS = 5 * 60_000;

// The robot or the cloud did not answer: the device is unreachable, which is
// not a bug of the integration.
const UNREACHABLE_KINDS = new Set(['offline', 'network']);

export class Fleet {
  /**
   * @param {object} gladys SDK instance
   * @param {{ now?: () => number }} [options]
   */
  constructor(gladys, { now = Date.now } = {}) {
    this.gladys = gladys;
    this.now = now;
    this.client = null;
    this.config = null;
    this.entries = new Map(); // did -> { robot, previous, consumables, consumablesAt, transport }
    this.unsupported = []; // names of the robots this integration cannot drive
    this.listedAt = 0;
  }

  /** Switch to another account (config update): forget everything known. */
  use(client, config) {
    this.client = client;
    this.config = config;
    this.entries = new Map();
    this.unsupported = [];
    this.listedAt = 0;
  }

  get robots() {
    return [...this.entries.values()].map((entry) => entry.robot);
  }

  /** Read the robot list from the cloud. */
  async refresh() {
    const list = await this.client.getDevices();
    const entries = new Map();
    const unsupported = [];
    for (const info of list) {
      if (!info?.did) {
        continue;
      }
      // The oldest robots (Deebot 600/900 series...) speak an XML protocol
      // over XMPP that this integration does not implement.
      if (info.company === 'eco-legacy') {
        unsupported.push(info.nick || info.deviceName || info.did);
        continue;
      }
      const known = this.entries.get(info.did);
      if (known) {
        known.robot.info = info;
        entries.set(info.did, known);
      } else {
        entries.set(info.did, {
          robot: new Robot(this.client, info),
          previous: undefined,
          consumables: undefined,
          consumablesAt: 0,
          transport: undefined,
        });
      }
    }
    if (unsupported.length > 0) {
      logger.warn(`Robots not supported (legacy protocol): ${unsupported.join(', ')}`);
    }
    this.entries = entries;
    this.unsupported = unsupported;
    this.listedAt = this.now();
    logger.info(`${entries.size} robot(s) on the Ecovacs account`);
    return this.robots;
  }

  discoveredDevices() {
    return this.robots.map((robot) => buildRobotDevice(this.gladys, robot, this.config));
  }

  findEntry(externalId) {
    for (const entry of this.entries.values()) {
      if (robotIds(this.gladys, entry.robot.info).device === externalId) {
        return entry;
      }
    }
    return undefined;
  }

  async entryFor(externalId) {
    const entry = this.findEntry(externalId);
    if (entry || !this.client || this.now() - this.listedAt < LIST_REFRESH_MIN_MS) {
      return entry;
    }
    await this.refresh();
    return this.findEntry(externalId);
  }

  /** Gladys asks for fresh states of one robot. */
  async poll(device) {
    const entry = await this.entryFor(device.external_id);
    if (!entry) {
      logger.debug(`Poll ignored: ${device.external_id} is not on the account`);
      return;
    }
    const { robot } = entry;
    const ids = robotIds(this.gladys, robot.info);

    let status;
    try {
      status = await robot.readStatus();
    } catch (err) {
      if (UNREACHABLE_KINDS.has(err.kind)) {
        logger.warn(`${robot.name}: ${err.message}`);
        await this.setTransport(entry, DEVICE_TRANSPORTS.UNREACHABLE);
        this.refreshWidget();
        return;
      }
      throw err;
    }
    await this.setTransport(entry, DEVICE_TRANSPORTS.CLOUD);
    await this.publish(statusStates(ids, status));

    const who = { device: ids.device, name: robot.name };
    const events = transitionEvents(entry.previous, status, who);

    if (this.now() - entry.consumablesAt >= CONSUMABLES_EVERY_MS) {
      entry.consumablesAt = this.now();
      try {
        const consumables = await robot.readConsumables();
        const states = consumableStates(ids, consumables);
        if (states.length > 0) {
          await this.publish(states);
        }
        events.push(...consumableEvents(entry.consumables, consumables, robot.consumables, who));
        entry.consumables = consumables;
      } catch (err) {
        logger.debug(`${robot.name}: consumables not read (${err.message})`);
      }
    }

    // The widget shows the computed rows (state, error, suction): nudge it
    // when one of them changed rather than at every poll.
    if (widgetRowsChanged(entry.previous, status)) {
      this.refreshWidget();
    }
    entry.previous = status;
    for (const event of events) {
      try {
        await this.gladys.publishSceneEvent(event.key, event.data);
      } catch (err) {
        logger.error(`Scene trigger ${event.key} refused`, err);
      }
    }
  }

  /** The user acts on a feature. Throwing tells Gladys the command failed. */
  async setValue(device, feature, value) {
    const entry = await this.entryFor(device.external_id);
    if (!entry) {
      throw new Error(`${device.external_id} is not on the Ecovacs account`);
    }
    const { robot } = entry;
    const key = feature.external_id.slice(device.external_id.length + 1);
    logger.info(`${robot.name}: ${key} <- ${value}`);
    switch (key) {
      case FEATURE.RUN_MODE:
        if (Number(value) === 1) {
          await robot.start(entry.previous?.state);
        } else {
          await robot.stop();
        }
        return;
      case FEATURE.DOCK:
        // 0 has nothing to undo: the robot simply stays where it is.
        if (Number(value) === 1) {
          await robot.returnToDock();
        }
        return;
      case FEATURE.SUCTION:
        await robot.setSuction(String(value));
        // Through the same memory as the polls: a robot that ignored the order
        // reads its old level at the next poll, which then differs and goes out.
        await this.publish([
          { device_feature_external_id: feature.external_id, text: String(value) },
        ]);
        return;
      default:
        throw new Error(`Feature "${key}" cannot be controlled`);
    }
  }

  /**
   * One order to a robot, from a scene action, a widget button or the
   * Configuration screen. Resolves false when the robot is unknown or did not
   * take the order: the callers turn that into an output or a message.
   * @param {string} externalId device external id
   * @param {'start'|'pause'|'stop'|'dock'|'locate'} act
   */
  async act(externalId, act) {
    const entry = await this.entryFor(externalId);
    if (!entry) {
      return false;
    }
    const { robot } = entry;
    logger.info(`${robot.name}: ${act}`);
    try {
      switch (act) {
        case 'start':
          await robot.start(entry.previous?.state);
          break;
        case 'pause':
          await robot.pause();
          break;
        case 'stop':
          await robot.stop();
          break;
        case 'dock':
          await robot.returnToDock();
          break;
        case 'locate':
          await robot.locate();
          break;
        default:
          throw new Error(`Unknown order "${act}"`);
      }
      return true;
    } catch (err) {
      logger.warn(`${robot.name}: ${act} failed (${err.message})`);
      return false;
    }
  }

  locate(externalId) {
    return this.act(externalId, 'locate');
  }

  /** What the widget shows of a robot: its last status and badge. */
  snapshot(externalId) {
    const entry = this.findEntry(externalId);
    if (!entry) {
      return undefined;
    }
    return {
      robot: entry.robot,
      ids: robotIds(this.gladys, entry.robot.info),
      status: entry.previous,
      consumables: entry.consumables,
      transport: entry.transport,
    };
  }

  // Gladys takes 300 states a minute per integration and keeps a history row
  // per state: a robot polled every 15 s mostly repeats itself. Only what
  // changed goes out, plus every value each STATE_HEARTBEAT_MS so a stable one
  // never looks stale. The SDK forgets a device's values when Gladys creates,
  // updates or deletes it; index.js forgets them all on every (re)connection.
  async publish(states) {
    await this.gladys.publishChangedStates(states, { heartbeat: STATE_HEARTBEAT_MS });
  }

  // Fire-and-forget, rate-limited by the core (1 per 10 s).
  refreshWidget() {
    this.gladys.requestWidgetRefresh?.(ROBOT_WIDGET);
  }

  // Badge on the device card: `cloud` when the robot answered through the
  // cloud, `unreachable` otherwise. Published on change only.
  async setTransport(entry, transport) {
    if (entry.transport === transport) {
      return;
    }
    try {
      await this.gladys.publishTransports([
        { external_id: robotIds(this.gladys, entry.robot.info).device, transport },
      ]);
      entry.transport = transport;
    } catch (err) {
      logger.debug(`Transport badge not published (${err.message})`);
    }
  }
}

function widgetRowsChanged(previous, current) {
  return (
    !previous ||
    previous.state !== current.state ||
    previous.errorCode !== current.errorCode ||
    previous.suction !== current.suction
  );
}
