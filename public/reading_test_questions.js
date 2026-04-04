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
    const title = document.getElementById('readingTestQuestionsTitle');
    const intro = document.getElementById('readingTestQuestionsIntro');
    const randomTitle = document.getElementById('readingTestQuestionsRandomTitle');
    const randomValue = document.getElementById('readingTestQuestionsRandomValue');
    const feedbackTitle = document.getElementById('readingTestQuestionsFeedbackTitle');
    const feedbackPrefix = document.getElementById('readingTestQuestionsFeedbackPrefix');
    const feedbackLink = document.getElementById('readingTestQuestionsFeedbackLink');
    const incompleteMessage = document.getElementById('readingTestQuestionsIncomplete');
    const resultMessage = document.getElementById('readingTestQuestionsResult');
    const lowScoreMessage = document.getElementById('readingTestQuestionsLowScore');
    const fatalMessage = document.getElementById('readingTestQuestionsFatal');
    const form = document.getElementById('readingTestQuestionsForm');
    const btnCheck = document.getElementById('readingTestQuestionsCheck');
    const btnContinue = document.getElementById('readingTestQuestionsContinue');
    const actions = document.querySelector('.reading-test-questions__actions');

    if (!title
      || !intro
      || !randomTitle
      || !randomValue
      || !feedbackTitle
      || !feedbackPrefix
      || !feedbackLink
      || !incompleteMessage
      || !resultMessage
      || !lowScoreMessage
      || !fatalMessage
      || !form
      || !btnCheck
      || !btnContinue
      || !actions) {
      log.error('Reading-test questions window missing required DOM; script aborted.');
      return;
    }

    let currentLanguage = 'es';
    let translationsLoadedFor = '';
    let developerEmail = 'cibersino@gmail.com';
    let questions = [];
    let answersByQuestionId = {};
    let lastScore = null;
    let fatalKey = '';

    function tr(path, fallback) {
      return tRenderer(path, fallback);
    }

    function mr(path, params, fallback) {
      return msgRenderer(path, params, fallback);
    }

    function formatPercentage(value) {
      const numeric = Number(value);
      const safe = Number.isFinite(numeric) ? numeric : 0;
      try {
        return new Intl.NumberFormat(currentLanguage || 'es', {
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

    function clearTransientMessages() {
      setMessage(incompleteMessage, '', { tone: 'warn', visible: false });
      setMessage(lowScoreMessage, '', { tone: 'warn', visible: false });
      setMessage(fatalMessage, '', { tone: 'error', visible: false });
    }

    function renderStaticCopy() {
      document.title = tr(
        'renderer.reading_test.questions.title',
        'Comprehension questions'
      );
      title.textContent = tr(
        'renderer.reading_test.questions.title',
        'Comprehension questions'
      );
      intro.textContent = tr(
        'renderer.reading_test.questions.intro',
        'Answer the questions if you want to review comprehension before returning to the main flow.'
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
      updateRandomSummary();
      updateResultMessages();
      if (fatalKey) {
        setMessage(
          fatalMessage,
          tr(fatalKey, 'The questions payload is invalid.'),
          { tone: 'error', visible: true }
        );
      }
    }

    function updateRandomSummary() {
      const randomGuessPercentage = questionsCore.computeRandomGuessPercentage(questions);
      randomValue.textContent = mr(
        'renderer.reading_test.questions.random_value',
        { percentage: formatPercentage(randomGuessPercentage) },
        `${formatPercentage(randomGuessPercentage)}%`
      );
    }

    function updateResultMessages() {
      if (!lastScore) {
        setMessage(resultMessage, '', { tone: 'info', visible: false });
        setMessage(lowScoreMessage, '', { tone: 'warn', visible: false });
        return;
      }

      setMessage(
        resultMessage,
        mr(
          'renderer.reading_test.questions.result_summary',
          {
            correct: lastScore.correct,
            total: lastScore.total,
            percentage: formatPercentage(lastScore.percentage),
          },
          `${lastScore.correct} / ${lastScore.total} (${formatPercentage(lastScore.percentage)}%)`
        ),
        { tone: 'info', visible: true }
      );

      if (lastScore.shouldWarnLowScore) {
        setMessage(
          lowScoreMessage,
          mr(
            'renderer.reading_test.questions.low_score_warning',
            {
              threshold: formatPercentage(lastScore.warningThreshold),
              baseline: formatPercentage(lastScore.randomGuessPercentage),
            },
            'Your score is close to or below random expectation. You may have read the questions too hastily.'
          ),
          { tone: 'warn', visible: true }
        );
      } else {
        setMessage(lowScoreMessage, '', { tone: 'warn', visible: false });
      }
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

    function collectSelectedAnswer(questionId) {
      return typeof answersByQuestionId[questionId] === 'string'
        ? answersByQuestionId[questionId]
        : '';
    }

    function renderQuestions() {
      form.innerHTML = '';

      questions.forEach((question, index) => {
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
            answersByQuestionId[question.id] = option.id;
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

    function allQuestionsAnswered() {
      return questions.every((question) => {
        const answer = collectSelectedAnswer(question.id);
        return !!answer;
      });
    }

    async function ensureTranslations(language) {
      const target = (language || '').trim().toLowerCase() || 'es';
      if (translationsLoadedFor === target) return;
      await loadRendererTranslations(target);
      currentLanguage = target;
      translationsLoadedFor = target;
    }

    async function applyTranslations() {
      await ensureTranslations(currentLanguage);
      renderStaticCopy();
      renderQuestions();
    }

    function installPayload(payload) {
      developerEmail = (payload && typeof payload.developerEmail === 'string' && payload.developerEmail.trim())
        ? payload.developerEmail.trim()
        : developerEmail;
      feedbackLink.textContent = developerEmail;
      feedbackLink.href = `mailto:${developerEmail}`;

      const questionsInfo = questionsCore.validateQuestionsPayload({
        questions: Array.isArray(payload && payload.questions) ? payload.questions : [],
      });

      if (!questionsInfo.ok) {
        questions = [];
        answersByQuestionId = {};
        lastScore = null;
        fatalKey = 'renderer.reading_test.questions.fatal_invalid';
        form.innerHTML = '';
        btnCheck.disabled = true;
        updateRandomSummary();
        updateResultMessages();
        setMessage(
          fatalMessage,
          tr(fatalKey, 'The questions payload is invalid.'),
          { tone: 'error', visible: true }
        );
        return;
      }

      fatalKey = '';
      questions = questionsInfo.questions;
      answersByQuestionId = {};
      lastScore = null;
      btnCheck.disabled = false;
      clearTransientMessages();
      updateRandomSummary();
      updateResultMessages();
      renderQuestions();
    }

    btnCheck.addEventListener('click', () => {
      if (fatalKey) return;

      withAnchoredActionsScroll(() => {
        clearTransientMessages();

        if (!allQuestionsAnswered()) {
          lastScore = null;
          updateResultMessages();
          setMessage(
            incompleteMessage,
            tr(
              'renderer.reading_test.questions.incomplete_warning',
              'All questions must be answered before evaluating.'
            ),
            { tone: 'warn', visible: true }
          );
          return;
        }

        lastScore = questionsCore.scoreQuestions(questions, answersByQuestionId);
        updateResultMessages();
      });
    });

    btnContinue.addEventListener('click', () => {
      window.close();
    });

    questionsApi.onInitData(async (payload) => {
      try {
        installPayload(payload);
        await applyTranslations();
      } catch (err) {
        log.error('Reading-test questions init failed:', err);
        setMessage(
          fatalMessage,
          tr(
            'renderer.reading_test.questions.fatal_invalid',
            'The questions payload is invalid.'
          ),
          { tone: 'error', visible: true }
        );
      }
    });

    if (typeof questionsApi.onSettingsChanged === 'function') {
      questionsApi.onSettingsChanged(async (settings) => {
        try {
          const nextLanguage = settings && typeof settings.language === 'string'
            ? settings.language
            : '';
          if (!nextLanguage || nextLanguage === currentLanguage) return;
          currentLanguage = nextLanguage;
          await applyTranslations();
        } catch (err) {
          log.warn('Reading-test questions settings update failed (ignored):', err);
        }
      });
    } else {
      log.warnOnce(
        'reading-test-questions.onSettingsChanged.missing',
        'readingTestQuestionsAPI.onSettingsChanged missing; live language updates disabled.'
      );
    }

    (async () => {
      try {
        const settings = await questionsApi.getSettings();
        const initialLanguage = settings && typeof settings.language === 'string'
          ? settings.language
          : 'es';
        currentLanguage = initialLanguage;
        await applyTranslations();
      } catch (err) {
        log.warn('Reading-test questions initial settings fetch failed (ignored):', err);
        try {
          await applyTranslations();
        } catch (applyErr) {
          log.error('Reading-test questions fallback translation load failed:', applyErr);
        }
      }
    })();
  });
})();

// =============================================================================
// End of public/reading_test_questions.js
// =============================================================================
