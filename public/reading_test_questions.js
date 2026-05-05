// public/reading_test_questions.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer script for the reading-test questions modal.
// Responsibilities:
// - Validate required renderer bridges before the modal boots.
// - Serialize initial settings and init-payload updates through one UI sync path.
// - Render single-choice comprehension questions and local scoring feedback.
// - Keep this step informative only; Continue always resumes the main flow.
// =============================================================================

(() => {
  // =============================================================================
  // Renderer bridges / logger
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[reading-test-questions] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('reading-test-questions');
  log.debug('Reading-test questions window starting...');

  const questionsApi = window.readingTestQuestionsAPI || null;
  if (!questionsApi
    || typeof questionsApi.getSettings !== 'function'
    || typeof questionsApi.onInitData !== 'function') {
    throw new Error('[reading-test-questions] readingTestQuestionsAPI unavailable; cannot continue');
  }

  const i18nApi = window.RendererI18n || null;
  if (!i18nApi
    || typeof i18nApi.loadRendererTranslations !== 'function'
    || typeof i18nApi.tRenderer !== 'function'
    || typeof i18nApi.msgRenderer !== 'function'
    || typeof i18nApi.applyWindowLanguageAttributes !== 'function') {
    throw new Error('[reading-test-questions] RendererI18n unavailable; cannot continue');
  }
  const { loadRendererTranslations, tRenderer, msgRenderer, applyWindowLanguageAttributes } = i18nApi;

  const appConstants = window.AppConstants || null;
  if (!appConstants || typeof appConstants.DEFAULT_LANG !== 'string' || !appConstants.DEFAULT_LANG.trim()) {
    throw new Error('[reading-test-questions] AppConstants.DEFAULT_LANG unavailable; cannot continue');
  }
  const formatUtils = window.FormatUtils || null;
  if (!formatUtils
    || typeof formatUtils.obtenerSeparadoresDeNumeros !== 'function'
    || typeof formatUtils.formatearNumero !== 'function') {
    throw new Error('[reading-test-questions] FormatUtils unavailable; cannot continue');
  }
  const { obtenerSeparadoresDeNumeros, formatearNumero } = formatUtils;

  const questionsCore = window.ReadingTestQuestionsCore || null;
  if (!questionsCore
    || typeof questionsCore.validateQuestionsPayload !== 'function'
    || typeof questionsCore.computeRandomGuessPercentage !== 'function'
    || typeof questionsCore.scoreQuestions !== 'function') {
    throw new Error('[reading-test-questions] ReadingTestQuestionsCore unavailable; cannot continue');
  }

  // =============================================================================
  // DOM bootstrap
  // =============================================================================
  document.addEventListener('DOMContentLoaded', initReadingTestQuestionsWindow);

  function initReadingTestQuestionsWindow() {
    function getRequiredElements() {
      // Collect required nodes first so the modal aborts before partial wiring.
      const requiredElements = {
        title: document.getElementById('readingTestQuestionsTitle'),
        intro: document.getElementById('readingTestQuestionsIntro'),
        randomTitle: document.getElementById('readingTestQuestionsRandomTitle'),
        randomValue: document.getElementById('readingTestQuestionsRandomValue'),
        feedbackTitle: document.getElementById('readingTestQuestionsFeedbackTitle'),
        feedbackPrefix: document.getElementById('readingTestQuestionsFeedbackPrefix'),
        feedbackLink: document.getElementById('readingTestQuestionsFeedbackLink'),
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
        return null;
      }

      return requiredElements;
    }

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
    const DEFAULT_LANG = appConstants.DEFAULT_LANG.trim();
    const DEFAULT_DEVELOPER_EMAIL = 'cibersino@gmail.com';
    const INVALID_PAYLOAD_KEY = 'renderer.reading_test.questions.fatal_invalid';

    const state = {
      currentLanguage: DEFAULT_LANG,
      translationsLoadedFor: '',
      settingsCache: {},
      developerEmail: DEFAULT_DEVELOPER_EMAIL,
      questions: [],
      answersByQuestionId: {},
      lastScore: null,
      fatalKey: '',
      showIncompleteWarning: false,
    };
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

    function normalizeLanguage(language, fallback = DEFAULT_LANG) {
      const normalized = typeof language === 'string'
        ? language.trim().toLowerCase()
        : '';
      return normalized || fallback;
    }

    function readSettingsLanguage(settings, fallback = DEFAULT_LANG) {
      return settings && typeof settings.language === 'string'
        ? settings.language
        : fallback;
    }

    async function formatPercentage(value) {
      const numeric = Number(value);
      const safe = Number.isFinite(numeric) ? numeric : 0;
      const { separadorMiles, separadorDecimal } = await obtenerSeparadoresDeNumeros(
        state.currentLanguage || DEFAULT_LANG,
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
        return null;
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
      if (!visible || !structuredContent) {
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
      state.fatalKey = INVALID_PAYLOAD_KEY;
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
      btnCheck.textContent = tr('renderer.reading_test.questions.buttons.check');
      btnContinue.textContent = tr('renderer.reading_test.questions.buttons.continue');
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
      const structuredSummary = buildStructuredPercentageMessage(summaryTemplate, `${percentageText}%`);
      if (!structuredSummary) {
        randomValue.textContent = summaryTemplate.replace('{percentage}', `${percentageText}%`);
        return;
      }
      renderStructuredInlineText(randomValue, structuredSummary);
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
        tr(state.fatalKey || INVALID_PAYLOAD_KEY),
        { tone: 'error', visible: !!state.fatalKey }
      );
    }

    function withAnchoredActionsScroll(updateFn) {
      const beforeTop = actions.getBoundingClientRect().top;
      Promise.resolve()
        .then(() => updateFn())
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
          input.addEventListener('change', () => {
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

    function renderControls() {
      btnCheck.disabled = !!state.fatalKey;
    }

    async function renderUi() {
      renderStaticText();
      renderFeedbackLink();
      await renderRandomSummary();
      renderQuestions();
      await renderStatusMessages();
      renderControls();
    }

    // =============================================================================
    // UI synchronization
    // =============================================================================
    async function ensureTranslationsLoaded() {
      const target = normalizeLanguage(state.currentLanguage);
      if (state.translationsLoadedFor === target) return;
      state.currentLanguage = target;
      applyWindowLanguageAttributes(target);
      try {
        await loadRendererTranslations(target);
        state.translationsLoadedFor = target;
      } catch (err) {
        log.warn('Reading-test questions translation load failed (using fallback copy):', err);
      }
    }

    function enqueueUiSync(updateFn) {
      const runUpdate = async () => {
        await updateFn();
        await ensureTranslationsLoaded();
        await renderUi();
      };
      uiSyncChain = uiSyncChain.then(runUpdate, runUpdate);
      return uiSyncChain;
    }

    function applyPayloadState(payload) {
      state.developerEmail = (payload && typeof payload.developerEmail === 'string' && payload.developerEmail.trim())
        ? payload.developerEmail.trim()
        : state.developerEmail;

      const questionsInfo = questionsCore.validateQuestionsPayload({
        questions: Array.isArray(payload && payload.questions) ? payload.questions : [],
      });

      if (!questionsInfo.ok) {
        setInvalidPayloadState();
        return;
      }

      state.fatalKey = '';
      state.questions = questionsInfo.questions;
      state.answersByQuestionId = {};
      resetEvaluationState();
    }

    function handleInitFailure(err) {
      log.error('Reading-test questions init failed:', err);
      setInvalidPayloadState();
      renderUi().catch((renderErr) => {
        log.error('Reading-test questions recovery render failed:', renderErr);
      });
    }

    function handleInitData(payload) {
      enqueueUiSync(async () => {
        applyPayloadState(payload);
      }).catch((err) => {
        handleInitFailure(err);
      });
    }

    function loadInitialSettings() {
      enqueueUiSync(async () => {
        try {
          const settings = await questionsApi.getSettings();
          state.settingsCache = settings || {};
          state.currentLanguage = normalizeLanguage(readSettingsLanguage(settings));
        } catch (err) {
          log.warn('BOOTSTRAP: Reading-test questions initial settings fetch failed (using default language):', err);
          state.settingsCache = {};
          state.currentLanguage = DEFAULT_LANG;
        }
      }).catch((err) => {
        log.error('BOOTSTRAP: Reading-test questions initial render failed:', err);
      });
    }

    // =============================================================================
    // Event wiring / startup
    // =============================================================================
    btnCheck.addEventListener('click', () => {
      if (state.fatalKey) return;

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

    questionsApi.onInitData(handleInitData);
    loadInitialSettings();
  }
})();

// =============================================================================
// End of public/reading_test_questions.js
// =============================================================================
