'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const http = require('http');
const test = require('node:test');
const assert = require('node:assert/strict');
const { URL } = require('url');

const {
  authenticateGoogleLoopback,
  isLoopbackHostname,
  normalizeLoopbackListenHost,
  resolveLoopbackRedirectTemplate,
} = require('../../../electron/text_extraction_platform/ocr_google_drive_secure_oauth');

function buildCredentials(redirectUris = ['http://localhost']) {
  return {
    installed: {
      client_id: 'client-id',
      client_secret: 'client-secret',
      redirect_uris: redirectUris,
    },
  };
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body,
        });
      });
    }).on('error', reject);
  });
}

test('isLoopbackHostname accepts supported loopback hosts', () => {
  assert.equal(isLoopbackHostname('localhost'), true);
  assert.equal(isLoopbackHostname('127.0.0.1'), true);
  assert.equal(isLoopbackHostname('[::1]'), true);
  assert.equal(isLoopbackHostname('example.com'), false);
});

test('normalizeLoopbackListenHost strips IPv6 URL brackets for server.listen host binding', () => {
  assert.equal(normalizeLoopbackListenHost('localhost'), 'localhost');
  assert.equal(normalizeLoopbackListenHost('127.0.0.1'), '127.0.0.1');
  assert.equal(normalizeLoopbackListenHost('::1'), '::1');
  assert.equal(normalizeLoopbackListenHost('[::1]'), '::1');
});

test('resolveLoopbackRedirectTemplate reuses the bundled loopback redirect owner', () => {
  const redirect = resolveLoopbackRedirectTemplate(
    buildCredentials(['http://localhost/oauth2callback'])
  );

  assert.equal(redirect.protocol, 'http:');
  assert.equal(redirect.hostname, 'localhost');
  assert.equal(redirect.pathname, '/oauth2callback');
});

test('authenticateGoogleLoopback opens browser with state + PKCE and exchanges callback code', async () => {
  let observedAuthorizeUrl = '';
  let observedRedirectUri = '';
  let observedGetTokenOptions = null;

  const fakeOAuthClient = {
    credentials: {},
    async generateCodeVerifierAsync() {
      return {
        codeVerifier: 'verifier-123',
        codeChallenge: 'challenge-456',
      };
    },
    generateAuthUrl(opts = {}) {
      return `https://accounts.google.com/o/oauth2/v2/auth?${
        new URLSearchParams(opts).toString()
      }`;
    },
    async getToken(options = {}) {
      observedGetTokenOptions = options;
      return {
        tokens: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
        },
      };
    },
  };

  const resultPromise = authenticateGoogleLoopback({
    credentialsJson: buildCredentials(['http://localhost/oauth2callback']),
    scopes: ['scope.one'],
    randomBytes: () => Buffer.alloc(24, 7),
    createOAuthClient: (redirectUri) => {
      observedRedirectUri = redirectUri;
      return fakeOAuthClient;
    },
    openExternal: async (url) => {
      observedAuthorizeUrl = url;
      const authorizeUrl = new URL(url);

      assert.equal(authorizeUrl.searchParams.get('access_type'), 'offline');
      assert.equal(authorizeUrl.searchParams.get('prompt'), 'consent');
      assert.equal(authorizeUrl.searchParams.get('scope'), 'scope.one');
      assert.equal(authorizeUrl.searchParams.get('code_challenge'), 'challenge-456');
      assert.equal(authorizeUrl.searchParams.get('code_challenge_method'), 'S256');
      assert.equal(authorizeUrl.searchParams.get('state'), Buffer.alloc(24, 7).toString('hex'));

      const callbackUrl = new URL(authorizeUrl.searchParams.get('redirect_uri'));
      callbackUrl.searchParams.set('code', 'code-123');
      callbackUrl.searchParams.set('state', authorizeUrl.searchParams.get('state'));

      const response = await fetchText(callbackUrl.toString());
      assert.equal(response.statusCode, 200);
      assert.match(response.body, /Authentication successful/i);
    },
  });

  const authClient = await resultPromise;

  assert.equal(authClient, fakeOAuthClient);
  assert.equal(observedAuthorizeUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'), true);
  assert.equal(new URL(observedRedirectUri).pathname, '/oauth2callback');
  assert.deepEqual(observedGetTokenOptions, {
    code: 'code-123',
    redirect_uri: observedRedirectUri,
    codeVerifier: 'verifier-123',
  });
  assert.deepEqual(fakeOAuthClient.credentials, {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
  });
});

test('authenticateGoogleLoopback rejects invalid callback state', async () => {
  const resultPromise = authenticateGoogleLoopback({
    credentialsJson: buildCredentials(['http://localhost/oauth2callback']),
    scopes: ['scope.one'],
    randomBytes: () => Buffer.alloc(24, 3),
    createOAuthClient: () => ({
      async generateCodeVerifierAsync() {
        return {
          codeVerifier: 'verifier-xyz',
          codeChallenge: 'challenge-xyz',
        };
      },
      generateAuthUrl(opts = {}) {
        return `https://accounts.google.com/o/oauth2/v2/auth?${
          new URLSearchParams(opts).toString()
        }`;
      },
      async getToken() {
        throw new Error('getToken should not be called when state is invalid');
      },
      credentials: {},
    }),
    openExternal: async (url) => {
      const authorizeUrl = new URL(url);
      const callbackUrl = new URL(authorizeUrl.searchParams.get('redirect_uri'));
      callbackUrl.searchParams.set('code', 'code-xyz');
      callbackUrl.searchParams.set('state', 'wrong-state');

      const response = await fetchText(callbackUrl.toString());
      assert.equal(response.statusCode, 400);
      assert.match(response.body, /state is invalid/i);
    },
  });

  await assert.rejects(resultPromise, (err) => {
    assert.equal(err && err.code, 'oauth_state_invalid');
    assert.match(String(err && err.message), /invalid oauth state/i);
    return true;
  });
});

test('authenticateGoogleLoopback times out cleanly when no callback arrives', async () => {
  const resultPromise = authenticateGoogleLoopback({
    credentialsJson: buildCredentials(['http://localhost/oauth2callback']),
    scopes: ['scope.one'],
    callbackTimeoutMs: 75,
    createOAuthClient: () => ({
      async generateCodeVerifierAsync() {
        return {
          codeVerifier: 'verifier-timeout',
          codeChallenge: 'challenge-timeout',
        };
      },
      generateAuthUrl(opts = {}) {
        return `https://accounts.google.com/o/oauth2/v2/auth?${
          new URLSearchParams(opts).toString()
        }`;
      },
      async getToken() {
        throw new Error('getToken should not be called when the callback times out');
      },
      credentials: {},
    }),
    openExternal: async () => {},
  });

  await assert.rejects(resultPromise, (err) => {
    assert.equal(err && err.code, 'oauth_timeout');
    assert.match(String(err && err.message), /timed out/i);
    return true;
  });
});

test('cancelling a pending authorization closes its loopback server', async () => {
  const controller = new AbortController();
  let server;
  let opened;
  const browserOpened = new Promise((resolve) => { opened = resolve; });
  const result = authenticateGoogleLoopback({
    credentialsJson: buildCredentials(['http://localhost/oauth2callback']),
    scopes: ['scope.one'],
    signal: controller.signal,
    httpModule: { createServer(handler) { server = http.createServer(handler); return server; } },
    createOAuthClient: () => ({
      async generateCodeVerifierAsync() { return { codeVerifier: 'verifier', codeChallenge: 'challenge' }; },
      generateAuthUrl() { return 'https://example.test/auth'; },
      async getToken() { throw new Error('unexpected token exchange'); },
    }),
    openExternal: () => { opened(); },
  });
  const rejection = assert.rejects(result, (error) => error.code === 'oauth_cancelled');
  await browserOpened;
  const closed = new Promise((resolve) => server.once('close', resolve));
  controller.abort();
  await rejection;
  await closed;
  assert.equal(server.listening, false);
});

test('cancellation before the loopback listener becomes ready never opens the browser', async () => {
  const { EventEmitter } = require('node:events');
  const controller = new AbortController();
  const server = new EventEmitter();
  let onListening;
  let closeCount = 0;
  let browserOpened = false;
  server.listen = (_port, _host, callback) => { onListening = callback; };
  server.close = () => { closeCount += 1; };
  const result = authenticateGoogleLoopback({
    credentialsJson: buildCredentials(['http://localhost/oauth2callback']),
    scopes: ['scope.one'],
    signal: controller.signal,
    httpModule: { createServer: () => server },
    openExternal: () => { browserOpened = true; },
  });
  const rejection = assert.rejects(result, (error) => error.code === 'oauth_cancelled');
  controller.abort();
  await rejection;
  await onListening();
  assert.equal(browserOpened, false);
  assert.ok(closeCount >= 1);
});

test('cancellation during token exchange waits for it and does not return credentials', async () => {
  const controller = new AbortController();
  let resolveToken;
  let markExchangeStarted;
  let callbackResponse;
  const token = new Promise((resolve) => { resolveToken = resolve; });
  const exchangeStarted = new Promise((resolve) => { markExchangeStarted = resolve; });
  const client = {
    credentials: {},
    async generateCodeVerifierAsync() { return { codeVerifier: 'verifier', codeChallenge: 'challenge' }; },
    generateAuthUrl(options) { return `https://example.test/auth?${new URLSearchParams(options)}`; },
    async getToken() { markExchangeStarted(); return token; },
  };
  const result = authenticateGoogleLoopback({
    credentialsJson: buildCredentials(['http://localhost/oauth2callback']),
    scopes: ['scope.one'],
    signal: controller.signal,
    randomBytes: () => Buffer.alloc(24, 4),
    createOAuthClient: () => client,
    openExternal(url) {
      const authorization = new URL(url);
      const callback = new URL(authorization.searchParams.get('redirect_uri'));
      callback.searchParams.set('code', 'code');
      callback.searchParams.set('state', authorization.searchParams.get('state'));
      callbackResponse = fetchText(callback.toString());
    },
  });
  let completed = false;
  const rejection = assert.rejects(result, (error) => error.code === 'oauth_cancelled')
    .then(() => { completed = true; });
  await exchangeStarted;
  controller.abort();
  await Promise.resolve();
  assert.equal(completed, false);
  resolveToken({ tokens: { access_token: 'late-token' } });
  await rejection;
  assert.deepEqual(client.credentials, {});
  assert.match((await callbackResponse).body, /rejected/i);
});

