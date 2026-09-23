import assert from "node:assert/strict";
import test from "node:test";

import {
  getSessionOverallScore,
  usesQuestionEvaluationScore,
} from "../src/lib/session-score";

test("getSessionOverallScore prefers question-by-question evaluations", () => {
  const insights = {
    questionEvaluations: [{ score: 8 }, { score: 6 }],
    criteriaEvaluations: [{ score: 10 }, { score: 10 }],
  };

  assert.equal(getSessionOverallScore(insights), 7);
  assert.equal(usesQuestionEvaluationScore(insights), true);
});

test("getSessionOverallScore falls back to criteria for legacy sessions", () => {
  const insights = {
    criteriaEvaluations: [{ score: 9 }, { score: 7 }],
  };

  assert.equal(getSessionOverallScore(insights), 8);
  assert.equal(usesQuestionEvaluationScore(insights), false);
});

test("getSessionOverallScore parses numeric strings and ignores invalid values", () => {
  const insights = {
    questionEvaluations: [
      { score: "9.5" },
      { score: "invalid" },
      { score: null },
    ],
    criteriaEvaluations: [{ score: 2 }],
  };

  assert.equal(getSessionOverallScore(insights), 9.5);
  assert.equal(usesQuestionEvaluationScore(insights), true);
});

test("getSessionOverallScore excludes unanswered zero-score questions", () => {
  const insights = {
    questionEvaluations: [
      { score: 8, evaluation: "Strong detailed answer with examples." },
      { score: 7, evaluation: "Good relevant response." },
      { score: 0, evaluation: "No substantive answer provided." },
      { score: 0, evaluation: "Not reached in session." },
    ],
    criteriaEvaluations: [{ score: 5 }],
  };

  assert.equal(getSessionOverallScore(insights), 7.5);
});

test("getSessionOverallScore includes a genuine scored zero in the average", () => {
  const insights = {
    questionEvaluations: [
      { score: 8, evaluation: "Strong answer." },
      { score: 0, evaluation: "Answered but completely incorrect." },
    ],
  };

  assert.equal(getSessionOverallScore(insights), 4);
});

test("getSessionOverallScore returns 0 when every question scored zero", () => {
  const insights = {
    questionEvaluations: [
      { score: 0, evaluation: "No substantive answer provided." },
      { score: 0, evaluation: "No substantive answer provided." },
    ],
  };

  assert.equal(getSessionOverallScore(insights), 0);
});

test("getSessionOverallScore returns 0 for insufficient-data analyses", () => {
  const insights = {
    insufficientData: true,
    questionEvaluations: [],
    criteriaEvaluations: [],
  };

  assert.equal(getSessionOverallScore(insights), 0);
});

test("getSessionOverallScore returns null when no valid scores exist", () => {
  const insights = {
    questionEvaluations: [{ score: null }, { score: "NaN" }],
    criteriaEvaluations: [],
  };

  assert.equal(getSessionOverallScore(insights), null);
  assert.equal(usesQuestionEvaluationScore(insights), false);
});
