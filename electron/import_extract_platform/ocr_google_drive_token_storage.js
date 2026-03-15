'use strict';

const fs = require('fs');
const { safeStorage } = require('electron');
const Log = require('../log');

const log = Log.get('ocr-google-drive-token-storage');

function safeErrorName(err) {
  return String(err && err.name ? err.name : 'Error');
}

function buildStorageError(code, message, detailsSafeForLogs = {}) {
  const err = new Error(message);
  err.code = code;
  err.detailsSafeForLogs = detailsSafeForLogs;
  return err;
}

function warnWeakLinuxBackendIfNeeded() {
  if (process.platform !== 'linux') return;
  if (!safeStorage || typeof safeStorage.getSelectedStorageBackend !== 'function') return;

  let backend = 'unknown';
  try {
    backend = String(safeStorage.getSelectedStorageBackend() || 'unknown');
  } catch (err) {
    log.warn('Could not read safeStorage backend (ignored):', err);
    return;
  }

  if (backend === 'basic_text') {
    log.warnOnce(
      'ocr_google_drive_token_storage.linux_basic_text',
      'safeStorage backend is basic_text on Linux; token protection may be weaker than keyring-backed encryption.'
    );
  }
}

function assertEncryptionAvailable() {
  if (!safeStorage
    || typeof safeStorage.isEncryptionAvailable !== 'function'
    || typeof safeStorage.encryptString !== 'function'
    || typeof safeStorage.decryptString !== 'function') {
    throw buildStorageError('encryption_unavailable', 'Electron safeStorage API is unavailable.');
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw buildStorageError(
      'encryption_unavailable',
      'OS encryption backend is unavailable for safeStorage.'
    );
  }
}

function readTokenEnvelope(tokenPath) {
  let raw = '';
  try {
    raw = fs.readFileSync(tokenPath, 'utf8').replace(/^\uFEFF/, '');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw buildStorageError('missing_file', 'Token file is missing.');
    }
    throw buildStorageError('read_failed', 'Token file read failed.', {
      errorName: safeErrorName(err),
    });
  }

  if (!raw.trim()) {
    throw buildStorageError('empty_file', 'Token file is empty.');
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw buildStorageError('invalid_json', 'Token file is not valid JSON.');
  }
}

function decodeEncryptedBufferFromEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    throw buildStorageError('invalid_token_format', 'Token file format is invalid.');
  }

  const base64Ciphertext = typeof envelope.enc === 'string' ? envelope.enc.trim() : '';
  if (!base64Ciphertext) {
    throw buildStorageError('invalid_token_format', 'Token file does not contain encrypted payload.');
  }

  const encryptedBuffer = Buffer.from(base64Ciphertext, 'base64');
  if (!Buffer.isBuffer(encryptedBuffer) || encryptedBuffer.length === 0) {
    throw buildStorageError('invalid_token_format', 'Token encrypted payload is invalid.');
  }

  return encryptedBuffer;
}

function readEncryptedTokenFile(tokenPath) {
  assertEncryptionAvailable();
  warnWeakLinuxBackendIfNeeded();

  const envelope = readTokenEnvelope(tokenPath);
  const encryptedBuffer = decodeEncryptedBufferFromEnvelope(envelope);

  let decryptedJson = '';
  try {
    decryptedJson = safeStorage.decryptString(encryptedBuffer);
  } catch (err) {
    throw buildStorageError('decrypt_failed', 'Token decryption failed.', {
      errorName: safeErrorName(err),
    });
  }

  let tokenPayload = null;
  try {
    tokenPayload = JSON.parse(String(decryptedJson || ''));
  } catch {
    throw buildStorageError('invalid_token_payload', 'Decrypted token payload is invalid JSON.');
  }

  if (!tokenPayload || typeof tokenPayload !== 'object') {
    throw buildStorageError('invalid_token_payload', 'Decrypted token payload is not an object.');
  }

  return tokenPayload;
}

function writeEncryptedTokenFile({ tokenPath, tokenPayload }) {
  if (typeof tokenPath !== 'string' || !tokenPath.trim()) {
    throw buildStorageError('invalid_token_path', 'Token path is invalid.');
  }
  if (!tokenPayload || typeof tokenPayload !== 'object') {
    throw buildStorageError('invalid_token_payload', 'Token payload is invalid.');
  }

  assertEncryptionAvailable();
  warnWeakLinuxBackendIfNeeded();

  let plaintext = '';
  try {
    plaintext = JSON.stringify(tokenPayload);
  } catch {
    throw buildStorageError('invalid_token_payload', 'Token payload cannot be serialized as JSON.');
  }

  let encryptedBuffer = null;
  try {
    encryptedBuffer = safeStorage.encryptString(plaintext);
  } catch (err) {
    throw buildStorageError('encrypt_failed', 'Token encryption failed.', {
      errorName: safeErrorName(err),
    });
  }

  const envelope = {
    enc: encryptedBuffer.toString('base64'),
  };

  try {
    fs.writeFileSync(tokenPath, JSON.stringify(envelope, null, 2), 'utf8');
  } catch (err) {
    throw buildStorageError('write_failed', 'Token file write failed.', {
      errorName: safeErrorName(err),
    });
  }
}

module.exports = {
  readEncryptedTokenFile,
  writeEncryptedTokenFile,
};
