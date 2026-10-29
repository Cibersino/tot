// public/reading_test_questions.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer script for the reading-test questions modal.
// Responsibilities:
// - Validate required renderer bridges before the modal boots.
// - Resolve bootstrap settings and init-payload updates through one render path.
// - Render single-choice comprehension questions plus local scoring feedback.
// - Keep validation and scoring delegated to ReadingTestQuestionsCore.
// - Keep this step informative only; Continue always resumes the main flow.

(() => {
  // =============================================================================
  // Renderer bridges / logger
  // =============================================================================
  let log = null;

  function failClosedQuestionsBootstrap(error) {
    try {
      if (log && typeof log.error === 'function') {
        log.error('Reading-test questions bootstrap failed; closing window:', error);
      }
    } finally {
      if (typeof window.close === 'function') window.close();
    }
    throw error;
  }

  if (typeof window.getLogger !== 'function') {
    failClosedQuestionsBootstrap(new Error('[reading-test-questions] window.getLogger unavailable; cannot continue'));
  }
  try {
    log = window.getLogger('reading-test-questions');
    log.debug('Reading-test questions window starting...');
  } catch (error) {
    failClosedQuestionsBootstrap(error);
  }

  const questionsApi = window.readingTestQuestionsAPI || null;
  if (!questionsApi) {
    failClosedQuestionsBootstrap(new Error('[reading-test-questions] readingTestQuestionsAPI unavailable; cannot continue'));
  }
  if (typeof questionsApi.onInitData !== 'function') {
    failClosedQuestionsBootstrap(new Error(
      '[reading-test-questions] readingTestQuestionsAPI.onInitData unavailable or non-callable; cannot continue'
    ));
  }
  let questionsI18nTerminal = false;
  let questionsBootstrapTerminal = false;
  let setQuestionsTerminalUnavailable = () => {};
  const i18nApi = window.RendererI18n || null;
  if (!i18nApi
    || typeof i18nApi.transitionRendererTranslations !== 'function'
    || typeof i18nApi.tRenderer !== 'function'
    || typeof i18nApi.msgRenderer !== 'function') {
    reportTerminalQuestionsI18nFailure('startup-api');
    throw new Error('[reading-test-questions] RendererI18n unavailable; cannot continue');
  }
  const { transitionRendererTranslations, tRenderer, msgRenderer } = i18nApi;

  const appConstants = window.AppConstants || null;
  if (!appConstants || typeof appConstants.DEFAULT_LANG !== 'string' || !appConstants.DEFAULT_LANG.trim()) {
    throw new Error('[reading-test-questions] AppConstants.DEFAULT_LANG unavailable; cannot continue');
  }
  const formatUtils = window.FormatUtils || null;
  if (!formatUtils
    || typeof formatUtils.obtenerSeparadoresDeNumeros !== 'function'
    || typeof formatUtils.formatearNumero !== 'function') {
    failClosedQuestionsBootstrap(new Error('[reading-test-questions] FormatUtils unavailable; cannot continue'));
  }
  const { obtenerSeparadoresDeNumeros, formatearNumero } = formatUtils;

  const questionsCore = window.ReadingTestQuestionsCore || null;
  if (!questionsCore
    || typeof questionsCore.validateQuestionsPayload !== 'function'
    || typeof questionsCore.computeRandomGuessPercentage !== 'function'
    || typeof questionsCore.scoreQuestions !== 'function') {
    failClosedQuestionsBootstrap(new Error('[reading-test-questions] ReadingTestQuestionsCore unavailable; cannot continue'));
  }

  if (typeof questionsApi.onSettingsChanged !== 'function') {
    const error = new Error(
      '[reading-test-questions] readingTestQuestionsAPI.onSettingsChanged unavailable; required settings synchronization cannot be established'
    );
    log.error(
      'Reading-test questions bootstrap failed: readingTestQuestionsAPI.onSettingsChanged unavailable; required settings synchronization cannot be established.',
      error
    );
    reportTerminalQuestionsI18nFailure('settings-listener');
    throw error;
  }

  // =============================================================================
  // App lifecycle / bootstrapping
  // =============================================================================
  document.addEventListener('DOMContentLoaded', initReadingTestQuestionsWindow);

  function reportTerminalQuestionsI18nFailure(kind) {
    if (questionsI18nTerminal) return;
    questionsI18nTerminal = true;
    setQuestionsTerminalUnavailable();
    if (typeof questionsApi.reportRendererI18nFailure !== 'function') {
      log.warn('readingTestQuestionsAPI.reportRendererI18nFailure unavailable (ignored); closing failed renderer locally.');
      if (typeof window.close === 'function') window.close();
      return;
    }
    try {
      questionsApi.reportRendererI18nFailure({ kind });
    } catch (error) {
      log.warn('readingTestQuestionsAPI.reportRendererI18nFailure failed (ignored); closing failed renderer locally:', error);
      if (typeof window.close === 'function') window.close();
    }
  }

  function getRequiredElements() {
    // Keep the required DOM contract explicit so the modal aborts before partial wiring if the HTML shell drifts from this renderer script.
    const requiredElements = {
      title: document.getElementById('readingTestQuestionsTitle'),
      intro: document.getElementById('readingTestQuestionsIntro'),
      randomTitle: document.getElementById('readingTestQuestionsRandomTitle'),
      randomValue: document.getElementById('readingTestQuestionsRandomValue'),
      feedbackTitle: document.getElementById('readingTestQuestionsFeedbackTitle'),
      feedbackPrefix: document.getElementById('readingTestQuestionsFeedbackPrefix'),
      feedbackLink: document.getElementById('readingTestQuestionsFeedbackLink'),
      summaryRegion: document.querySelector('.reading-test-questions__meta'),
      incompleteMessage: document.getElementById('readingTestQuestionsIncomplete'),
      resultMessage: document.getElementById('readingTestQuestionsResult'),
      chanceMessage: document.getElementById('readingTestQuestionsChance'),
      fatalMessage: document.getElementById('readingTestQuestionsFatal'),
      form: document.getElementById('readingTestQuestionsForm'),
      btnCheck: document.getElementById('readingTestQuestionsCheck'),
      btnContinue: document.getElementById('readingTestQuestionsContinue'),
      actions: document.querySelector('.reading-test-questions__actions'),
    };

    if (Object.values(requiredElements).some((element) => !element)) {
      log.error('Reading-test questions window missing required DOM; script aborted.');
      if (typeof window.close === 'function') window.close();
      return null;
    }

    return requiredElements;
  }

  function initReadingTestQuestionsWindow() {
    if (questionsI18nTerminal || questionsBootstrapTerminal) return;

    const elements = getRequiredElements();
    if (!elements) return;

    const {
      title,
      intro,
      randomTitle,
      randomValue,
      feedbackTitle,
      feedbackPrefix,
      feedbackLink,
      summaryRegion,
      incompleteMessage,
      resultMessage,
      chanceMessage,
      fatalMessage,
      form,
      btnCheck,
      btnContinue,
      actions,
    } = elements;

    // =============================================================================
    // Constants / shared state
    // =============================================================================
    const defaultLanguage = appConstants.DEFAULT_LANG.trim();
    const defaultDeveloperEmail = 'cibersino@gmail.com';
    const invalidPayloadKey = 'renderer.reading_test.questions.fatal_invalid';

    const state = {
      currentLanguage: defaultLanguage,
      translationsLoadedFor: '',
      settingsCache: {},
      developerEmail: defaultDeveloperEmail,
      questions: [],
      answersByQuestionId: {},
      lastScore: null,
      fatalKey: '',
      showIncompleteWarning: false,
      initialValidPayloadRendered: false,
    };
    // Queue UI updates so preload replay and bootstrap settings stay serialized.
    let uiSyncChain = Promise.resolve();

    // =============================================================================
    // Helpers
    // =============================================================================
    function tr(path) {
      return tRenderer(path);
    }

    function mr(path, params) {
      return msgRenderer(path, params);
    }

    function normalizeLanguage(language, fallback = defaultLanguage) {
      const normalized = typeof language === 'string'
        ? language.trim().toLowerCase()
        : '';
      return normalized || fallback;
    }

    function readSettingsLanguage(settings, fallback = defaultLanguage) {
      return settings && typeof settings.language === 'string'
        ? settings.language
        : fallback;
    }

    async function formatPercentage(value) {
      const numeric = Number(value);
      const safe = Number.isFinite(numeric) ? numeric : 0;
      const { separadorMiles, separadorDecimal } = await obtenerSeparadoresDeNumeros(
        state.currentLanguage || defaultLanguage,
        state.settingsCache
      );
      return formatearNumero(safe, separadorMiles, separadorDecimal, 2);
    }

    function createInvariantValueNode(valueText) {
      const valueNode = document.createElement('bdi');
      valueNode.className = 'reading-test-questions__invariant-value';
      valueNode.dir = 'ltr';
      valueNode.textContent = String(valueText ?? '');
      return valueNode;
    }

    function renderStructuredInlineText(element, {
      beforeText = '',
      valueText = '',
      afterText = '',
    } = {}) {
      element.textContent = '';
      if (beforeText) {
        element.appendChild(document.createTextNode(beforeText));
      }
      element.appendChild(createInvariantValueNode(valueText));
      if (afterText) {
        element.appendChild(document.createTextNode(afterText));
      }
    }

    function buildStructuredPercentageMessage(template, percentageValueText, { wrapped = false } = {}) {
      const marker = '{percentage}';
      const templateText = typeof template === 'string' ? template : '';
      const markerIndex = templateText.indexOf(marker);
      if (markerIndex === -1) {
        log.warn('reading-test questions template missing {percentage} placeholder:', templateText);
      }

      let beforeText = templateText.slice(0, markerIndex);
      let afterText = templateText.slice(markerIndex + marker.length);
      afterText = afterText.replace(/^[%٪]/u, '');

      let openWrapper = '';
      let closeWrapper = '';
      if (wrapped) {
        const openMatch = beforeText.match(/[（(]\s*$/u);
        if (openMatch) {
          openWrapper = openMatch[0].replace(/\s+/gu, '');
          beforeText = beforeText.slice(0, beforeText.length - openMatch[0].length) + openMatch[0].replace(/[（(]/u, '');
        }

        const closeMatch = afterText.match(/^\s*[）)]/u);
        if (closeMatch) {
          closeWrapper = closeMatch[0].replace(/\s+/gu, '');
          afterText = afterText.slice(closeMatch[0].length);
        }
      }

      return {
        beforeText,
        valueText: `${openWrapper}${percentageValueText}${closeWrapper}`,
        afterText,
      };
    }

    function setMessage(element, text, { tone = 'info', visible = false } = {}) {
      element.dataset.tone = tone;
      element.dataset.visible = visible ? 'true' : 'false';
      element.textContent = visible ? text : '';
    }

    function setStructuredMessage(element, structuredContent, { tone = 'info', visible = false } = {}) {
      element.dataset.tone = tone;
      element.dataset.visible = visible ? 'true' : 'false';
      if (!visible) {
        element.textContent = '';
        return;
      }
      renderStructuredInlineText(element, structuredContent);
    }

    function resetEvaluationState() {
      state.lastScore = null;
      state.showIncompleteWarning = false;
    }

    function setInvalidPayloadState() {
      state.questions = [];
      state.answersByQuestionId = {};
      resetEvaluationState();
      state.fatalKey = invalidPayloadKey;
    }

    function collectSelectedAnswer(questionId) {
      return typeof state.answersByQuestionId[questionId] === 'string'
        ? state.answersByQuestionId[questionId]
        : '';
    }

    function allQuestionsAnswered() {
      return state.questions.every((question) => {
        const answer = collectSelectedAnswer(question.id);
        return !!answer;
      });
    }

    function canUseQuestionControls() {
      return !questionsI18nTerminal
        && !!state.translationsLoadedFor
        && state.initialValidPayloadRendered
        && !state.fatalKey;
    }

    setQuestionsTerminalUnavailable = () => {
      btnCheck.disabled = true;
      form.querySelectorAll('input[type="radio"]').forEach((input) => {
        input.disabled = true;
      });
      btnContinue.disabled = false;
    };

    // =============================================================================
    // Rendering
    // =============================================================================
    function renderStaticText() {
      document.title = tr('renderer.reading_test.questions.title');
      title.textContent = tr('renderer.reading_test.questions.title');
      intro.textContent = tr('renderer.reading_test.questions.intro');
      randomTitle.textContent = tr('renderer.reading_test.questions.random_title');
      feedbackTitle.textContent = tr('renderer.reading_test.questions.feedback_title');
      feedbackPrefix.textContent = tr('renderer.reading_test.questions.feedback_prefix');
      summaryRegion.setAttribute('aria-label', tr('renderer.reading_test.questions.summary_aria'));
      btnCheck.textContent = tr('renderer.reading_test.questions.check_button');
      btnContinue.textContent = tr('renderer.reading_test.questions.continue_button');
    }

    function renderFeedbackLink() {
      feedbackLink.textContent = state.developerEmail;
      feedbackLink.href = `mailto:${state.developerEmail}`;
    }

    async function renderRandomSummary() {
      const randomGuessPercentage = questionsCore.computeRandomGuessPercentage(state.questions);
      const percentageText = await formatPercentage(randomGuessPercentage);
      const summaryTemplate = mr(
        'renderer.reading_test.questions.random_value',
        { percentage: '{percentage}' }
      );
      renderStructuredInlineText(
        randomValue,
        buildStructuredPercentageMessage(summaryTemplate, `${percentageText}%`)
      );
    }

    async function renderStatusMessages() {
      setMessage(
        incompleteMessage,
        tr('renderer.reading_test.questions.incomplete_warning'),
        { tone: 'warn', visible: state.showIncompleteWarning }
      );

      if (!state.lastScore) {
        setMessage(resultMessage, '', { tone: 'info', visible: false });
        setMessage(chanceMessage, '', { tone: 'note', visible: false });
      } else {
        const scorePercentageText = await formatPercentage(state.lastScore.percentage);
        const chancePercentageText = await formatPercentage(state.lastScore.probabilityAtLeastObserved * 100);
        const resultTemplate = mr(
          'renderer.reading_test.questions.result_summary',
          {
            correct: state.lastScore.correct,
            total: state.lastScore.total,
            percentage: '{percentage}',
          }
        );
        const structuredResult = buildStructuredPercentageMessage(
          resultTemplate,
          `${scorePercentageText}%`,
          { wrapped: true }
        );
        setStructuredMessage(
          resultMessage,
          structuredResult,
          { tone: 'info', visible: true }
        );

        const chanceTemplate = mr(
          'renderer.reading_test.questions.chance_at_least_observed',
          {
            percentage: '{percentage}',
          }
        );
        const structuredChance = buildStructuredPercentageMessage(
          chanceTemplate,
          `${chancePercentageText}%`
        );
        setStructuredMessage(
          chanceMessage,
          structuredChance,
          { tone: 'note', visible: true }
        );
      }

      setMessage(
        fatalMessage,
        tr(state.fatalKey || invalidPayloadKey),
        { tone: 'error', visible: !!state.fatalKey }
      );
    }

    function withAnchoredActionsScroll(updateFn) {
      // Keep the action row visually anchored when status messages expand or collapse after interactive scoring updates.
      const beforeTop = actions.getBoundingClientRect().top;
      Promise.resolve()
        .then(() => updateFn())
        .catch((error) => {
          log.error('Reading-test questions check update failed:', error);
        })
        .finally(() => {
          requestAnimationFrame(() => {
            const afterTop = actions.getBoundingClientRect().top;
            const delta = afterTop - beforeTop;
            if (delta !== 0) {
              window.scrollBy(0, delta);
            }
          });
        });
    }

    function renderQuestions() {
      form.innerHTML = '';

      state.questions.forEach((question, index) => {
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'reading-test-questions__question';

        const legend = document.createElement('legend');
        const headingText = mr(
          'renderer.reading_test.questions.question_heading',
          { number: index + 1, prompt: question.prompt }
        );
        legend.textContent = headingText;
        legend.className = 'reading-test-questions__legend-sr';
        fieldset.appendChild(legend);

        const heading = document.createElement('div');
        heading.className = 'reading-test-questions__question-heading';
        heading.textContent = headingText;
        fieldset.appendChild(heading);

        const optionsList = document.createElement('div');
        optionsList.className = 'reading-test-questions__options';

        question.options.forEach((option) => {
          const label = document.createElement('label');
          label.className = 'reading-test-questions__option';

          const input = document.createElement('input');
          input.type = 'radio';
          input.name = `reading-test-question-${question.id}`;
          input.value = option.id;
          input.checked = collectSelectedAnswer(question.id) === option.id;
          input.disabled = !canUseQuestionControls();
          input.addEventListener('change', () => {
            if (!canUseQuestionControls()) return;
            state.answersByQuestionId[question.id] = option.id;
          });

          const text = document.createElement('span');
          text.textContent = option.text;

          label.appendChild(input);
          label.appendChild(text);
          optionsList.appendChild(label);
        });

        fieldset.appendChild(optionsList);
        form.appendChild(fieldset);
      });
    }

    function rebuildQuestionsWithSafeFocus() {
      // This check intentionally occurs immediately before form replacement: an async translation load may have allowed focus to move meanwhile.
      const focusedNode = document.activeElement;
      const replacingFocusedQuestionControl = !!(
        focusedNode
        && focusedNode !== form
        && form.contains(focusedNode)
      );
      renderQuestions();
      if (replacingFocusedQuestionControl) {
        btnContinue.focus({ preventScroll: true });
      }
    }

    function renderControls() {
      const controlsAvailable = canUseQuestionControls();
      btnCheck.disabled = !controlsAvailable;
      form.querySelectorAll('input[type="radio"]').forEach((input) => {
        input.disabled = !controlsAvailable;
      });
      btnContinue.disabled = false;
    }

    async function renderUi() {
      renderStaticText();
      renderFeedbackLink();
      await renderRandomSummary();
      rebuildQuestionsWithSafeFocus();
      await renderStatusMessages();
      renderControls();
    }

    // =============================================================================
    // UI synchronization
    // =============================================================================
    async function transitionQuestionsTranslations(language, settings) {
      const target = normalizeLanguage(language || state.currentLanguage);
      const previousLanguage = state.currentLanguage;
      const previousSettings = state.settingsCache;
      const nextSettings = typeof settings === 'undefined'
        ? state.settingsCache
        : settings || {};
      await transitionRendererTranslations(target, {
        applyTranslations: async ({ language: appliedLanguage, restoring }) => {
          state.currentLanguage = restoring ? previousLanguage : appliedLanguage;
          state.settingsCache = restoring ? previousSettings : nextSettings;
          await renderUi();
        },
      });
      state.translationsLoadedFor = state.currentLanguage;
    }

    function reportQuestionsI18nFailure(error, { startup = false } = {}) {
      const transition = error && error.rendererI18nTransition;
      if (!transition) {
        return;
      }
      if (!startup && transition && transition.hadEstablishedState && !transition.restorationFailed) {
        log.error('Reading-test questions language transition failed; previous translation state remains authoritative:', error);
        return;
      }
      log.error('Reading-test questions i18n failure requires window closure:', error);
      reportTerminalQuestionsI18nFailure(startup ? 'startup' : 'transition-restoration');
    }

    function enqueueUiSync(updateFn) {
      // Funnel bootstrap, init-data, and settings updates through one queue so translation readiness and DOM rendering observe the same ordering.
      const runUpdate = async () => {
        // Main-process closure is asynchronous. Do not admit queued semantic work after this window has entered a terminal state.
        if (questionsI18nTerminal || questionsBootstrapTerminal) return;
        const transitionRequest = await updateFn();
        if (transitionRequest === false) return;
        await transitionQuestionsTranslations(
          transitionRequest && transitionRequest.language,
          transitionRequest && transitionRequest.settings
        );
      };
      uiSyncChain = uiSyncChain.then(runUpdate, runUpdate);
      return uiSyncChain;
    }

    function applyPayloadState(payload) {
      // The shared core owns payload validation and question sanitation; this renderer only stores the accepted structure and local view state.
      state.developerEmail = (payload && typeof payload.developerEmail === 'string' && payload.developerEmail.trim())
        ? payload.developerEmail.trim()
        : state.developerEmail;

      const questionsInfo = questionsCore.validateQuestionsPayload({
        questions: Array.isArray(payload && payload.questions) ? payload.questions : [],
      });

      if (!questionsInfo.ok) {
        log.error('Reading-test questions init payload failed validation:', questionsInfo.code);
        setInvalidPayloadState();
        return false;
      }

      state.fatalKey = '';
      state.questions = questionsInfo.questions;
      state.answersByQuestionId = {};
      resetEvaluationState();
      return true;
    }

    function handleInitFailure(error) {
      log.error('Reading-test questions init failed:', error);
      if (error && error.rendererI18nTransition) {
        reportQuestionsI18nFailure(error, { startup: !state.translationsLoadedFor });
        return;
      }
      setInvalidPayloadState();
      enqueueUiSync(async () => ({
        language: state.currentLanguage,
        settings: state.settingsCache,
      })).catch((renderError) => {
        log.error('Reading-test questions recovery render failed:', renderError);
        reportQuestionsI18nFailure(renderError, { startup: !state.translationsLoadedFor });
      });
    }

    function handleInitData(payload) {
      if (questionsI18nTerminal || questionsBootstrapTerminal) return;
      let acceptedPayload = false;
      enqueueUiSync(async () => {
        acceptedPayload = applyPayloadState(payload);
      }).then(() => {
        if (questionsI18nTerminal || questionsBootstrapTerminal) return;
        if (acceptedPayload) {
          state.initialValidPayloadRendered = true;
          renderControls();
        }
        const firstAnswer = form.querySelector('input[type="radio"]');
        const focusTarget = (acceptedPayload && firstAnswer) || btnContinue;
        try {
          focusTarget.focus({ preventScroll: true });
        } catch (error) {
          log.warn('Reading-test questions initial focus failed (ignored):', error);
        }
      }).catch((error) => {
        handleInitFailure(error);
      });
    }

    function loadInitialSettings() {
      // Bootstrap may start before persisted settings are available; this path applies the stored language when possible and otherwise keeps DEFAULT_LANG.
      enqueueUiSync(async () => {
        let nextSettings;
        if (typeof questionsApi.getSettings !== 'function') {
          log.warn('BOOTSTRAP: readingTestQuestionsAPI.getSettings unavailable; using default renderer settings.');
          nextSettings = {};
        } else {
          try {
            nextSettings = await questionsApi.getSettings() || {};
          } catch (error) {
            log.warn('BOOTSTRAP: Reading-test questions initial settings fetch failed (using default language):', error);
            nextSettings = {};
          }
        }
        return {
          language: normalizeLanguage(readSettingsLanguage(nextSettings)),
          settings: nextSettings,
        };
      }).catch((error) => {
        log.error('BOOTSTRAP: Reading-test questions initial render failed:', error);
        reportQuestionsI18nFailure(error, { startup: !state.translationsLoadedFor });
      });
    }

    function handleSettingsChanged(settings) {
      if (questionsI18nTerminal) return;
      enqueueUiSync(async () => {
        const nextSettings = settings || {};
        const nextLanguage = normalizeLanguage(readSettingsLanguage(nextSettings));
        const languageChanged = nextLanguage !== state.currentLanguage;
        const needsTranslationRetry = state.translationsLoadedFor !== nextLanguage;
        if (!languageChanged && !needsTranslationRetry) {
          state.settingsCache = nextSettings;
          return false;
        }
        return { language: nextLanguage, settings: nextSettings };
      }).catch((error) => {
        reportQuestionsI18nFailure(error);
      });
    }

    // =============================================================================
    // Event wiring / startup
    // =============================================================================
    btnCheck.addEventListener('click', () => {
      if (!canUseQuestionControls()) return;

      withAnchoredActionsScroll(() => {
        state.showIncompleteWarning = false;

        if (!allQuestionsAnswered()) {
          state.lastScore = null;
          state.showIncompleteWarning = true;
          return renderStatusMessages();
        }

        state.lastScore = questionsCore.scoreQuestions(state.questions, state.answersByQuestionId);
        return renderStatusMessages();
      });
    });

    btnContinue.addEventListener('click', () => {
      window.close();
    });

    try {
      questionsApi.onInitData(handleInitData);
    } catch (error) {
      questionsBootstrapTerminal = true;
      setQuestionsTerminalUnavailable();
      log.error('Reading-test questions bootstrap failed while registering readingTestQuestionsAPI.onInitData:', error);
      if (typeof window.close === 'function') window.close();
      return;
    }

    try {
      questionsApi.onSettingsChanged(handleSettingsChanged);
    } catch (error) {
      log.error('Reading-test questions bootstrap failed while registering readingTestQuestionsAPI.onSettingsChanged:', error);
      reportTerminalQuestionsI18nFailure('settings-listener');
      return;
    }
    loadInitialSettings();
  }
})();

// =============================================================================
// End of public/reading_test_questions.js
// =============================================================================
