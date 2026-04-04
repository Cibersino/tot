'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared reading-test questions core.
// Responsibilities:
// - Validate optional readingTest.questions payloads from snapshot JSON files.
// - Return a sanitized questions structure suitable for UI rendering and scoring.
// - Compute aggregate scores and random-guess baseline metrics.
// - Support both browser-script and CommonJS consumers.

(function initReadingTestQuestionsCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.ReadingTestQuestionsCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizeNonEmptyString(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    return text || '';
  }

  function sanitizeOption(rawOption, seenOptionIds) {
    if (!isPlainObject(rawOption)) {
      return { ok: false, code: 'OPTION_INVALID_SHAPE' };
    }

    const id = normalizeNonEmptyString(rawOption.id);
    const text = normalizeNonEmptyString(rawOption.text);

    if (!id) return { ok: false, code: 'OPTION_ID_INVALID' };
    if (!text) return { ok: false, code: 'OPTION_TEXT_INVALID' };
    if (seenOptionIds.has(id)) {
      return { ok: false, code: 'OPTION_ID_DUPLICATE' };
    }

    seenOptionIds.add(id);
    return {
      ok: true,
      option: { id, text },
    };
  }

  function sanitizeQuestion(rawQuestion, seenQuestionIds) {
    if (!isPlainObject(rawQuestion)) {
      return { ok: false, code: 'QUESTION_INVALID_SHAPE' };
    }

    const id = normalizeNonEmptyString(rawQuestion.id);
    const prompt = normalizeNonEmptyString(rawQuestion.prompt);
    const correctOptionId = normalizeNonEmptyString(rawQuestion.correctOptionId);
    const rawOptions = Array.isArray(rawQuestion.options) ? rawQuestion.options : null;

    if (!id) return { ok: false, code: 'QUESTION_ID_INVALID' };
    if (seenQuestionIds.has(id)) return { ok: false, code: 'QUESTION_ID_DUPLICATE' };
    if (!prompt) return { ok: false, code: 'QUESTION_PROMPT_INVALID' };
    if (!correctOptionId) return { ok: false, code: 'QUESTION_CORRECT_OPTION_INVALID' };
    if (!rawOptions || rawOptions.length < 2) return { ok: false, code: 'QUESTION_OPTIONS_INVALID' };

    const seenOptionIds = new Set();
    const options = [];
    for (const rawOption of rawOptions) {
      const optionInfo = sanitizeOption(rawOption, seenOptionIds);
      if (!optionInfo.ok) return optionInfo;
      options.push(optionInfo.option);
    }

    if (!options.some((option) => option.id === correctOptionId)) {
      return { ok: false, code: 'QUESTION_CORRECT_OPTION_MISSING' };
    }

    seenQuestionIds.add(id);
    return {
      ok: true,
      question: {
        id,
        prompt,
        correctOptionId,
        options,
      },
    };
  }

  function validateQuestionsPayload(rawReadingTest) {
    if (!isPlainObject(rawReadingTest)) {
      return { ok: false, code: 'READING_TEST_INVALID_SHAPE' };
    }

    const rawQuestions = Array.isArray(rawReadingTest.questions)
      ? rawReadingTest.questions
      : null;
    if (!rawQuestions || rawQuestions.length === 0) {
      return { ok: false, code: 'QUESTIONS_INVALID' };
    }

    const seenQuestionIds = new Set();
    const questions = [];
    for (const rawQuestion of rawQuestions) {
      const questionInfo = sanitizeQuestion(rawQuestion, seenQuestionIds);
      if (!questionInfo.ok) return questionInfo;
      questions.push(questionInfo.question);
    }

    return {
      ok: true,
      questions,
    };
  }

  function computeRandomGuessPercentage(questions) {
    const safeQuestions = Array.isArray(questions) ? questions : [];
    if (!safeQuestions.length) return 0;

    let expectedCorrectRandom = 0;
    for (const question of safeQuestions) {
      const optionCount = Array.isArray(question && question.options)
        ? question.options.length
        : 0;
      if (optionCount >= 2) {
        expectedCorrectRandom += (1 / optionCount);
      }
    }

    return (expectedCorrectRandom / safeQuestions.length) * 100;
  }

  function scoreQuestions(questions, answersByQuestionId) {
    const safeQuestions = Array.isArray(questions) ? questions : [];
    const safeAnswers = isPlainObject(answersByQuestionId) ? answersByQuestionId : {};
    const total = safeQuestions.length;
    let correct = 0;

    for (const question of safeQuestions) {
      if (!question || typeof question.id !== 'string') continue;
      const answer = normalizeNonEmptyString(safeAnswers[question.id]);
      if (answer && answer === question.correctOptionId) {
        correct += 1;
      }
    }

    const percentage = total > 0 ? ((correct / total) * 100) : 0;
    const randomGuessPercentage = computeRandomGuessPercentage(safeQuestions);
    const warningThreshold = randomGuessPercentage * (5 / 3);

    return {
      correct,
      total,
      percentage,
      randomGuessPercentage,
      warningThreshold,
      shouldWarnLowScore: total > 0 && percentage < warningThreshold,
    };
  }

  return {
    isPlainObject,
    validateQuestionsPayload,
    computeRandomGuessPercentage,
    scoreQuestions,
  };
});

// =============================================================================
// End of public/js/lib/reading_test_questions_core.js
// =============================================================================
