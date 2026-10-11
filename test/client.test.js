import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_CLIENT_KEY,
  AUTH_CLIENT_SECRET,
  CLIENT_KEY,
  CLIENT_SECRET,
  endpoints,
  md5,
  sign,
} from '../src/ecovacs/api.js';
import { EcovacsClient, EcovacsError, maskEmail } from '../src/ecovacs/client.js';
import { ROBOT_T8, createFakeEcovacs, offline } from './helpers/fakeEcovacs.js';

function makeClient(fake, overrides = {}) {
  let now = 1_700_000_000_000;
  const client = new EcovacsClient({
    email: 'me@example.com',
    password: 'secret',
    country: 'fr',
    fetch: fake.fetch,
    now: () => now,
    ...overrides,
  });
  return { client, advance: (ms) => (now += ms) };
}

test('sign: md5 of key, sorted key=value pairs and secret', () => {
  const signed = sign({ b: 2, a: 1 }, { c: 'x' }, 'KEY', 'SECRET');
  assert.equal(signed.authAppkey, 'KEY');
  assert.equal(signed.authSign, md5('KEYa=1b=2c=xSECRET'));
  // Sign-only parameters are not sent.
  assert.equal(signed.c, undefined);
});

test('endpoints: worldwide portal, China on its own cloud', () => {
  const fr = endpoints('FR');
  assert.equal(fr.portal, 'https://portal-ww.ecouser.net/api');
  assert.match(
    fr.privateApi('abc', 'user/login'),
    /^https:\/\/gl-fr-api\.ecovacs\.com\/v1\/private\/fr\/EN\/abc\/global_e\/3\.14\.0\/.*\/user\/login$/,
  );
  assert.equal(fr.authCode, 'https://gl-fr-openapi.ecovacs.com/v1/global/auth/getAuthCode');
  const cn = endpoints('cn');
  assert.equal(cn.portal, 'https://portal.ecouser.net/api');
  assert.match(cn.privateApi('abc', 'user/login'), /^https:\/\/gl-cn-api\.ecovacs\.cn\//);
});

test('login: three signed steps, password sent as md5 only', async () => {
  const fake = createFakeEcovacs();
  const { client } = makeClient(fake);
  const session = await client.login();
  assert.deepEqual(session, { userId: 'uid42', token: 'iot-token-1' });

  const [login, authCode, portal] = fake.requests;
  const params = Object.fromEntries(login.url.searchParams);
  assert.equal(params.password, md5('secret'));
  assert.ok(!login.url.href.includes('secret&'), 'the clear password never leaves');
  // The signature covers the app meta of the URL too.
  const { authAppkey: _k, authSign, ...sent } = params;
  const expected = sign(
    sent,
    {
      lang: 'EN',
      appCode: 'global_e',
      appVersion: '3.14.0',
      channel: 'google_play',
      deviceType: '1',
      country: 'fr',
      deviceId: client.deviceId,
    },
    CLIENT_KEY,
    CLIENT_SECRET,
  );
  assert.equal(authSign, expected.authSign);

  const authParams = Object.fromEntries(authCode.url.searchParams);
  const { authAppkey: _a, authSign: authCodeSign, ...authSent } = authParams;
  assert.equal(authSent.bizType, 'ECOVACS_IOT');
  assert.equal(
    authCodeSign,
    sign(authSent, { openId: 'global' }, AUTH_CLIENT_KEY, AUTH_CLIENT_SECRET).authSign,
  );

  assert.equal(portal.body.todo, 'loginByItToken');
  assert.equal(portal.body.token, 'auth-code');
  assert.equal(portal.body.country, 'FR');
  assert.equal(portal.body.org, 'ECOWW');
});

test('the client id is stable for an account', () => {
  const fake = createFakeEcovacs();
  assert.equal(makeClient(fake).client.deviceId, makeClient(fake).client.deviceId);
  assert.notEqual(
    makeClient(fake).client.deviceId,
    makeClient(fake, { email: 'other@example.com' }).client.deviceId,
  );
});

test('wrong password: credentials error, never retried', async () => {
  const fake = createFakeEcovacs({ password: 'another' });
  const { client, advance } = makeClient(fake);
  await assert.rejects(client.ensureSession(), { kind: 'credentials' });
  advance(3_600_000);
  await assert.rejects(client.ensureSession(), { kind: 'credentials' });
  assert.equal(fake.requests.length, 1, 'one login attempt only');
});

test('unconfirmed client: verification error, never retried on its own', async () => {
  const fake = createFakeEcovacs();
  fake.state.verified = false;
  const { client, advance } = makeClient(fake);
  await assert.rejects(client.ensureSession(), { kind: 'verification', code: '1013' });
  advance(3_600_000);
  await assert.rejects(client.ensureSession(), { kind: 'verification' });
  assert.equal(fake.requests.length, 1, 'one login attempt only');
});

test('device verification: emailed code, then the session opens at once', async () => {
  const fake = createFakeEcovacs();
  fake.state.verified = false;
  const { client } = makeClient(fake);
  await assert.rejects(client.ensureSession(), { kind: 'verification' });

  await client.requestVerificationCode();
  assert.equal(fake.state.codesSent, 1);
  const sent = fake.requests.find((r) => r.url.pathname.endsWith('/user/sendEmailVerifyCode'));
  assert.ok(!sent.url.href.includes('example.com'), 'the account leaves encrypted only');
  assert.equal(sent.url.searchParams.get('verifyType'), 'EMAIL_VERIFY_DEVICE');

  await assert.rejects(client.verifyDevice('000000'), { kind: 'code', code: '1012' });
  const session = await client.verifyDevice(' 123456 ');
  assert.deepEqual(session, { userId: 'uid42', token: 'iot-token-1' });
  assert.equal(client.loginFailure, null);

  const logins = fake.requests.filter((r) => r.url.pathname.endsWith('/user/login')).length;
  assert.deepEqual(await client.ensureSession(), session);
  assert.equal(
    fake.requests.filter((r) => r.url.pathname.endsWith('/user/login')).length,
    logins,
    'no new login right after the verification',
  );
});

test('cloud unreachable: network error, login retried after a pause', async () => {
  const fake = createFakeEcovacs();
  fake.state.networkDown = true;
  const { client, advance } = makeClient(fake);
  await assert.rejects(client.ensureSession(), { kind: 'network' });
  fake.state.networkDown = false;
  await assert.rejects(client.ensureSession(), { kind: 'network' }, 'still pausing');
  advance(61_000);
  assert.ok(await client.ensureSession());
});

test('concurrent callers share one login', async () => {
  const fake = createFakeEcovacs();
  const { client } = makeClient(fake);
  await Promise.all([client.ensureSession(), client.ensureSession(), client.ensureSession()]);
  assert.equal(fake.requests.filter((r) => r.url.pathname.endsWith('/user/login')).length, 1);
});

test('getDevices lists the robots of the account', async () => {
  const fake = createFakeEcovacs();
  const { client } = makeClient(fake);
  const devices = await client.getDevices();
  assert.deepEqual(
    devices.map((d) => d.did),
    [ROBOT_T8.did],
  );
  const list = fake.requests.at(-1);
  assert.equal(list.body.todo, 'GetGlobalDeviceList');
  assert.equal(list.body.auth.token, 'iot-token-1');
});

test('command: JSON payload to the IoT gateway, answer data returned', async () => {
  const fake = createFakeEcovacs();
  const { client } = makeClient(fake);
  const data = await client.command(ROBOT_T8, 'getBattery');
  assert.deepEqual(data, { value: 87, isLow: 0 });
  const request = fake.requests.at(-1);
  assert.equal(request.url.searchParams.get('mid'), ROBOT_T8.class);
  assert.equal(request.url.searchParams.get('did'), ROBOT_T8.did);
  assert.equal(request.body.cmdName, 'getBattery');
  assert.equal(request.body.toRes, ROBOT_T8.resource);
  assert.equal(request.body.payloadType, 'j');
  assert.equal(request.body.payload.body, undefined, 'no body without arguments');

  await client.command(ROBOT_T8, 'setSpeed', { speed: 1 });
  assert.deepEqual(fake.requests.at(-1).body.payload.body, { data: { speed: 1 } });
});

test('an expired token is renewed once, transparently', async () => {
  const fake = createFakeEcovacs();
  const { client } = makeClient(fake);
  await client.ensureSession();
  fake.state.expiredTokenCalls = 1;
  assert.deepEqual(await client.command(ROBOT_T8, 'getBattery'), { value: 87, isLow: 0 });
  assert.equal(client.session.token, 'iot-token-2');
});

test('a robot that does not answer is reported offline', async () => {
  const fake = createFakeEcovacs();
  fake.robots[ROBOT_T8.did].answers.getBattery = offline();
  const { client } = makeClient(fake);
  await assert.rejects(client.command(ROBOT_T8, 'getBattery'), { kind: 'offline' });
});

test('a command the robot refuses is an api error with its code', async () => {
  const fake = createFakeEcovacs();
  const { client } = makeClient(fake);
  await assert.rejects(client.command(ROBOT_T8, 'doesNotExist'), (err) => {
    assert.ok(err instanceof EcovacsError);
    assert.equal(err.kind, 'api');
    assert.equal(err.code, 20001);
    return true;
  });
});

test('not configured: no request at all', async () => {
  const fake = createFakeEcovacs();
  const { client } = makeClient(fake, { email: '', password: '' });
  assert.equal(client.configured, false);
  await assert.rejects(client.ensureSession(), { kind: 'credentials' });
  assert.equal(fake.requests.length, 0);
});

test('maskEmail hides the account in the logs', () => {
  assert.equal(maskEmail('jean.dupont@example.com'), 'je***@example.com');
  assert.equal(maskEmail('nothing'), '***');
});
