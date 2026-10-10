// -----------------------------------------------------------------------------
// Minimal in-memory stand-in for the Gladys SDK object, for unit tests.
//
// It reproduces the only surface the code relies on, and records every call
// so the tests can assert them, without a running Gladys server.
// -----------------------------------------------------------------------------

export function createFakeGladys() {
  const published = [];
  const transports = [];
  const sceneEvents = [];
  const connectionStatuses = [];

  return {
    published,
    transports,
    sceneEvents,
    connectionStatuses,

    externalIds(type, platformId) {
      const device = `ext:ecovacs:${type}:${platformId}`;
      return { device, feature: (key) => `${device}:${key}` };
    },

    async publishState(featureExternalId, value) {
      const state = { device_feature_external_id: featureExternalId };
      if (value !== null && typeof value === 'object') {
        Object.assign(state, value);
      } else {
        state.state = value;
      }
      published.push(state);
    },

    async publishStates(states) {
      published.push(...states);
    },

    async publishTransports(entries) {
      transports.push(...entries);
    },

    async publishSceneEvent(key, data = {}) {
      sceneEvents.push({ key, data });
      return { success: true };
    },

    async setConnectionStatus(connected, message) {
      connectionStatuses.push({ connected, message });
    },
  };
}

/** Last published value of a feature (number state or text). */
export function lastValue(gladys, featureExternalId) {
  const found = gladys.published.filter((s) => s.device_feature_external_id === featureExternalId);
  const last = found.at(-1);
  return last && (last.text !== undefined ? last.text : last.state);
}
