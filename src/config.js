// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys, from the `config_schema` of
// `gladys-assistant-integration.json`. This module only provides the defaults
// and normalizes the received object, so the rest of the code never deals with
// `undefined` or with numbers typed as strings.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in the
// manifest `config_schema` (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  email: '',
  password: '',
  country: 'FR',
  poll_frequency: '60', // seconds, a select: see POLL_FREQUENCIES_MS
};

// Gladys only accepts these device poll frequencies (in ms): any other value
// rejects the WHOLE discovery batch. The select offers a subset; the cloud is
// asked five questions per robot and per poll, faster than 15 s is abuse.
export const POLL_FREQUENCIES_MS = {
  15: 15_000,
  30: 30_000,
  60: 60_000,
};

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const config = { ...DEFAULT_CONFIG, ...raw };
  const country = String(config.country || DEFAULT_CONFIG.country)
    .trim()
    .toUpperCase();
  const poll = String(config.poll_frequency ?? DEFAULT_CONFIG.poll_frequency);
  return {
    ...config,
    email: String(config.email ?? '').trim(),
    password: String(config.password ?? ''),
    country: /^[A-Z]{2}$/.test(country) ? country : DEFAULT_CONFIG.country,
    poll_frequency: poll in POLL_FREQUENCIES_MS ? poll : DEFAULT_CONFIG.poll_frequency,
    poll_frequency_ms:
      POLL_FREQUENCIES_MS[poll] ?? POLL_FREQUENCIES_MS[DEFAULT_CONFIG.poll_frequency],
  };
}

export function isConfigured(config) {
  return config.email.length > 0 && config.password.length > 0;
}
