'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_TTL_MS = 2 * 60 * 1000;

const preparedRecords = new Map();
const consumedRecords = new Map();

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

module.exports = {
  cleanupExpiredRecords,
  consumePreparedRecord,
  createPreparedRecord,
  peekPreparedRecord,
  readSourceFileFingerprint,
  shortPrepareId,
};
