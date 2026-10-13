// -----------------------------------------------------------------------------
// Entry point of the Ecovacs integration for Gladys Assistant.
//
// This file only wires the SDK to the robot fleet (src/devices/) and the
// Ecovacs cloud client (src/ecovacs/): handlers are registered BEFORE
// connect(), then the account is opened and the robots are published.
//
// Environment variables provided by the Gladys supervisor to the container
// (read by the SDK): GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN,
// GLADYS_INTEGRATION_SELECTOR.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { isConfigured, normalizeConfig } from './src/config.js';
import { EcovacsClient } from './src/ecovacs/client.js';
import { Fleet } from './src/devices/index.js';
import { SCENE_ACTIONS } from './src/capabilities/scenes.js';
import { WIDGETS } from './src/capabilities/widget.js';
import {
  CODE_SENT,
  NOT_CONFIGURED,
  actionError,
  failureMessage,
  successMessage,
} from './src/connection.js';

const gladys = new GladysIntegration();
const fleet = new Fleet(gladys);

let config = normalizeConfig();

// When the cloud could not be reached, try again later on our own: Gladys
// only polls robots it already knows.
const RETRY_DELAY_MS = 5 * 60_000;
let retryTimer = null;

function applyConfig(raw) {
  config = normalizeConfig(raw);
  fleet.use(
    new EcovacsClient({ email: config.email, password: config.password, country: config.country }),
    config,
  );
}

function cancelRetry() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

/**
 * Open the account, read the robots and publish them. Reports the outcome as
 * the connection status, and returns it with the message for the user.
 * @returns {Promise<{ connected: boolean, message: object }>}
 */
async function connectCloud() {
  cancelRetry();
  if (!isConfigured(config)) {
    await gladys.setConnectionStatus(false, NOT_CONFIGURED);
    return { connected: false, message: NOT_CONFIGURED };
  }
  try {
    const robots = await fleet.refresh();
    await gladys.publishDiscoveredDevices(fleet.discoveredDevices());
    await gladys.setConnectionStatus(true);
    // The robot list may have changed, and nudges sent while the socket was
    // down were dropped: re-sync the open dashboards.
    fleet.refreshWidget();
    return {
      connected: true,
      message: successMessage(fleet.client.account, robots, fleet.unsupported),
    };
  } catch (err) {
    logger.error(`Ecovacs connection failed for ${fleet.client.account}: ${err.message}`);
    const message = failureMessage(err);
    await gladys.setConnectionStatus(false, message).catch(() => {});
    // Wrong credentials stay wrong until the user changes them (which
    // reconnects): retrying would only risk locking the account. Same for a
    // device verification, which waits for the emailed code.
    if (err.kind !== 'credentials' && err.kind !== 'verification') {
      retryTimer = setTimeout(() => connectCloud().catch(() => {}), RETRY_DELAY_MS);
      retryTimer.unref?.();
    }
    return { connected: false, message };
  }
}

// --- Discovery: Gladys asks for the list of devices --------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> reading the robots of the account');
  await connectCloud();
});

// --- Polling: Gladys asks for fresh states of a robot ------------------------
gladys.onPoll(async (device) => {
  await fleet.poll(device);
});

// --- Command: the user acts on a feature (start, dock, suction) --------------
gladys.onSetValue(async (device, feature, value) => {
  await fleet.setValue(device, feature, value);
});

// --- Manifest actions: buttons of the Configuration screen -------------------
gladys.onAction('test_connection', async () => {
  // A deliberate test bypasses the pause after a failed login.
  fleet.client.loginFailure = null;
  fleet.client.logout();
  const { connected, message } = await connectCloud();
  if (!connected) {
    throw actionError(message);
  }
  return message;
});

// Device verification asked by Ecovacs (login code 1013): one action mails
// the code, the other sends it back and opens the session.
gladys.onAction('send_verification_code', async () => {
  if (!isConfigured(config)) {
    throw actionError(NOT_CONFIGURED);
  }
  try {
    await fleet.client.requestVerificationCode();
  } catch (err) {
    logger.error(`Ecovacs verification code not sent for ${fleet.client.account}: ${err.message}`);
    throw actionError(failureMessage(err));
  }
  logger.info(`Ecovacs verification code sent to ${fleet.client.account}`);
  return CODE_SENT;
});

gladys.onAction('verify_device', async (fields) => {
  if (!isConfigured(config)) {
    throw actionError(NOT_CONFIGURED);
  }
  try {
    await fleet.client.verifyDevice(fields.code);
  } catch (err) {
    logger.error(`Ecovacs device verification failed for ${fleet.client.account}: ${err.message}`);
    throw actionError(failureMessage(err));
  }
  logger.info(`Ecovacs device verified for ${fleet.client.account}`);
  const { connected, message } = await connectCloud();
  if (!connected) {
    throw actionError(message);
  }
  return message;
});

gladys.onAction('locate', async (fields) => {
  if (await fleet.locate(fields.device)) {
    return {
      en: 'Listen: the robot says where it is.',
      fr: 'Écoutez : le robot indique où il se trouve.',
      de: 'Hören Sie hin: Der Roboter zeigt an, wo er sich befindet.',
      es: 'Escuche: el robot indica dónde se encuentra.',
    };
  }
  return {
    en: 'The robot did not answer. Is it switched on and connected to Wi-Fi?',
    fr: 'Le robot n’a pas répondu. Est-il allumé et connecté au Wi-Fi ?',
    de: 'Der Roboter hat nicht geantwortet. Ist er eingeschaltet und mit dem WLAN verbunden?',
    es: 'El robot no ha respondido. ¿Está encendido y conectado a la red wifi?',
  };
});

// --- Scene actions (Gladys 5.1+) ---------------------------------------------
for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(key, (fields) => handler(fields, fleet));
}

// --- Dashboard widget (Gladys 5.1+) -----------------------------------------
// Content built from the last poll (no cloud request on display); the buttons
// reach onWidgetAction with the action key the content declared.
for (const [key, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(key, (request) => widget.get(fleet, request));
  gladys.onWidgetAction(key, (actionKey, params, { settings }) =>
    widget.action(fleet, { actionKey, params, settings }),
  );
}

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  applyConfig(newConfig);
  await connectCloud();
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  try {
    applyConfig(await gladys.getConfig());
    await connectCloud();
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
        de: 'Die Initialisierung ist fehlgeschlagen, sehen Sie in den Protokollen der Integration nach.',
        es: 'La inicialización ha fallado, consulte los registros de la integración.',
      })
      .catch(() => {});
  }
});

gladys.on('disconnected', () => {
  cancelRetry();
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  cancelRetry();
});

// An unexpected rejection is logged, not fatal: the next poll tries again.
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled promise rejection', err);
});

// --- Startup -----------------------------------------------------------------
applyConfig();
logger.info('Starting the Ecovacs integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
