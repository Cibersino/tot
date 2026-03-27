// electron/import_extract_platform/import_extract_prepared_store.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// In-memory store for prepared import/extract records.
// Responsibilities:
// - Create short-lived prepared records with generated prepare IDs.
// - Track prepared records separately from consumed records.
// - Expire stale records from both in-memory maps.
// - Provide non-consuming and consuming lookup helpers for execute-time flows.
// - Read source-file fingerprints used to validate prepared-record freshness.

// =============================================================================
// Imports
// =============================================================================

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// =============================================================================
// Constants / config
// =============================================================================

const DEFAULT_TTL_MS = 2 * 60 * 1000;

// =============================================================================
// Shared state
// =============================================================================

const preparedRecords = new Map();
const consumedRecords = new Map();

// =============================================================================
// Helpers / store operations
// =============================================================================

function readSourceFileFingerprint(filePath) {
  const resolvedPath = path.resolve(String(filePath || ''));
  const stats = fs.statSync(resolvedPath);

  return {
    path: resolvedPath,
    size: Number.isFinite(stats.size) ? stats.size : 0,
    mtimeMs: Number.isFinite(stats.mtimeMs) ? Math.floor(stats.mtimeMs) : 0,
  };
}

function cleanupExpiredRecords(now = Date.now()) {
  preparedRecords.forEach((record, prepareId) => {
    if (!record || !Number.isFinite(record.expiresAtEpochMs) || record.expiresAtEpochMs <= now) {
      preparedRecords.delete(prepareId);
    }
  });

  consumedRecords.forEach((record, prepareId) => {
    if (!record || !Number.isFinite(record.expiresAtEpochMs) || record.expiresAtEpochMs <= now) {
      consumedRecords.delete(prepareId);
    }
  });
}

function shortPrepareId(prepareId) {
  const value = typeof prepareId === 'string' ? prepareId.trim() : '';
  return value ? value.slice(0, 8) : '';
}

function createPreparedRecord(payload, { ttlMs = DEFAULT_TTL_MS } = {}) {
  const now = Date.now();
  cleanupExpiredRecords(now);

  const prepareId = crypto.randomUUID();
  const expiresAtEpochMs = now + Math.max(1000, Number.isFinite(ttlMs) ? Math.floor(ttlMs) : DEFAULT_TTL_MS);

  const record = {
    ...payload,
    prepareId,
    createdAtEpochMs: now,
    expiresAtEpochMs,
  };

  preparedRecords.set(prepareId, record);
  return record;
}

function peekPreparedRecord(prepareId) {
  const normalizedId = typeof prepareId === 'string' ? prepareId.trim() : '';
  cleanupExpiredRecords();

  if (!normalizedId) {
    return { ok: false, reason: 'invalid' };
  }

  const preparedRecord = preparedRecords.get(normalizedId);
  if (preparedRecord) {
    return { ok: true, record: preparedRecord };
  }

  if (consumedRecords.has(normalizedId)) {
    return { ok: false, reason: 'reused' };
  }

  return { ok: false, reason: 'invalid_or_expired' };
}

function consumePreparedRecord(prepareId) {
  const normalizedId = typeof prepareId === 'string' ? prepareId.trim() : '';
  cleanupExpiredRecords();

  const preparedRecord = preparedRecords.get(normalizedId);
  if (!preparedRecord) {
    if (consumedRecords.has(normalizedId)) {
      return { ok: false, reason: 'reused' };
    }
    return { ok: false, reason: 'invalid_or_expired' };
  }

  preparedRecords.delete(normalizedId);
  consumedRecords.set(normalizedId, preparedRecord);
  return { ok: true, record: preparedRecord };
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  consumePreparedRecord,
  createPreparedRecord,
  peekPreparedRecord,
  readSourceFileFingerprint,
  shortPrepareId,
};

// =============================================================================
// End of electron/import_extract_platform/import_extract_prepared_store.js
// =============================================================================
