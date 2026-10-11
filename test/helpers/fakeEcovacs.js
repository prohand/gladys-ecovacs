// -----------------------------------------------------------------------------
// A fake Ecovacs cloud, served through an injected `fetch`.
//
// It answers the login chain, the robot list and the IoT commands like the
// real portal does, records every request, and lets a test change what a
// robot answers (`robots[did].answers[cmdName]`: data, or a function of the
// request returning a raw portal answer).
// -----------------------------------------------------------------------------

import { constants, createHash, generateKeyPairSync, privateDecrypt } from 'node:crypto';

// The RSA key pair of the fake cloud (common/getConfig publishes the public half).
const KEYS = generateKeyPairSync('rsa', { modulusLength: 1024 });
const PUBLIC_KEY = KEYS.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

export const ROBOT_T8 = {
  did: 'e0000001',
  class: 'fqxoiu',
  resource: 'Xg8V',
  name: 'E0001234567890',
  nick: 'Kitchen Deebot',
  deviceName: 'DEEBOT OZMO T8',
  company: 'eco-ng',
};

export const ROBOT_920 = {
  did: 'e0000002',
  class: 'yna5xi',
  resource: 'Ab12',
  name: 'E0009876543210',
  nick: '',
  deviceName: 'DEEBOT OZMO 920',
  company: 'eco-ng',
};

export const ROBOT_GOAT = {
  did: 'e0000004',
  class: '5xu9h3',
  resource: 'Gt01',
  name: 'E0000000000004',
  nick: 'Garden GOAT',
  deviceName: 'GOAT G1',
  company: 'eco-ng',
};

export const ROBOT_LEGACY = {
  did: 'e0000003',
  class: '126',
  resource: 'atom',
  name: 'E0000000000003',
  nick: 'Old one',
  deviceName: 'DEEBOT 900',
  company: 'eco-legacy',
};

// What a robot answers by default, per command: `data` of a successful body.
export function defaultAnswers({ v2 = true } = {}) {
  const cleanInfo = { state: 'idle', cleanState: {} };
  return {
    ...(v2 ? { getCleanInfo_V2: cleanInfo } : { getCleanInfo_V2: refusal(20001, 'not support') }),
    getCleanInfo: cleanInfo,
    getBattery: { value: 87, isLow: 0 },
    getChargeState: { isCharging: 0, mode: 'slot' },
    getSpeed: { speed: 0 },
    getError: { code: [100] },
    getLifeSpan: [
      { type: 'brush', left: 15000, total: 18000 },
      { type: 'sideBrush', left: 4500, total: 9000 },
      { type: 'heap', left: 0, total: 7200 },
    ],
    clean_V2: {},
    clean: {},
    charge: {},
    setSpeed: {},
    playSound: {},
  };
}

/** A command the robot refuses (answer body with a non-zero code). */
export function refusal(code, msg) {
  return () => ({ ret: 'ok', resp: { header: {}, body: { code, msg } } });
}

/** The robot did not answer: the portal times out. */
export function offline() {
  return () => ({ ret: 'fail', errno: 500, error: 'wait for response timed out' });
}

export function createFakeEcovacs({
  devices = [ROBOT_T8],
  email = 'me@example.com',
  password = 'secret',
} = {}) {
  const requests = [];
  const robots = {};
  for (const device of devices) {
    robots[device.did] = { info: device, answers: defaultAnswers() };
  }
  const state = {
    loginCode: '0000',
    // How many IoT calls refuse the token before it is accepted again.
    expiredTokenCalls: 0,
    tokens: 0,
    networkDown: false,
    // false: user/login answers 1013 until user/verifyDevice gets the code.
    verified: true,
    verifyCode: '123456',
    codesSent: 0,
  };

  async function fetch(url, init = {}) {
    if (state.networkDown) {
      throw new TypeError('fetch failed');
    }
    const parsed = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ url: parsed, method: init.method, body, headers: init.headers });
    return json(route(parsed, body));
  }

  function route(url, body) {
    if (url.pathname.endsWith('/user/login')) {
      if (state.loginCode !== '0000') {
        return { code: state.loginCode, msg: 'login failed' };
      }
      if (!state.verified) {
        return { code: '1013', msg: 'Please update to the latest version to continue' };
      }
      const md5 = url.searchParams.get('password');
      return md5 === md5Of(password)
        ? { code: '0000', data: { uid: 'uid42', accessToken: 'access-token' } }
        : { code: '1005', msg: 'wrong password' };
    }
    if (url.pathname.endsWith('/common/getConfig')) {
      return {
        code: '0000',
        data: [{ key: 'PUBLIC.KEY.CONFIG', value: JSON.stringify({ publicKey: PUBLIC_KEY }) }],
      };
    }
    if (url.pathname.endsWith('/user/sendEmailVerifyCode')) {
      if (decrypt(url.searchParams.get('encryptEmail')) !== email) {
        return { code: '1005', msg: 'unknown account' };
      }
      state.codesSent += 1;
      return { code: '0000', data: { verifyId: 'verify-1' } };
    }
    if (url.pathname.endsWith('/user/verifyDevice')) {
      if (
        decrypt(url.searchParams.get('encryptAccount')) !== email ||
        url.searchParams.get('verifyCode') !== state.verifyCode
      ) {
        return { code: '1012', msg: 'verification code error' };
      }
      state.verified = true;
      return { code: '0000', data: { uid: 'uid42', accessToken: 'access-token' } };
    }
    if (url.pathname.endsWith('/auth/getAuthCode')) {
      return { code: '0000', data: { authCode: 'auth-code', ecovacsUid: 'uid42' } };
    }
    if (url.pathname.endsWith('/users/user.do') && body.todo === 'loginByItToken') {
      state.tokens += 1;
      return {
        result: 'ok',
        userId: 'uid42',
        token: `iot-token-${state.tokens}`,
        resource: body.resource,
      };
    }
    if (url.pathname.endsWith('/appsvr/app.do')) {
      return { code: 0, devices: Object.values(robots).map((r) => r.info) };
    }
    if (url.pathname.endsWith('/iot/devmanager.do')) {
      if (state.expiredTokenCalls > 0) {
        state.expiredTokenCalls -= 1;
        return { ret: 'fail', errno: 3, error: 'auth error' };
      }
      const robot = robots[body.toId];
      const answer = robot?.answers[body.cmdName];
      if (typeof answer === 'function') {
        return answer(body);
      }
      if (answer === undefined) {
        return { ret: 'ok', resp: { header: {}, body: { code: 20001, msg: 'unknown command' } } };
      }
      return { ret: 'ok', resp: { header: {}, body: { code: 0, msg: 'ok', data: answer } } };
    }
    return { error: 'not found' };
  }

  return {
    fetch,
    requests,
    robots,
    state,
    commands: (did) =>
      requests
        .filter((r) => r.url.pathname.endsWith('/iot/devmanager.do') && r.body.toId === did)
        .map((r) => ({ name: r.body.cmdName, data: r.body.payload.body?.data })),
  };
}

function json(payload) {
  return { ok: true, status: 200, json: async () => payload };
}

// Raw RSA, then the PKCS#1 v1.5 padding (00 02 <random> 00 <message>) is
// stripped by hand: some Node builds refuse PKCS#1 padding for decryption.
function decrypt(base64) {
  const block = privateDecrypt(
    { key: KEYS.privateKey, padding: constants.RSA_NO_PADDING },
    Buffer.from(base64 ?? '', 'base64'),
  );
  return block.subarray(block.indexOf(0, 2) + 1).toString();
}

function md5Of(text) {
  return createHash('md5').update(text).digest('hex');
}
