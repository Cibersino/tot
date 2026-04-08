'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeRandomGuessPercentage,
  computeRandomGuessScoreDistribution,
  computeTailProbabilityAtOrAbove,
  scoreQuestions,
} = require('../../../public/js/lib/reading_test_questions_core');

function createQuestion(id, optionCount, correctOptionId = 'a') {
  const options = [];
  for (let index = 0; index < optionCount; index += 1) {
    const optionId = String.fromCharCode(97 + index);
    options.push({
      id: optionId,
      text: `Option ${optionId}`,
    });
  }
  return {
    id,
    prompt: `Question ${id}`,
    correctOptionId,
    options,
  };
}

test('computeRandomGuessScoreDistribution returns the exact PMF for mixed option counts', () => {
  const questions = [
    createQuestion('q1', 2),
    createQuestion('q2', 4),
  ];

  const distribution = computeRandomGuessScoreDistribution(questions);

  assert.equal(distribution.total, 2);
  assert.equal(distribution.pmf.length, 3);
  assert.ok(Math.abs(distribution.pmf[0] - 0.375) < 1e-12);
  assert.ok(Math.abs(distribution.pmf[1] - 0.5) < 1e-12);
  assert.ok(Math.abs(distribution.pmf[2] - 0.125) < 1e-12);
});

test('computeTailProbabilityAtOrAbove sums the exact random-guess tail probability', () => {
  const questions = [
    createQuestion('q1', 2),
    createQuestion('q2', 4),
  ];
  const distribution = computeRandomGuessScoreDistribution(questions);

  assert.equal(computeTailProbabilityAtOrAbove(distribution, 0), 1);
  assert.ok(Math.abs(computeTailProbabilityAtOrAbove(distribution, 1) - 0.625) < 1e-12);
  assert.ok(Math.abs(computeTailProbabilityAtOrAbove(distribution, 2) - 0.125) < 1e-12);
});

test('scoreQuestions returns observed score, mean baseline, and exact tail chance', () => {
  const questions = [
    createQuestion('q1', 2, 'a'),
    createQuestion('q2', 3, 'b'),
    createQuestion('q3', 4, 'c'),
  ];
  const answers = {
    q1: 'a',
    q2: 'b',
    q3: 'd',
  };

  const score = scoreQuestions(questions, answers);

  assert.equal(score.correct, 2);
  assert.equal(score.total, 3);
  assert.ok(Math.abs(score.percentage - ((2 / 3) * 100)) < 1e-12);
  assert.ok(Math.abs(score.randomGuessPercentage - computeRandomGuessPercentage(questions)) < 1e-12);
  assert.ok(Math.abs(score.probabilityAtLeastObserved - 0.2916666666666667) < 1e-12);
});
