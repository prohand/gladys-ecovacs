// -----------------------------------------------------------------------------
// Ecovacs cloud client: session, robot list, commands.
//
// Every robot is reached through the Ecovacs cloud (there is no local API):
// the app sends a JSON command to the IoT gateway of the portal
// (iot/devmanager.do), which relays it to the robot and returns its answer.
// The session token lasts days; it is renewed when the portal refuses it.
//
// The HTTP layer is injected (`fetch`) so the tests never touch the network.
// Never log the password or a token: only the masked account name.
// -----------------------------------------------------------------------------

import {
  APP_META,
  AUTH_CLIENT_KEY,
  AUTH_CLIENT_SECRET,
  CLIENT_KEY,
  CLIENT_SECRET,
  IOT_QUERY_VERSION,
  PUBLIC_KEY_CONFIG,
  REALM,
  VERIFY_DEVICE_MODEL,
  encryptAccount,
  endpoints,
  md5,
  sign,
} from './api.js';

// The mobile app user agent: the IoT gateway expects one.
const USER_AGENT = 'Dalvik/2.1.0 (Linux; U; Android 5.1.1; A5010 Build/LMY48Z)';

// Login answers meaning "wrong account or password".
const BAD_CREDENTIALS_CODES = new Set(['1005', '1010']);
// "Please update to the latest version": this client id must be confirmed
// with a code sent by email (or the app version is too old).
const DEVICE_VERIFICATION_CODE = '1013';
// The emailed code is wrong or expired.
const BAD_VERIFY_CODE = '1012';

// After a failed login that was NOT a credentials problem (network, cloud
// down), wait this long before trying again: every poll asks for a session.
const LOGIN_RETRY_DELAY_MS = 60_000;

/**
 * kind:
 *  - 'credentials': wrong email or password (no retry until the config changes)
 *  - 'verification': Ecovacs wants this client confirmed by an emailed code
 *                    (no retry until the user does it)
 *  - 'code':        the emailed code is wrong or expired
 *  - 'auth':        session refused (renewed once, transparently)
 *  - 'offline':     the robot did not answer (switched off, out of Wi-Fi)
 *  - 'network':     the Ecovacs cloud could not be reached
 *  - 'api':         any other refusal (code in `code`)
 */
export class EcovacsError extends Error {
  constructor(message, { kind = 'api', code } = {}) {
    super(message);
    this.name = 'EcovacsError';
    this.kind = kind;
    this.code = code;
  }
}

export function maskEmail(email) {
  const [name, domain] = String(email).split('@');
  if (!domain) {
    return '***';
  }
  return `${name.slice(0, 2)}***@${domain}`;
}

export class EcovacsClient {
  /**
   * @param {object} options
   * @param {string} options.email Ecovacs account
   * @param {string} options.password Ecovacs password (clear text, hashed here)
   * @param {string} options.country ISO alpha-2 code of the account country
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   * @param {number} [options.timeoutMs] per request
   */
  constructor({ email, password, country, fetch = globalThis.fetch, now = Date.now, timeoutMs }) {
    this.email = String(email ?? '').trim();
    this.passwordHash = md5(String(password ?? ''));
    this.hasPassword = Boolean(password);
    this.country = String(country ?? 'FR').toUpperCase();
    this.fetch = fetch;
    this.now = now;
    this.timeoutMs = timeoutMs ?? 15_000;
    this.urls = endpoints(this.country);
    // Ecovacs sees each client as a phone: keep the SAME id across restarts
    // (derived from the account) so it does not look like a new device each time.
    this.deviceId = md5(`gladys-ecovacs:${this.email.toLowerCase()}`);
    this.resource = this.deviceId.slice(0, 8);
    this.session = null;
    this.pendingLogin = null;
    this.loginFailure = null;
  }

  get configured() {
    return this.email.length > 0 && this.hasPassword;
  }

  get account() {
    return maskEmail(this.email);
  }

  // --- Session ---------------------------------------------------------------

  async ensureSession() {
    if (this.session) {
      return this.session;
    }
    if (!this.configured) {
      throw new EcovacsError('Ecovacs account not configured', { kind: 'credentials' });
    }
    if (this.loginFailure) {
      const { error, at } = this.loginFailure;
      // Both wait for the user: retrying only piles up refused logins.
      const final = error.kind === 'credentials' || error.kind === 'verification';
      if (final || this.now() - at < LOGIN_RETRY_DELAY_MS) {
        throw error;
      }
    }
    // Several polls can ask at once: they share the same login.
    if (!this.pendingLogin) {
      this.pendingLogin = this.login().finally(() => {
        this.pendingLogin = null;
      });
    }
    return this.pendingLogin;
  }

  async login() {
    try {
      const login = await this.privateGet('user/login', {
        account: this.email,
        password: this.passwordHash,
      });
      return await this.openSession(login);
    } catch (err) {
      this.loginFailure = { error: err, at: this.now() };
      throw err;
    }
  }

  /**
   * Device verification, step 1: Ecovacs mails a one-time code to the
   * account. Asked by the user (Configuration action), never automatically.
   */
  async requestVerificationCode() {
    await this.privateGet('user/sendEmailVerifyCode', {
      encryptEmail: await this.encryptedAccount(),
      verifyType: 'EMAIL_VERIFY_DEVICE',
      supportChar: 'N',
      isForce: 'N',
    });
  }

  /**
   * Device verification, step 2: send the emailed code back. Ecovacs answers
   * like user/login, so the session opens right away; a new login straight
   * after the verification is refused for some accounts, the session is kept.
   * @param {string} code as received by email
   */
  async verifyDevice(code) {
    const login = await this.privateGet('user/verifyDevice', {
      encryptAccount: await this.encryptedAccount(),
      backUpEmail: '',
      verifyCode: String(code ?? '').trim(),
      ...VERIFY_DEVICE_MODEL,
    });
    return this.openSession(login);
  }

  async encryptedAccount() {
    const config = await this.privateGet('common/getConfig', { keys: PUBLIC_KEY_CONFIG });
    const entry = Array.isArray(config) ? config.find((e) => e?.key === PUBLIC_KEY_CONFIG) : null;
    try {
      return encryptAccount(this.email, JSON.parse(entry.value).publicKey);
    } catch {
      throw new EcovacsError('Ecovacs sent no usable public key', { kind: 'api' });
    }
  }

  // Steps 2 and 3 of the login chain, from the uid + accessToken of
  // user/login (or user/verifyDevice).
  async openSession(login) {
    if (!login?.uid || !login?.accessToken) {
      throw new EcovacsError('Ecovacs login answer without a token', { kind: 'api' });
    }
    const auth = await this.signedGet(
      this.urls.authCode,
      {
        uid: login.uid,
        accessToken: login.accessToken,
        bizType: 'ECOVACS_IOT',
        deviceId: this.deviceId,
        authTimespan: this.now(),
      },
      { openId: 'global' },
      AUTH_CLIENT_KEY,
      AUTH_CLIENT_SECRET,
    );

    const china = this.country === 'CN';
    const portal = await this.post(`${this.urls.portal}/users/user.do`, {
      todo: 'loginByItToken',
      edition: 'ECOGLOBLE',
      userId: login.uid,
      token: auth.authCode,
      realm: REALM,
      resource: this.resource,
      org: china ? 'ECOCN' : 'ECOWW',
      last: '',
      country: china ? 'Chinese' : this.country,
    });
    if (portal.result !== 'ok' || !portal.token) {
      throw new EcovacsError(`Ecovacs portal refused the login: ${portal.error ?? 'no token'}`, {
        kind: 'api',
        code: portal.errno,
      });
    }

    this.session = { userId: portal.userId ?? login.uid, token: portal.token };
    this.loginFailure = null;
    return this.session;
  }

  logout() {
    this.session = null;
  }

  authBlock(session) {
    return {
      with: 'users',
      userid: session.userId,
      realm: REALM,
      token: session.token,
      resource: this.resource,
    };
  }

  // --- Robots ----------------------------------------------------------------

  /**
   * The robots bound to the account, as the cloud describes them:
   * `{ did, class, resource, name, nick, deviceName, company, ... }`.
   */
  async getDevices() {
    return this.withSession(async (session) => {
      const answer = await this.post(`${this.urls.portal}/appsvr/app.do`, {
        todo: 'GetGlobalDeviceList',
        userid: session.userId,
        auth: this.authBlock(session),
      });
      checkPortalAnswer(answer);
      if (answer.code !== 0 && answer.result !== 'ok') {
        throw new EcovacsError(`Ecovacs device list refused: ${answer.error ?? answer.msg}`, {
          code: answer.code,
        });
      }
      return Array.isArray(answer.devices) ? answer.devices : [];
    });
  }

  /**
   * Send one command to a robot and return the `data` of its answer.
   * @param {{ did: string, class: string, resource: string }} robot
   * @param {string} name e.g. 'getBattery', 'clean_V2', 'charge'
   * @param {unknown} [data] command arguments (`body.data`)
   */
  async command(robot, name, data) {
    return this.withSession(async (session) => {
      const payload = {
        header: { pri: '1', ts: this.now(), tzm: 480, ver: '0.0.50' },
      };
      if (data !== undefined) {
        payload.body = { data };
      }
      const query = new URLSearchParams({
        mid: robot.class,
        did: robot.did,
        td: 'q',
        u: session.userId,
        ...IOT_QUERY_VERSION,
      });
      const answer = await this.post(`${this.urls.portal}/iot/devmanager.do?${query}`, {
        cmdName: name,
        payload,
        payloadType: 'j',
        td: 'q',
        toId: robot.did,
        toRes: robot.resource,
        toType: robot.class,
        auth: this.authBlock(session),
      });
      checkPortalAnswer(answer);
      if (answer.ret !== 'ok') {
        throw new EcovacsError(`${name}: ${answer.error ?? answer.debug ?? 'refused'}`, {
          code: answer.errno,
        });
      }
      const body = answer.resp?.body ?? {};
      if (body.code !== undefined && body.code !== 0) {
        throw new EcovacsError(`${name}: ${body.msg ?? 'refused by the robot'}`, {
          code: body.code,
        });
      }
      return body.data ?? {};
    });
  }

  // Run `call` with a session; when the portal refuses the token, log in
  // again ONCE and retry (tokens expire after a few days).
  async withSession(call) {
    const session = await this.ensureSession();
    try {
      return await call(session);
    } catch (err) {
      if (err instanceof EcovacsError && err.kind === 'auth') {
        this.logout();
        return call(await this.ensureSession());
      }
      throw err;
    }
  }

  // --- HTTP ------------------------------------------------------------------

  // A signed call of the app API: the app meta is part of the URL and of the
  // signature, every call carries a request id and a timestamp.
  async privateGet(endpoint, params) {
    return this.signedGet(
      this.urls.privateApi(this.deviceId, endpoint),
      {
        ...params,
        requestId: md5(String(this.now())),
        authTimespan: this.now(),
        authTimeZone: 'GMT-8',
      },
      { ...APP_META, country: this.country.toLowerCase(), deviceId: this.deviceId },
      CLIENT_KEY,
      CLIENT_SECRET,
    );
  }

  async signedGet(url, params, signOnly, key, secret) {
    const query = new URLSearchParams(
      Object.entries(sign(params, signOnly, key, secret)).map(([k, v]) => [k, String(v)]),
    );
    const answer = await this.request(`${url}?${query}`, { method: 'GET' });
    if (answer.code === '0000') {
      return answer.data ?? {};
    }
    const code = String(answer.code);
    throw new EcovacsError(`Ecovacs login refused (${code}): ${answer.msg ?? 'unknown error'}`, {
      kind: loginErrorKind(code),
      code,
    });
  }

  async post(url, body) {
    return this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async request(url, init) {
    let response;
    try {
      response = await this.fetch(url, {
        ...init,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...init.headers },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new EcovacsError(`Ecovacs cloud unreachable: ${err.message}`, { kind: 'network' });
    }
    if (!response.ok) {
      throw new EcovacsError(`Ecovacs cloud answered HTTP ${response.status}`, {
        kind: response.status === 401 || response.status === 403 ? 'auth' : 'network',
        code: response.status,
      });
    }
    try {
      return await response.json();
    } catch {
      throw new EcovacsError('Ecovacs cloud sent an unreadable answer', { kind: 'network' });
    }
  }
}

function loginErrorKind(code) {
  if (BAD_CREDENTIALS_CODES.has(code)) {
    return 'credentials';
  }
  if (code === DEVICE_VERIFICATION_CODE) {
    return 'verification';
  }
  return code === BAD_VERIFY_CODE ? 'code' : 'api';
}

// The portal says "token refused" or "robot did not answer" with `ret` or
// `result` = 'fail' and an errno / error text, depending on the endpoint.
function checkPortalAnswer(answer) {
  if (answer.ret !== 'fail' && answer.result !== 'fail') {
    return;
  }
  const text = `${answer.error ?? ''} ${answer.debug ?? ''}`.toLowerCase();
  const errno = String(answer.errno ?? '');
  if (errno === '3' || errno === '0001' || /token|auth/.test(text)) {
    throw new EcovacsError(`Ecovacs session refused: ${text.trim()}`, {
      kind: 'auth',
      code: errno,
    });
  }
  if (errno === '500' || errno === '4200' || /timeout|offline|unavailable/.test(text)) {
    throw new EcovacsError(`Robot did not answer: ${text.trim()}`, {
      kind: 'offline',
      code: errno,
    });
  }
}
