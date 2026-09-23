import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyDurationCreditMultiplier,
  costFromRate,
  DEFAULT_CREDIT_RATES,
  getInterviewTypeLabel,
  getPregenerateInitialCreditCost,
  getSessionCreditCost,
  mergeCreditRates,
} from "../src/lib/interview-credits";

describe("interview credit pricing", () => {
  it("defaults to 5 credits / 15 minutes with empty or missing config", () => {
    const empty = mergeCreditRates([]);
    assert.deepEqual(empty.realtime_avatar, { credits: 5, minutes: 15 });
    assert.deepEqual(empty.voice_only, { credits: 5, minutes: 15 });
    assert.deepEqual(empty.non_interactive, { credits: 5, minutes: 15 });
    assert.equal(getSessionCreditCost({
      voiceEnabled: true,
      avatarMode: "simli",
      timeLimitMinutes: 15,
    }), 5);
    assert.equal(getSessionCreditCost({
      voiceEnabled: true,
      avatarMode: "simli",
      timeLimitMinutes: 15,
    }, empty), 5);
    assert.equal(getPregenerateInitialCreditCost(15), 5);
    assert.equal(getPregenerateInitialCreditCost(null), 5);
  });

  it("ceils duration into rate blocks (16 min at 5/15 = 10)", () => {
    assert.equal(
      getSessionCreditCost({
        voiceEnabled: true,
        avatarMode: "simli",
        timeLimitMinutes: 16,
      }),
      10,
    );
    assert.equal(applyDurationCreditMultiplier(5, 16), 10);
    assert.equal(applyDurationCreditMultiplier(1, 20), 10);
  });

  it("charges voice-only at the same default 5/15 rate", () => {
    assert.equal(
      getSessionCreditCost({
        voiceEnabled: true,
        avatarMode: "none",
        timeLimitMinutes: 10,
      }),
      5,
    );
    assert.equal(
      getSessionCreditCost({
        voiceEnabled: true,
        avatarMode: "none",
        timeLimitMinutes: 16,
      }),
      10,
    );
  });

  it("uses configured credits/minutes per type", () => {
    const rates = mergeCreditRates([
      { interviewType: "realtime_avatar", credits: 6, minutes: 10 },
      { interviewType: "voice_only", credits: 4, minutes: 20 },
      { interviewType: "non_interactive", credits: 8, minutes: 15 },
    ]);
    assert.equal(
      getSessionCreditCost({
        voiceEnabled: true,
        avatarMode: "simli",
        timeLimitMinutes: 16,
      }, rates),
      12,
    );
    assert.equal(
      getSessionCreditCost({
        voiceEnabled: true,
        avatarMode: "none",
        timeLimitMinutes: 21,
      }, rates),
      8,
    );
    assert.equal(getPregenerateInitialCreditCost(16, rates), 16);
  });

  it("does not charge sessions for non-interactive interviews", () => {
    assert.equal(
      getSessionCreditCost({
        voiceEnabled: true,
        avatarMode: "simli",
        is_voice_only: true,
        timeLimitMinutes: 20,
      }),
      0,
    );
  });

  it("keeps chat-only free unless a Chat rate with credits is configured", () => {
    assert.equal(
      getSessionCreditCost({
        voiceEnabled: false,
        avatarMode: "none",
        timeLimitMinutes: 30,
      }),
      0,
    );
    const paidChat = mergeCreditRates([
      { interviewType: "chat", credits: 5, minutes: 15 },
    ]);
    assert.equal(
      getSessionCreditCost({
        voiceEnabled: false,
        avatarMode: "none",
        timeLimitMinutes: 16,
      }, paidChat),
      10,
    );
  });

  it("does not duration-scale a free base of 0", () => {
    assert.equal(applyDurationCreditMultiplier(0, 20), 0);
  });

  it("costFromRate falls back to 5/15 for invalid minutes", () => {
    assert.equal(costFromRate({ credits: 5, minutes: 0 }, 16), 10);
    assert.equal(DEFAULT_CREDIT_RATES.chat.credits, 0);
  });

  it("hides Chat and maps Video/simli to Real Time, matching credit types", () => {
    assert.equal(
      getInterviewTypeLabel({ voiceEnabled: false, avatarMode: "none" }),
      null,
    );
    assert.equal(
      getInterviewTypeLabel({
        voiceEnabled: true,
        avatarMode: "simli",
        videoEnabled: true,
      }),
      "Real Time",
    );
    assert.equal(
      getInterviewTypeLabel({
        voiceEnabled: true,
        avatarMode: "none",
        videoEnabled: true,
      }),
      "Voice Only",
    );
    assert.equal(
      getInterviewTypeLabel({
        voiceEnabled: true,
        avatarMode: "simli",
        is_voice_only: true,
      }),
      "Non-Interactive",
    );
  });
});
