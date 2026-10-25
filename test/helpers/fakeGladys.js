// -----------------------------------------------------------------------------
// Minimal in-memory stand-in for the Gladys SDK object, for unit tests.
//
// It reproduces the only surface the code relies on, and records every call
// so the tests can assert them, without a running Gladys server.
// -----------------------------------------------------------------------------

export function createFakeGladys({ now = () => Date.now() } = {}) {
  const clock = now;
  const lastPublished = new Map();
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

    // Mirrors the SDK: an entry equal to the last value published through it
    // is skipped, unless the heartbeat is due.
    async publishChangedStates(states, { heartbeat } = {}) {
      const sent = [];
      for (const state of states) {
        const id = state.device_feature_external_id;
        const value = state.text !== undefined ? `t:${state.text}` : `s:${state.state}`;
        const last = lastPublished.get(id);
        if (last && last.value === value && !(heartbeat && clock() - last.at >= heartbeat)) {
          continue;
        }
        lastPublished.set(id, { value, at: clock() });
        sent.push(state);
      }
      published.push(...sent);
      return { success: true, count: sent.length };
    },

    forgetPublishedStates(externalId) {
      for (const id of [...lastPublished.keys()]) {
        if (externalId === undefined || id === externalId || id.startsWith(`${externalId}:`)) {
          lastPublished.delete(id);
        }
      }
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
