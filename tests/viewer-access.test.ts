import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TRPCError } from "@trpc/server";
import { assertMinRole } from "../src/server/trpc";

describe("viewer write access guard", () => {
  it("rejects VIEWER role for mutating operations", () => {
    const mutations = ["create", "update", "delete", "rescan", "sendEmail"];
    for (const mutation of mutations) {
      assert.throws(
        () => assertMinRole("VIEWER", "EDITOR"),
        (error: unknown) => {
          if (!(error instanceof TRPCError)) return false;
          assert.equal(error.code, "FORBIDDEN");
          assert.match(error.message, /at least EDITOR permission/i);
          return true;
        },
        `${mutation} should reject VIEWER`,
      );
    }
  });
});
