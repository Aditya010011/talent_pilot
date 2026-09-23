import assert from "node:assert/strict";
import test from "node:test";

import {
  formatSessionClock,
  normalizeQaTimeline,
  resolveDisplayDurationMinutes,
  sessionSpanCrossesLocalDay,
} from "@/lib/interview-qa-timeline";

test("normalizeQaTimeline clamps spillover responses that predate the spoken question", () => {
  const sessionStart = Date.parse("2026-08-23T06:00:00.000Z");
  const pairs = normalizeQaTimeline(
    [
      {
        question: {
          content: "Solve two-sum",
          type: "CODING",
          timestamp: "2026-08-23T06:04:00.000Z",
        },
        responses: [],
      },
      {
        question: {
          content: "Tell me about a hard bug",
          type: "OPEN_ENDED",
          timestamp: "2026-08-23T06:06:31.000Z",
        },
        responses: [
          {
            role: "USER",
            content: "I fixed a race in the queue",
            // Listening turn started during the coding segment
            timestamp: "2026-08-23T06:04:39.000Z",
          },
        ],
      },
    ],
    sessionStart,
  );

  assert.equal(pairs[0]!.question!.timestamp, "2026-08-23T06:04:00.000Z");
  assert.equal(pairs[1]!.question!.timestamp, "2026-08-23T06:06:31.000Z");
  assert.equal(pairs[1]!.responses[0]!.timestamp, "2026-08-23T06:06:31.000Z");
  assert.equal(pairs[1]!.responses[0]!._timestampClamped, true);
});

test("normalizeQaTimeline keeps coding→spoken question starts monotonic", () => {
  const sessionStart = Date.parse("2026-08-23T06:00:00.000Z");
  const pairs = normalizeQaTimeline(
    [
      {
        question: {
          content: "Coding",
          type: "CODING",
          timestamp: "2026-08-23T06:05:00.000Z",
        },
        responses: [],
      },
      {
        question: {
          content: "Behavioral",
          type: "OPEN_ENDED",
          // Missing/early assistant stamp
          timestamp: "2026-08-23T06:03:00.000Z",
        },
        responses: [
          {
            role: "USER",
            content: "answer",
            timestamp: "2026-08-23T06:05:30.000Z",
          },
        ],
      },
    ],
    sessionStart,
  );

  assert.equal(pairs[1]!.question!.timestamp, "2026-08-23T06:05:00.000Z");
  assert.equal(pairs[1]!.responses[0]!.timestamp, "2026-08-23T06:05:30.000Z");
});

test("session snapshot helpers handle overnight spans", () => {
  const start = "2026-08-22T09:14:00.000Z"; // 5:14pm HKT
  const end = "2026-08-23T07:55:00.000Z"; // 3:55pm HKT next day
  assert.equal(sessionSpanCrossesLocalDay(start, end), true);
  assert.match(formatSessionClock(start, { includeDate: true }), /Aug/);
  assert.equal(resolveDisplayDurationMinutes(81600, start, end), 1360);
  assert.equal(resolveDisplayDurationMinutes(null, end, start), null);
});
