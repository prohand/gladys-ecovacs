// -----------------------------------------------------------------------------
// Ecovacs cloud: constants and request signing.
//
// Ecovacs publishes no API for third parties: this is the protocol of the
// "Ecovacs Home" mobile app, as documented by the open-source projects that
// talk to it (deebot-client for Home Assistant, ecovacs-deebot.js for
// ioBroker). Three steps open a session:
//
//   1. user/login on gl-<country>-api.ecovacs.com   -> uid + accessToken
//   2. auth/getAuthCode on gl-<country>-openapi...  -> one-time authCode
//   3. loginByItToken on the ecouser.net portal     -> userId + IoT token
//
// The first two calls are signed: md5 of the app key, every parameter sorted
// by name as `key=value`, and the app secret. The keys below are the public
// ones of the mobile app, shared by every client; they identify the app, not
// the user.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';

export const CLIENT_KEY = '1520391301804';
export const CLIENT_SECRET = '6c319b2a5cd3e66e39159c2e28f2fce9';
export const AUTH_CLIENT_KEY = '1520391491841';
export const AUTH_CLIENT_SECRET = '77ef58ce3afbe337da74aa8c5ab963a9';

export const REALM = 'ecouser.net';

// What the app says about itself; part of the login URL AND of the signature.
export const APP_META = {
  lang: 'EN',
  appCode: 'global_e',
  appVersion: '1.6.3',
  channel: 'google_play',
  deviceType: '1',
};

// Version fields the IoT gateway expects on every command (devmanager.do).
export const IOT_QUERY_VERSION = { cv: '1.67.3', t: 'a', av: '1.3.1' };

export function md5(text) {
  return createHash('md5').update(String(text)).digest('hex');
}

/**
 * Sign the parameters of a login-side request.
 * @param {Record<string, string|number>} params sent as the query string
 * @param {Record<string, string|number>} signOnly signed but not sent (app meta)
 * @param {string} key app key
 * @param {string} secret app secret
 * @returns {Record<string, string|number>} params + authAppkey + authSign
 */
export function sign(params, signOnly, key, secret) {
  const all = { ...signOnly, ...params };
  const text = Object.keys(all)
    .sort()
    .map((name) => `${name}=${all[name]}`)
    .join('');
  return { ...params, authAppkey: key, authSign: md5(`${key}${text}${secret}`) };
}

/**
 * The hosts of a country. China has its own cloud; everyone else shares the
 * worldwide portal (the per-continent ones answer the same).
 * @param {string} country ISO 3166 alpha-2 code, any case
 */
export function endpoints(country) {
  const lower = country.toLowerCase();
  const china = lower === 'cn';
  const tld = china ? 'cn' : 'com';
  return {
    login: (deviceId) =>
      `https://gl-${lower}-api.ecovacs.${tld}/v1/private/${lower}/${APP_META.lang}/${deviceId}/` +
      `${APP_META.appCode}/${APP_META.appVersion}/${APP_META.channel}/${APP_META.deviceType}/user/login`,
    authCode: `https://gl-${lower}-openapi.ecovacs.${tld}/v1/global/auth/getAuthCode`,
    portal: china ? 'https://portal.ecouser.net/api' : 'https://portal-ww.ecouser.net/api',
  };
}
