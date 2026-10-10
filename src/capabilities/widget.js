// -----------------------------------------------------------------------------
// Dashboard widget "Ecovacs robot" (Gladys 5.1+).
//
// One robot per widget instance (setting `device`, a dynamic select of the
// integration's devices). The content is built from what the last poll saw:
// opening a dashboard never costs a cloud request. The battery tile is bound
// to its device feature (live, nothing to refresh); the status rows are
// computed here, and the Fleet nudges the widget when they change. The core
// keeps 8 components at most: heading, battery, status rows, 4 buttons (+ the
// "waiting" text before the first poll).
//
// The widget key and its action keys are stored by users: never rename them.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { SUCTION_LEVELS, VACUUM_STATE, errorMessage } from '../ecovacs/robot.js';
import { CONSUMABLE_LOW_PERCENT } from './scenes.js';

export const ROBOT_WIDGET = 'robot';

const STATE_LABELS = {
  [VACUUM_STATE.STOPPED]: { en: 'Stopped', fr: 'Arrêté' },
  [VACUUM_STATE.RUNNING]: { en: 'Working', fr: 'En marche' },
  [VACUUM_STATE.PAUSED]: { en: 'Paused', fr: 'En pause' },
  [VACUUM_STATE.ERROR]: { en: 'Error', fr: 'En erreur' },
  [VACUUM_STATE.RETURNING_TO_DOCK]: { en: 'Returning to dock', fr: 'Retour à la base' },
  [VACUUM_STATE.CHARGING]: { en: 'Charging', fr: 'En charge' },
  [VACUUM_STATE.DOCKED]: { en: 'Docked', fr: 'Sur la base' },
};

const STATE_COLORS = {
  [VACUUM_STATE.STOPPED]: WIDGET_COLORS.NEUTRAL,
  [VACUUM_STATE.RUNNING]: WIDGET_COLORS.PRIMARY,
  [VACUUM_STATE.PAUSED]: WIDGET_COLORS.WARNING,
  [VACUUM_STATE.ERROR]: WIDGET_COLORS.DANGER,
  [VACUUM_STATE.RETURNING_TO_DOCK]: WIDGET_COLORS.INFO,
  [VACUUM_STATE.CHARGING]: WIDGET_COLORS.SUCCESS,
  [VACUUM_STATE.DOCKED]: WIDGET_COLORS.SUCCESS,
};

const T = {
  state: { en: 'State', fr: 'État' },
  error: { en: 'Error', fr: 'Erreur' },
  suction: { en: 'Suction', fr: 'Aspiration' },
  link: { en: 'Connection', fr: 'Connexion' },
  battery: { en: 'Battery', fr: 'Batterie' },
  cloud: { en: 'Cloud', fr: 'Cloud' },
  unreachable: { en: 'Unreachable', fr: 'Injoignable' },
  start: { en: 'Start', fr: 'Démarrer' },
  resume: { en: 'Resume', fr: 'Reprendre' },
  pause: { en: 'Pause', fr: 'Pause' },
  stop: { en: 'Stop', fr: 'Arrêter' },
  dock: { en: 'Dock', fr: 'Base' },
  locate: { en: 'Locate', fr: 'Localiser' },
  waiting: {
    en: 'Waiting for the first reading of the robot.',
    fr: 'En attente de la première lecture du robot.',
  },
  unknown: {
    en: 'Pick a robot of the Ecovacs account in the widget settings.',
    fr: 'Choisissez un robot du compte Ecovacs dans les réglages du widget.',
  },
};

// Short consumable labels (tile labels hold 24 characters).
const CONSUMABLE_LABELS = {
  'main-brush': { en: 'Main brush', fr: 'Brosse princ.' },
  'side-brush': { en: 'Side brush', fr: 'Brosse latérale' },
  filter: { en: 'Filter', fr: 'Filtre' },
  blade: { en: 'Blades', fr: 'Lames' },
  'lens-brush': { en: 'Lens brush', fr: 'Brosse caméra' },
};

const SUCTION_LABELS = {
  quiet: { en: 'Quiet', fr: 'Silencieux' },
  standard: { en: 'Standard', fr: 'Standard' },
  max: { en: 'Max', fr: 'Max' },
  max_plus: { en: 'Max+', fr: 'Max+' },
};

const pick = (text, language) => text[language] ?? text.en;

/**
 * Content of one widget instance.
 * @param {import('../devices/index.js').Fleet} fleet
 * @param {{ settings?: { device?: string }, language?: string }} request
 */
export function buildRobotWidget(fleet, { settings = {}, language = 'en' } = {}) {
  const snapshot = settings.device ? fleet.snapshot(settings.device) : undefined;
  if (!snapshot) {
    return { ttl_seconds: 60, components: [{ type: 'text', text: T.unknown }] };
  }
  const { robot, ids, status, consumables = {}, transport } = snapshot;
  const components = [
    { type: 'text', variant: 'heading', text: robot.name.slice(0, 40) },
    { type: 'value', label: T.battery, device_feature: ids.feature('battery') },
  ];

  if (!status) {
    components.push({ type: 'text', text: T.waiting });
  } else {
    const items = [
      {
        label: T.state,
        value: pick(STATE_LABELS[status.state], language),
        color: STATE_COLORS[status.state],
      },
      {
        label: T.error,
        value: pick(errorMessage(status.errorCode), language).slice(0, 40),
        color: status.errorCode ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
      },
    ];
    if (status.suction && SUCTION_LEVELS.some((level) => level.key === status.suction)) {
      items.push({ label: T.suction, value: pick(SUCTION_LABELS[status.suction], language) });
    }
    // Consumables wear slowly: rows, not live tiles (the tile budget is 6).
    for (const consumable of robot.consumables) {
      const percent = consumables[consumable.key];
      if (percent !== undefined) {
        items.push({
          label: CONSUMABLE_LABELS[consumable.key] ?? { en: consumable.name },
          value: `${percent} %`,
          color: percent <= CONSUMABLE_LOW_PERCENT ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
        });
      }
    }
    if (transport) {
      const reachable = transport !== DEVICE_TRANSPORTS.UNREACHABLE;
      items.push({
        label: T.link,
        value: pick(reachable ? T.cloud : T.unreachable, language),
        color: reachable ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
      });
    }
    components.push({ type: 'status', items });
  }

  // Four buttons at most: the first one follows the state.
  const working = status?.state === VACUUM_STATE.RUNNING;
  const paused = status?.state === VACUUM_STATE.PAUSED;
  components.push(
    working
      ? button(T.pause, 'pause', 'pause', 'secondary')
      : button(paused ? T.resume : T.start, 'start', 'play', 'primary'),
    button(T.stop, 'stop', 'square', 'secondary'),
    button(T.dock, 'dock', 'home', 'secondary'),
    button(T.locate, 'locate', 'volume-2', 'secondary'),
  );

  // Status rows move with the polls: no need to be pulled faster than them.
  return {
    ttl_seconds: Math.max(10, Math.round(fleet.config.poll_frequency_ms / 1000)),
    components,
  };
}

function button(label, key, icon, style) {
  return { type: 'button', label, icon, style, action: { key } };
}

const ACTION_DONE = {
  start: { en: 'Order sent: start.', fr: 'Ordre envoyé : démarrage.' },
  pause: { en: 'Order sent: pause.', fr: 'Ordre envoyé : pause.' },
  stop: { en: 'Order sent: stop.', fr: 'Ordre envoyé : arrêt.' },
  dock: { en: 'Order sent: back to the dock.', fr: 'Ordre envoyé : retour à la base.' },
  locate: { en: 'Listen: the robot says where it is.', fr: 'Écoutez : le robot se signale.' },
};

/**
 * A widget button was tapped. Resolves the toast shown to the user.
 * @param {import('../devices/index.js').Fleet} fleet
 * @param {{ actionKey: string, settings?: { device?: string } }} request
 */
export async function runRobotWidgetAction(fleet, { actionKey, settings = {} }) {
  if (!ACTION_DONE[actionKey]) {
    throw new Error(`Unknown widget action "${actionKey}"`);
  }
  if (!(await fleet.act(settings.device, actionKey))) {
    return {
      en: 'The robot did not take the order. Is it switched on and connected?',
      fr: 'Le robot n’a pas pris l’ordre. Est-il allumé et connecté ?',
    };
  }
  fleet.refreshWidget();
  return ACTION_DONE[actionKey];
}

// Widgets by manifest `widgets` key.
export const WIDGETS = {
  [ROBOT_WIDGET]: {
    get: (fleet, request) => buildRobotWidget(fleet, request),
    action: (fleet, request) => runRobotWidgetAction(fleet, request),
  },
};
