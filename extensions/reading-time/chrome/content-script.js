/* global chrome */
(function runTextToTimeContentScript() {
  'use strict';

  const Logic = globalThis.TotTextToTimeLogic;
  const {
    CONSTANTS,
    normalizeText,
    hasIntlSegmenter,
    resolveLocale,
    countWords,
    shouldShowUnavailableOverlay,
    parseWpm,
    estimateSeconds,
    formatDuration,
  } = Logic;

  const STORAGE_WPM_KEY = 'totTextToTime.wpm';
  const MESSAGE_GET_SITE_STATE = 'totTextToTime:getSiteState';
  const MESSAGE_SITE_STATE_CHANGED = 'totTextToTime:siteStateChanged';
  const MESSAGE_GET_PAGE_ORIGIN = 'totTextToTime:getPageOrigin';
  const OVERLAY_ID = 'tot-text-to-time-overlay';
  const FADE_MS = 180;
  const TEXT = Object.freeze({
    wordCountLabel: getMessage('overlayWordCountLabel', 'palabras'),
    wordCountingUnavailable: getMessage(
      'overlayWordCountingUnavailable',
      'El conteo de palabras no está disponible en este navegador.'
    ),
    wpmAriaLabel: getMessage('wpmInputAriaLabel', 'Palabras por minuto'),
  });

  let initialized = false;
  let enabled = false;
  let confirmedWpm = CONSTANTS.DEFAULT_WPM;
  let draftWpm = String(CONSTANTS.DEFAULT_WPM);
  let currentWordCount = 0;
  let currentLocale = resolveLocale(
    document.documentElement && document.documentElement.lang,
    navigator.language
  );

  let selectionTimer = null;
  let hideTimer = null;
  let fadeTimer = null;
  let overlayHost = null;
  let overlayShadow = null;
  let panelElement = null;
  let timeElement = null;
  let wordsElement = null;
  let statusElement = null;
  let wpmRowElement = null;
  let wpmInput = null;

  init();

  async function init() {
    document.addEventListener('selectionchange', onSelectionChange, true);
    chrome.runtime.onMessage.addListener(onRuntimeMessage);

    confirmedWpm = await readStoredWpm();
    draftWpm = String(confirmedWpm);

    const siteState = await sendRuntimeMessage({ type: MESSAGE_GET_SITE_STATE });
    enabled = !siteState || siteState.enabled !== false;
    initialized = true;

    if (enabled) {
      scheduleSelectionRead();
    }
  }

  function onRuntimeMessage(message, _sender, sendResponse) {
    if (!message || typeof message.type !== 'string') {
      return false;
    }

    if (message.type === MESSAGE_SITE_STATE_CHANGED) {
      setEnabled(message.enabled !== false);
      return false;
    }

    if (message.type === MESSAGE_GET_PAGE_ORIGIN) {
      if (!isTopFrame()) {
        return false;
      }

      sendResponse({ origin: getPageOrigin() });
      return false;
    }

    return false;
  }

  function setEnabled(nextEnabled) {
    enabled = nextEnabled;

    if (!enabled) {
      cancelSelectionTimer();
      hideOverlayImmediately();
      return;
    }

    if (initialized) {
      scheduleSelectionRead();
    }
  }

  function onSelectionChange() {
    if (!initialized || !enabled || isOverlayInteracting()) {
      return;
    }

    scheduleSelectionRead();
  }

  function scheduleSelectionRead() {
    cancelSelectionTimer();
    selectionTimer = window.setTimeout(
      readSettledSelection,
      CONSTANTS.SELECTION_STABILIZE_MS
    );
  }

  function cancelSelectionTimer() {
    if (selectionTimer !== null) {
      window.clearTimeout(selectionTimer);
      selectionTimer = null;
    }
  }

  function readSettledSelection() {
    selectionTimer = null;

    if (!enabled || isOverlayInteracting()) {
      return;
    }

    if (isActiveEditableElement()) {
      scheduleHide();
      return;
    }

    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      scheduleHide();
      return;
    }

    if (isSelectionInsideOverlay(selection)) {
      return;
    }

    if (isSelectionInsideEditable(selection)) {
      scheduleHide();
      return;
    }

    const text = normalizeText(selection.toString());
    if (!text) {
      scheduleHide();
      return;
    }

    if (!hasIntlSegmenter()) {
      if (!shouldShowUnavailableOverlay(text)) {
        scheduleHide();
        return;
      }

      currentWordCount = 0;
      renderUnavailableOverlay(TEXT.wordCountingUnavailable);
      return;
    }

    currentLocale = resolveLocale(
      document.documentElement && document.documentElement.lang,
      navigator.language
    );

    const wordCount = countWords(text, currentLocale);
    if (wordCount < CONSTANTS.MIN_WORDS) {
      scheduleHide();
      return;
    }

    currentWordCount = wordCount;
    renderOverlay(wordCount);
  }

  function renderOverlay(wordCount) {
    ensureOverlay();
    cancelHideTimers();
    setOverlayMode('default');

    timeElement.textContent = formatDuration(estimateSeconds(wordCount, confirmedWpm));
    wordsElement.textContent = `${wordCount} ${TEXT.wordCountLabel}`;

    if (!isWpmInputFocused()) {
      draftWpm = String(confirmedWpm);
      wpmInput.value = draftWpm;
    }

    const host = overlayHost;
    host.hidden = false;
    window.requestAnimationFrame(() => {
      if (enabled && host && !host.hidden) {
        host.setAttribute('data-visible', 'true');
      }
    });
  }

  function renderUnavailableOverlay(message) {
    ensureOverlay();
    cancelHideTimers();
    setOverlayMode('unavailable');

    statusElement.textContent = message;

    const host = overlayHost;
    host.hidden = false;
    window.requestAnimationFrame(() => {
      if (enabled && host && !host.hidden) {
        host.setAttribute('data-visible', 'true');
      }
    });
  }

  function scheduleHide() {
    if (!overlayHost || overlayHost.hidden || hideTimer !== null) {
      return;
    }

    hideTimer = window.setTimeout(() => {
      hideTimer = null;
      fadeOverlay();
    }, CONSTANTS.HIDE_DELAY_MS);
  }

  function fadeOverlay() {
    if (!overlayHost) return;

    overlayHost.removeAttribute('data-visible');
    fadeTimer = window.setTimeout(() => {
      if (overlayHost && !overlayHost.hasAttribute('data-visible')) {
        overlayHost.hidden = true;
      }
      fadeTimer = null;
    }, FADE_MS);
  }

  function hideOverlayImmediately() {
    cancelHideTimers();
    if (!overlayHost) return;

    overlayHost.removeAttribute('data-visible');
    overlayHost.hidden = true;
  }

  function cancelHideTimers() {
    if (hideTimer !== null) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }

    if (fadeTimer !== null) {
      window.clearTimeout(fadeTimer);
      fadeTimer = null;
    }
  }

  function ensureOverlay() {
    if (overlayHost) return;

    overlayHost = document.createElement('div');
    overlayHost.id = OVERLAY_ID;
    overlayHost.hidden = true;
    overlayHost.style.position = 'fixed';
    overlayHost.style.right = '18px';
    overlayHost.style.bottom = '18px';
    overlayHost.style.zIndex = '2147483647';

    overlayShadow = overlayHost.attachShadow({ mode: 'open' });

    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = chrome.runtime.getURL('content.css');

    const panel = document.createElement('div');
    panel.className = 'tot-panel';
    panel.setAttribute('part', 'panel');
    panelElement = panel;

    timeElement = document.createElement('div');
    timeElement.className = 'tot-time';

    wordsElement = document.createElement('div');
    wordsElement.className = 'tot-words';

    statusElement = document.createElement('div');
    statusElement.className = 'tot-status';
    statusElement.hidden = true;

    const wpmRow = document.createElement('label');
    wpmRow.className = 'tot-wpm-row';
    wpmRowElement = wpmRow;

    wpmInput = document.createElement('input');
    wpmInput.className = 'tot-wpm-input';
    wpmInput.type = 'text';
    wpmInput.inputMode = 'numeric';
    wpmInput.autocomplete = 'off';
    wpmInput.spellcheck = false;
    wpmInput.value = draftWpm;
    wpmInput.setAttribute('aria-label', TEXT.wpmAriaLabel);

    const wpmLabel = document.createElement('span');
    wpmLabel.className = 'tot-wpm-label';
    wpmLabel.textContent = 'WPM';

    wpmRow.append(wpmInput, wpmLabel);
    panel.append(timeElement, wordsElement, statusElement, wpmRow);
    overlayShadow.append(stylesheet, panel);

    wireOverlayEvents(panel);
    document.documentElement.appendChild(overlayHost);
  }

  function setOverlayMode(mode) {
    if (!panelElement) {
      return;
    }

    const isUnavailable = mode === 'unavailable';
    panelElement.setAttribute('data-mode', isUnavailable ? 'unavailable' : 'default');
    timeElement.hidden = isUnavailable;
    wordsElement.hidden = isUnavailable;
    statusElement.hidden = !isUnavailable;
    wpmRowElement.hidden = isUnavailable;
  }

  function wireOverlayEvents(panel) {
    const stopOverlayEvent = (event) => {
      event.stopPropagation();
    };

    panel.addEventListener('pointerdown', stopOverlayEvent, true);
    panel.addEventListener('mousedown', stopOverlayEvent, true);
    panel.addEventListener('mouseup', stopOverlayEvent, true);
    panel.addEventListener('click', stopOverlayEvent, true);
    panel.addEventListener('dblclick', stopOverlayEvent, true);

    panel.addEventListener('selectstart', (event) => {
      if (event.target !== wpmInput) {
        event.preventDefault();
      }
      event.stopPropagation();
    });

    wpmInput.addEventListener('input', () => {
      draftWpm = wpmInput.value;
    });

    wpmInput.addEventListener('keydown', (event) => {
      event.stopPropagation();

      if (event.key === 'Enter') {
        event.preventDefault();
        confirmWpmDraft();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        restoreConfirmedWpm();
      }
    });

    wpmInput.addEventListener('blur', () => {
      confirmWpmDraft();
    });
  }

  function confirmWpmDraft() {
    const parsed = parseWpm(wpmInput.value);
    if (!parsed.ok) {
      restoreConfirmedWpm();
      return;
    }

    confirmedWpm = parsed.value;
    draftWpm = String(confirmedWpm);
    wpmInput.value = draftWpm;
    persistWpm(confirmedWpm);
    updateEstimateForCurrentSelection();
  }

  function restoreConfirmedWpm() {
    draftWpm = String(confirmedWpm);
    wpmInput.value = draftWpm;
    updateEstimateForCurrentSelection();
  }

  function updateEstimateForCurrentSelection() {
    if (!timeElement || currentWordCount < CONSTANTS.MIN_WORDS) {
      return;
    }

    timeElement.textContent = formatDuration(
      estimateSeconds(currentWordCount, confirmedWpm)
    );
  }

  function isOverlayInteracting() {
    return Boolean(
      overlayShadow
      && overlayShadow.activeElement
      && overlayShadow.activeElement === wpmInput
    );
  }

  function isWpmInputFocused() {
    return isOverlayInteracting();
  }

  function isSelectionInsideOverlay(selection) {
    return (
      isNodeInsideOverlay(selection.anchorNode)
      || isNodeInsideOverlay(selection.focusNode)
      || Array.from({ length: selection.rangeCount }).some((_, index) => {
        const range = selection.getRangeAt(index);
        return isNodeInsideOverlay(range.commonAncestorContainer);
      })
    );
  }

  function isNodeInsideOverlay(node) {
    if (!node || !overlayHost) return false;
    if (node === overlayHost || overlayHost.contains(node)) return true;

    if (typeof node.getRootNode === 'function') {
      return node.getRootNode() === overlayShadow;
    }

    return false;
  }

  function isActiveEditableElement() {
    const activeElement = document.activeElement;
    return Boolean(activeElement && isEditableElement(activeElement));
  }

  function isSelectionInsideEditable(selection) {
    if (isEditableNode(selection.anchorNode) || isEditableNode(selection.focusNode)) {
      return true;
    }

    for (let index = 0; index < selection.rangeCount; index += 1) {
      if (isEditableNode(selection.getRangeAt(index).commonAncestorContainer)) {
        return true;
      }
    }

    return false;
  }

  function isEditableNode(node) {
    const element = elementFromNode(node);
    return Boolean(element && isEditableElement(element));
  }

  function elementFromNode(node) {
    if (!node) return null;
    if (node.nodeType === Node.ELEMENT_NODE) return node;
    return node.parentElement || null;
  }

  function isEditableElement(element) {
    if (!element || element === overlayHost) return false;

    if (element.closest('input, textarea')) {
      return true;
    }

    if (element.isContentEditable) {
      return true;
    }

    return Boolean(element.closest('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'));
  }

  async function readStoredWpm() {
    const result = await storageLocalGet({ [STORAGE_WPM_KEY]: CONSTANTS.DEFAULT_WPM });
    const parsed = parseWpm(result[STORAGE_WPM_KEY]);
    return parsed.ok ? parsed.value : CONSTANTS.DEFAULT_WPM;
  }

  function persistWpm(value) {
    chrome.storage.local.set({ [STORAGE_WPM_KEY]: value });
  }

  function storageLocalGet(defaults) {
    return new Promise((resolve) => {
      chrome.storage.local.get(defaults, (result) => {
        if (chrome.runtime.lastError) {
          resolve(defaults);
          return;
        }

        resolve(result || defaults);
      });
    });
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }

        resolve(response || null);
      });
    });
  }

  function getMessage(key, fallback) {
    if (!chrome.i18n || typeof chrome.i18n.getMessage !== 'function') {
      return fallback;
    }

    return chrome.i18n.getMessage(key) || fallback;
  }

  function isTopFrame() {
    return window.self === window.top;
  }

  function getPageOrigin() {
    return location.origin && location.origin !== 'null' ? location.origin : null;
  }
})();
