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

  function getQuestionGuessProbability(question) {
    const optionCount = Array.isArray(question && question.options)
      ? question.options.length
      : 0;
    return optionCount >= 2 ? (1 / optionCount) : 0;
  }

  function computeRandomGuessScoreDistribution(questions) {
    const safeQuestions = Array.isArray(questions) ? questions : [];
    const total = safeQuestions.length;
    const pmf = new Array(total + 1).fill(0);
    pmf[0] = 1;

    let processed = 0;
    for (const question of safeQuestions) {
      const probabilityCorrect = getQuestionGuessProbability(question);
      const next = new Array(total + 1).fill(0);
      for (let correct = 0; correct <= processed; correct += 1) {
        const probability = pmf[correct];
        if (probability === 0) continue;
        next[correct] += probability * (1 - probabilityCorrect);
        next[correct + 1] += probability * probabilityCorrect;
      }
      for (let correct = 0; correct <= total; correct += 1) {
        pmf[correct] = next[correct];
      }
      processed += 1;
    }

    return {
      total,
      pmf,
    };
  }

  function computeTailProbabilityAtOrAbove(distribution, observedCorrect) {
    const safeDistribution = isPlainObject(distribution) ? distribution : {};
    const pmf = Array.isArray(safeDistribution.pmf) ? safeDistribution.pmf : [];
    if (!pmf.length) {
      return observedCorrect <= 0 ? 1 : 0;
    }

    const total = Number.isInteger(safeDistribution.total)
      ? safeDistribution.total
      : (pmf.length - 1);
    const normalizedObserved = Number.isFinite(observedCorrect)
      ? Math.max(0, Math.min(total, Math.floor(observedCorrect)))
      : 0;

    let tailProbability = 0;
    for (let correct = normalizedObserved; correct <= total; correct += 1) {
      tailProbability += Number.isFinite(pmf[correct]) ? pmf[correct] : 0;
    }
    if (tailProbability <= 0) return 0;
    if (tailProbability >= 1) return 1;
    return tailProbability;
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
    const randomGuessDistribution = computeRandomGuessScoreDistribution(safeQuestions);
    const probabilityAtLeastObserved = computeTailProbabilityAtOrAbove(
      randomGuessDistribution,
      correct
    );

    return {
      correct,
      total,
      percentage,
      randomGuessPercentage,
      randomGuessDistribution,
      probabilityAtLeastObserved,
    };
  }

  return {
    isPlainObject,
    validateQuestionsPayload,
    getQuestionGuessProbability,
    computeRandomGuessPercentage,
    computeRandomGuessScoreDistribution,
    computeTailProbabilityAtOrAbove,
    scoreQuestions,
  };
});

// =============================================================================
// End of public/js/lib/reading_test_questions_core.js
// =============================================================================
