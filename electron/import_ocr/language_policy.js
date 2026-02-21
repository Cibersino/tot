'use strict';

const { DEFAULT_LANG } = require('../constants_main');

const UI_LANG_TO_TESSERACT = Object.freeze({
  es: 'spa',
  en: 'eng',
  fr: 'fra',
  de: 'deu',
  it: 'ita',
  pt: 'por',
});

const UI_LANG_ORDER = Object.freeze(['es', 'en', 'fr', 'de', 'it', 'pt']);

function normalizeLangBase(raw) {
  const value = String(raw || '').trim().toLowerCase().replace(/_/g, '-');
  if (!value) return '';
  return value.split('-')[0];
}

function mapUiLanguageToTesseract(rawLang) {
  const value = String(rawLang || '').trim().toLowerCase();
  if (!value) return '';
  if (value === 'es+en' || value === 'en+es' || value === 'spa+eng' || value === 'eng+spa') {
    return 'spa+eng';
  }
  const base = normalizeLangBase(value);
  return UI_LANG_TO_TESSERACT[base] || '';
}

function getRequiredTesseractCodes(rawLang) {
  const mapped = mapUiLanguageToTesseract(rawLang);
  if (!mapped) return [];
  return mapped
    .split('+')
    .map((part) => String(part || '').trim().toLowerCase())
    .filter(Boolean);
}

function buildAvailableUiLanguages(installedCodes = []) {
  const normalizedInstalled = Array.isArray(installedCodes)
    ? installedCodes.map((code) => String(code || '').trim().toLowerCase()).filter(Boolean)
    : [];
  const installed = new Set(normalizedInstalled);

  const values = [];
  UI_LANG_ORDER.forEach((uiLang) => {
    const tessCode = UI_LANG_TO_TESSERACT[uiLang];
    if (!tessCode) return;
    if (!installed.has(tessCode)) return;
    values.push(uiLang);
  });

  if (values.includes('es') && values.includes('en')) {
    const enIdx = values.indexOf('en');
    const insertAt = enIdx >= 0 ? enIdx + 1 : values.length;
    values.splice(insertAt, 0, 'es+en');
  }

  return values;
}

function resolvePreferredUiLanguage({
  requested = '',
  activeLangTag = '',
  defaultLangTag = DEFAULT_LANG,
  availableUiLanguages = [],
} = {}) {
  const available = Array.isArray(availableUiLanguages)
    ? availableUiLanguages.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
    : [];

  const requestedNorm = String(requested || '').trim().toLowerCase();
  if (requestedNorm && available.includes(requestedNorm)) {
    return { value: requestedNorm, reason: 'requested' };
  }

  const activeBase = normalizeLangBase(activeLangTag);
  if (activeBase && available.includes(activeBase)) {
    return { value: activeBase, reason: 'active' };
  }

  const defaultBase = normalizeLangBase(defaultLangTag);
  if (defaultBase && available.includes(defaultBase)) {
    return { value: defaultBase, reason: 'app-default' };
  }

  if (available.length > 0) {
    return { value: available[0], reason: 'first-available' };
  }

  return { value: '', reason: 'none' };
}

module.exports = {
  UI_LANG_TO_TESSERACT,
  UI_LANG_ORDER,
  normalizeLangBase,
  mapUiLanguageToTesseract,
  getRequiredTesseractCodes,
  buildAvailableUiLanguages,
  resolvePreferredUiLanguage,
};
