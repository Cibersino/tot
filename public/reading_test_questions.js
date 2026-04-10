// public/reading_test_questions.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer script for the reading-test questions modal.
// Responsibilities:
// - Load translations and question init payload.
// - Render single-choice comprehension questions.
// - Compute aggregate score + random-guess baseline locally.
// - Keep the step informative only; Continue always resumes the flow.
// =============================================================================

(() => {
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
    || typeof i18nApi.msgRenderer !== 'function') {
    throw new Error('[reading-test-questions] RendererI18n unavailable; cannot continue');
  }
  const { loadRendererTranslations, tRenderer, msgRenderer } = i18nApi;

  const questionsCore = window.ReadingTestQuestionsCore || null;
  if (!questionsCore
    || typeof questionsCore.validateQuestionsPayload !== 'function'
    || typeof questionsCore.scoreQuestions !== 'function') {
    throw new Error('[reading-test-questions] ReadingTestQuestionsCore unavailable; cannot continue');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const elements = {
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

    if (Object.values(elements).some((element) => !element)) {
      log.error('Reading-test questions window missing required DOM; script aborted.');
      return;
    }

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

    const DEFAULT_LANGUAGE = 'es';
    const DEFAULT_DEVELOPER_EMAIL = 'cibersino@gmail.com';
    const INVALID_PAYLOAD_KEY = 'renderer.reading_test.questions.fatal_invalid';

    const state = {
      currentLanguage: DEFAULT_LANGUAGE,
      translationsLoadedFor: '',
      developerEmail: DEFAULT_DEVELOPER_EMAIL,
      questions: [],
      answersByQuestionId: {},
      lastScore: null,
      fatalKey: '',
      showIncompleteWarning: false,
    };
    let uiSyncChain = Promise.resolve();

    function tr(path, fallback) {
      return tRenderer(path, fallback);
    }

    function mr(path, params, fallback) {
      return msgRenderer(path, params, fallback);
    }

    function normalizeLanguage(language, fallback = DEFAULT_LANGUAGE) {
      const normalized = typeof language === 'string'
        ? language.trim().toLowerCase()
        : '';
      return normalized || fallback;
    }

    function readSettingsLanguage(settings, fallback = DEFAULT_LANGUAGE) {
      return settings && typeof settings.language === 'string'
        ? settings.language
        : fallback;
    }

    function formatPercentage(value) {
      const numeric = Number(value);
      const safe = Number.isFinite(numeric) ? numeric : 0;
      try {
        return new Intl.NumberFormat(state.currentLanguage || DEFAULT_LANGUAGE, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(safe);
      } catch (err) {
        log.warn('Reading-test questions percent format failed (ignored):', err);
        return safe.toFixed(2);
      }
    }

    function setMessage(element, text, { tone = 'info', visible = false } = {}) {
      element.dataset.tone = tone;
      element.dataset.visible = visible ? 'true' : 'false';
      element.textContent = visible ? text : '';
    }

    function resetEvaluationState() {
      state.lastScore = null;
      state.showIncompleteWarning = false;
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

    function renderStaticText() {
      document.title = tr(
        'renderer.reading_test.questions.title',
        'Reading Comprehension Questions'
      );
      title.textContent = tr(
        'renderer.reading_test.questions.title',
        'Reading Comprehension Questions'
      );
      intro.textContent = tr(
        'renderer.reading_test.questions.intro',
        'Answering these reading comprehension questions is optional and does not affect your final score. They are only meant to help you assess the text\'s difficulty and whether your reading pace and style allowed you to reach a basic level of comprehension. Your answers are not saved or sent to the developers or to anyone else.'
      );
      randomTitle.textContent = tr(
        'renderer.reading_test.questions.random_title',
        'Random guess baseline'
      );
      feedbackTitle.textContent = tr(
        'renderer.reading_test.questions.feedback_title',
        'Feedback'
      );
      feedbackPrefix.textContent = tr(
        'renderer.reading_test.questions.feedback_prefix',
        'For complaints:'
      );
      btnCheck.textContent = tr(
        'renderer.reading_test.questions.buttons.check',
        'Check result'
      );
      btnContinue.textContent = tr(
        'renderer.reading_test.questions.buttons.continue',
        'Continue'
      );
    }

    function renderFeedbackLink() {
      feedbackLink.textContent = state.developerEmail;
      feedbackLink.href = `mailto:${state.developerEmail}`;
    }

    function renderRandomSummary() {
      const randomGuessPercentage = questionsCore.computeRandomGuessPercentage(state.questions);
      randomValue.textContent = mr(
        'renderer.reading_test.questions.random_value',
        { percentage: formatPercentage(randomGuessPercentage) },
        `Expected score under random guessing: ${formatPercentage(randomGuessPercentage)}%`
      );
    }

    function renderStatusMessages() {
      setMessage(
        incompleteMessage,
        tr(
          'renderer.reading_test.questions.incomplete_warning',
          'All questions must be answered before evaluating.'
        ),
        { tone: 'warn', visible: state.showIncompleteWarning }
      );

      if (!state.lastScore) {
        setMessage(resultMessage, '', { tone: 'info', visible: false });
        setMessage(chanceMessage, '', { tone: 'note', visible: false });
      } else {
        setMessage(
          resultMessage,
          mr(
            'renderer.reading_test.questions.result_summary',
            {
              correct: state.lastScore.correct,
              total: state.lastScore.total,
              percentage: formatPercentage(state.lastScore.percentage),
            },
            `${state.lastScore.correct} out of ${state.lastScore.total} correct (${formatPercentage(state.lastScore.percentage)}%)`
          ),
          { tone: 'info', visible: true }
        );

        setMessage(
          chanceMessage,
          mr(
            'renderer.reading_test.questions.chance_at_least_observed',
            {
              percentage: formatPercentage(state.lastScore.probabilityAtLeastObserved * 100),
            },
            `Chance of getting at least this score by random guessing: ${formatPercentage(state.lastScore.probabilityAtLeastObserved * 100)}%`
          ),
          { tone: 'note', visible: true }
        );
      }

      setMessage(
        fatalMessage,
        tr(state.fatalKey || INVALID_PAYLOAD_KEY, 'The questions payload is invalid.'),
        { tone: 'error', visible: !!state.fatalKey }
      );
    }

    function withAnchoredActionsScroll(updateFn) {
      const beforeTop = actions.getBoundingClientRect().top;
      updateFn();
      requestAnimationFrame(() => {
        const afterTop = actions.getBoundingClientRect().top;
        const delta = afterTop - beforeTop;
        if (delta !== 0) {
          window.scrollBy(0, delta);
        }
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
          { number: index + 1, prompt: question.prompt },
          `${index + 1}. ${question.prompt}`
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

    function renderUi() {
      renderStaticText();
      renderFeedbackLink();
      renderRandomSummary();
      renderQuestions();
      renderStatusMessages();
      renderControls();
    }

    async function ensureTranslationsLoaded() {
      const target = normalizeLanguage(state.currentLanguage);
      if (state.translationsLoadedFor === target) return;
      await loadRendererTranslations(target);
      state.currentLanguage = target;
      state.translationsLoadedFor = target;
    }

    function enqueueUiSync(updateFn) {
      const runUpdate = async () => {
        await updateFn();
        await ensureTranslationsLoaded();
        renderUi();
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
        state.questions = [];
        state.answersByQuestionId = {};
        resetEvaluationState();
        state.fatalKey = INVALID_PAYLOAD_KEY;
        return;
      }

      state.fatalKey = '';
      state.questions = questionsInfo.questions;
      state.answersByQuestionId = {};
      resetEvaluationState();
    }

    function handleInitFailure(err) {
      log.error('Reading-test questions init failed:', err);
      state.questions = [];
      state.answersByQuestionId = {};
      resetEvaluationState();
      state.fatalKey = INVALID_PAYLOAD_KEY;
      renderUi();
    }

    btnCheck.addEventListener('click', () => {
      if (state.fatalKey) return;

      withAnchoredActionsScroll(() => {
        state.showIncompleteWarning = false;

        if (!allQuestionsAnswered()) {
          state.lastScore = null;
          state.showIncompleteWarning = true;
          renderStatusMessages();
          return;
        }

        state.lastScore = questionsCore.scoreQuestions(state.questions, state.answersByQuestionId);
        renderStatusMessages();
      });
    });

    btnContinue.addEventListener('click', () => {
      window.close();
    });

    questionsApi.onInitData((payload) => {
      enqueueUiSync(async () => {
        applyPayloadState(payload);
      }).catch((err) => {
        handleInitFailure(err);
      });
    });

    enqueueUiSync(async () => {
      try {
        const settings = await questionsApi.getSettings();
        state.currentLanguage = normalizeLanguage(readSettingsLanguage(settings));
      } catch (err) {
        log.warn('Reading-test questions initial settings fetch failed (ignored):', err);
        state.currentLanguage = DEFAULT_LANGUAGE;
      }
    }).catch((err) => {
      log.error('Reading-test questions fallback translation load failed:', err);
    });
  });
})();

// =============================================================================
// End of public/reading_test_questions.js
// =============================================================================
