import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSimliSessionConfig,
  canApplySilentReady,
  nextSimliReconnectDelayMs,
  shouldBlockSessionForLocalization,
  shouldReconnectAfterUnhealthyPolls,
  shouldRestartQuestionLocalization,
  SIMLI_MAX_IDLE_TIME_SEC,
  SIMLI_MAX_SESSION_LENGTH_SEC,
} from "../src/lib/simli-session";

describe("simli session helpers", () => {
  it("uses interview-length idle and session limits", () => {
    const config = buildSimliSessionConfig("face-1");
    assert.equal(config.faceId, "face-1");
    assert.equal(config.maxIdleTime, SIMLI_MAX_IDLE_TIME_SEC);
    assert.equal(config.maxSessionLength, SIMLI_MAX_SESSION_LENGTH_SEC);
    assert.ok(config.maxIdleTime > 120);
    assert.ok(config.maxSessionLength >= 3600);
  });

  it("reconnects after consecutive unhealthy video polls", () => {
    assert.equal(shouldReconnectAfterUnhealthyPolls(2), false);
    assert.equal(shouldReconnectAfterUnhealthyPolls(3), true);
  });

  it("does not treat silent as ready after disconnect or error", () => {
    assert.equal(canApplySilentReady("ready"), true);
    assert.equal(canApplySilentReady("speaking"), true);
    assert.equal(canApplySilentReady("listening"), true);
    assert.equal(canApplySilentReady("disconnected"), false);
    assert.equal(canApplySilentReady("error"), false);
    assert.equal(canApplySilentReady("connecting"), false);
    assert.equal(canApplySilentReady("idle"), false);
  });

  it("backs off reconnect delay", () => {
    assert.equal(nextSimliReconnectDelayMs(1), 1000);
    assert.equal(nextSimliReconnectDelayMs(2), 2000);
    assert.equal(nextSimliReconnectDelayMs(3), 4000);
    assert.equal(nextSimliReconnectDelayMs(8), 10000);
  });

  it("keeps a mounted session through localization refetch", () => {
    assert.equal(shouldBlockSessionForLocalization(true, false), true);
    assert.equal(shouldBlockSessionForLocalization(true, true), false);
    assert.equal(shouldBlockSessionForLocalization(false, false, true), true);
    assert.equal(shouldBlockSessionForLocalization(true, true, true), false);
  });

  it("restarts localization only when the language changes", () => {
    assert.equal(shouldRestartQuestionLocalization(false, "en", null), false);
    assert.equal(shouldRestartQuestionLocalization(true, "es", null), true);
    assert.equal(shouldRestartQuestionLocalization(true, "es", "es"), false);
    assert.equal(shouldRestartQuestionLocalization(true, "fr", "es"), true);
  });
});
