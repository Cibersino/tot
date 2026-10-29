// electron/text_extraction_platform/ocr_google_drive_token_storage.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Encrypted token storage helpers for Google Drive OCR activation.
// Responsibilities:
// - Check whether Electron safeStorage encryption is available before token I/O.
// - Warn when Linux falls back to the weaker basic_text safeStorage backend.
// - Read and validate the token envelope persisted on disk.
// - Decrypt token JSON payloads into plain objects for OCR setup/runtime flows.
// - Encrypt and persist token payloads back to disk with a stable envelope shape.

// =============================================================================
// Imports / logger
// =============================================================================

const fs = require('fs');
const { safeStorage } = require('electron');
const Log = require('../log');

const log = Log.get('ocr-google-drive-token-storage');

// =============================================================================
// Helpers
// =============================================================================

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
  } catch (error) {
    log.warn('Could not read safeStorage backend (ignored):', error);
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
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw buildStorageError('missing_file', 'Token file is missing.');
    }
    throw buildStorageError('read_failed', 'Token file read failed.', {
      errorName: safeErrorName(error),
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

// =============================================================================
// Read / write entrypoints
// =============================================================================

function readEncryptedTokenFile(tokenPath) {
  assertEncryptionAvailable();
  warnWeakLinuxBackendIfNeeded();

  const envelope = readTokenEnvelope(tokenPath);
  const encryptedBuffer = decodeEncryptedBufferFromEnvelope(envelope);

  let decryptedJson = '';
  try {
    decryptedJson = safeStorage.decryptString(encryptedBuffer);
  } catch (error) {
    throw buildStorageError('decrypt_failed', 'Token decryption failed.', {
      errorName: safeErrorName(error),
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
  } catch (error) {
    throw buildStorageError('encrypt_failed', 'Token encryption failed.', {
      errorName: safeErrorName(error),
    });
  }

  const envelope = {
    enc: encryptedBuffer.toString('base64'),
  };

  try {
    fs.writeFileSync(tokenPath, JSON.stringify(envelope, null, 2), 'utf8');
  } catch (error) {
    throw buildStorageError('write_failed', 'Token file write failed.', {
      errorName: safeErrorName(error),
    });
  }
}

function deleteEncryptedTokenFile(tokenPath) {
  if (typeof tokenPath !== 'string' || !tokenPath.trim()) {
    throw buildStorageError('invalid_token_path', 'Token path is invalid.');
  }

  try {
    fs.unlinkSync(tokenPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw buildStorageError('missing_file', 'Token file is missing.');
    }
    throw buildStorageError('delete_failed', 'Token file delete failed.', {
      errorName: safeErrorName(error),
    });
  }
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  deleteEncryptedTokenFile,
  readEncryptedTokenFile,
  writeEncryptedTokenFile,
};

// =============================================================================
// End of electron/text_extraction_platform/ocr_google_drive_token_storage.js
// =============================================================================

