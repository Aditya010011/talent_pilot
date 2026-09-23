import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { interviewSimliFaceId, resolveSimliFaceId } from "../src/lib/simli-face";

describe("simli face id", () => {
  it("accepts a non-URL face id", () => {
    assert.equal(resolveSimliFaceId("  abc-123  "), "abc-123");
  });

  it("rejects portrait URLs and empty values", () => {
    assert.equal(resolveSimliFaceId("https://cdn.example/face.png"), undefined);
    assert.equal(resolveSimliFaceId(""), undefined);
    assert.equal(resolveSimliFaceId(null), undefined);
  });

  it("reads camelCase or snake_case from interview payloads", () => {
    assert.equal(interviewSimliFaceId({ simliFaceId: "face-a" }), "face-a");
    assert.equal(interviewSimliFaceId({ simli_face_id: "face-b" }), "face-b");
    assert.equal(interviewSimliFaceId({ avatarImageUrl: "https://cdn.example/p.png" }), undefined);
  });
});
