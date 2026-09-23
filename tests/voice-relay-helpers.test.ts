import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClarificationRestateSpeech,
  isCandidateClarificationUtterance,
  isSubstantiveInterviewAnswer,
  isUserEndRequest,
  isUserSkipRequest,
  responseInvitesUserReply,
} from "../server/voice-relay-helpers";

test("explicit interview end requests are not treated as skip-to-next requests", () => {
  const text = "No, I cannot. So we end the interview now.";

  assert.equal(isUserEndRequest(text), true);
  assert.equal(isUserSkipRequest(text), false);
});

test("explicit next-question requests still count as skip intent", () => {
  assert.equal(isUserSkipRequest("Let's move on to the next question."), true);
  assert.equal(isUserEndRequest("Let's move on to the next question."), false);
});

test("indirect English invitations to continue keep the conversational floor open", () => {
  assert.equal(
    responseInvitesUserReply(
      "Thank you for sharing. If you have any other experiences or examples that showcase your communication skills, I would appreciate hearing about them.",
      false,
    ),
    true,
  );
});

test("Chinese invitations to continue are also detected", () => {
  assert.equal(
    responseInvitesUserReply("如果你愿意，也可以继续分享更多相关的例子。", true),
    true,
  );
});

test("short wrap-up acknowledgements do not look like reply invitations", () => {
  assert.equal(
    responseInvitesUserReply("Thank you for sharing. Let's move on to the next question.", false),
    false,
  );
});

test("repeat and clarify requests are candidate clarifications", () => {
  const clarifications = [
    "can you repeat the question?",
    "can you please repeat?",
    "please repeat",
    "repeat please",
    "say that again",
    "say again",
    "again?",
    "what was the question?",
    "what was that?",
    "what do you mean?",
    "I didn't catch that",
    "I missed that",
    "can you clarify?",
    "I need you to repeat",
    "read the question again",
    "can you ask that again",
    "repeat the last question",
    "再说一遍",
    "什么意思",
  ];
  for (const text of clarifications) {
    assert.equal(
      isCandidateClarificationUtterance(text),
      true,
      `expected clarification: ${text}`,
    );
  }
});

test("substantive answers are not treated as clarifications", () => {
  const answers = [
    "In my last role I led a team of five engineers building a payments API.",
    "I would use a hash map to store frequencies and then iterate once.",
    "Yes I have experience with React and TypeScript for about three years.",
    "I would repeat the process every sprint with stakeholders involved closely.",
  ];
  for (const text of answers) {
    assert.equal(isCandidateClarificationUtterance(text), false, text);
    assert.equal(isSubstantiveInterviewAnswer(text), true, text);
  }
});

test("skip/next requests are not clarifications", () => {
  assert.equal(isCandidateClarificationUtterance("please skip this question"), false);
  assert.equal(isCandidateClarificationUtterance("next question"), false);
});

test("short non-answers are not substantive and do not force-advance", () => {
  assert.equal(isSubstantiveInterviewAnswer("yes"), false);
  assert.equal(isSubstantiveInterviewAnswer("okay"), false);
  assert.equal(isSubstantiveInterviewAnswer("repeat please"), false);
});

test("clarification restate speech always includes the bank question", () => {
  const question = { text: "Tell me about a challenging project you led." };
  assert.equal(
    buildClarificationRestateSpeech(question, "en", false),
    "Sure. Tell me about a challenging project you led.",
  );
  assert.equal(
    buildClarificationRestateSpeech(question, "en", true),
    "Tell me about a challenging project you led.",
  );
  assert.equal(
    buildClarificationRestateSpeech(question, "zh", false),
    "好的。Tell me about a challenging project you led.",
  );
  assert.equal(
    buildClarificationRestateSpeech(question, "hi", false),
    "Tell me about a challenging project you led.",
  );
  assert.equal(
    buildClarificationRestateSpeech(question, "th", false),
    "Tell me about a challenging project you led.",
  );
});
