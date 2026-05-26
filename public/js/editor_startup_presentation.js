// public/js/editor_startup_presentation.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Startup-presentation core for the Text Editor renderer.
// Responsibilities:
// - Parse the fresh-startup query parameters injected by main.
// - Keep startup presentation intent stable until actual/native state is ready.
// - Buffer actual/native window-state updates while startup intent is locked.

// =============================================================================
// Module Factory
// =============================================================================

function createEditorStartupPresentation() {
  function normalizeInitialPresentationMode(value) {
    return value === 'maximized' ? 'maximized' : 'reduced';
  }

  function normalizeFirstShowGeneration(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }

  function parseStartupQuery(search = '') {
    const params = new URLSearchParams(typeof search === 'string' ? search : '');
    return {
      initialPresentationMode: normalizeInitialPresentationMode(params.get('initialPresentationMode')),
      firstShowGeneration: normalizeFirstShowGeneration(params.get('firstShowGeneration')),
    };
  }

  function createStartupPresentationController(startupQuery = {}) {
    const initialPresentationMode = normalizeInitialPresentationMode(startupQuery.initialPresentationMode);
    const firstShowGeneration = normalizeFirstShowGeneration(startupQuery.firstShowGeneration);
    let startupLockReleased = false;
    let pendingActualWindowState = null;

    function captureActualWindowState(windowState) {
      pendingActualWindowState = windowState && typeof windowState === 'object'
        ? { ...windowState }
        : null;
      return startupLockReleased ? pendingActualWindowState : null;
    }

    function releaseStartupLock() {
      startupLockReleased = true;
      return pendingActualWindowState;
    }

    return {
      initialPresentationMode,
      firstShowGeneration,
      isInitiallyMaximized() {
        return initialPresentationMode === 'maximized';
      },
      captureActualWindowState,
      releaseStartupLock,
    };
  }

  return {
    parseStartupQuery,
    createStartupPresentationController,
  };
}

// =============================================================================
// Exports
// =============================================================================

(function initEditorStartupPresentation(factory) {
  if (typeof window !== 'undefined') {
    window.EditorStartupPresentation = factory();
  }
})(createEditorStartupPresentation);

// =============================================================================
// End of public/js/editor_startup_presentation.js
// =============================================================================
