import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isInterviewProductEnabled,
  isCoachingProductEnabled,
  productHomePath,
  settingsOrganizationsPath,
  newOrgPath,
  orgMembersPath,
  remapInterviewPathToCoaching,
  resolveViewerLandingOrgId,
  interviewChromeRedirect,
  coachingChromeRedirect,
} from "../src/lib/product-access";

describe("product-access", () => {
  it("keeps Interview on when interviewEnabled is missing (existing orgs)", () => {
    assert.equal(isInterviewProductEnabled({}), true);
    assert.equal(isInterviewProductEnabled({ interviewEnabled: true }), true);
    assert.equal(isInterviewProductEnabled({ interviewEnabled: null }), true);
    assert.equal(isInterviewProductEnabled(undefined), true);
  });

  it("treats interviewEnabled=false as coaching-only", () => {
    assert.equal(isInterviewProductEnabled({ interviewEnabled: false }), false);
    assert.equal(isCoachingProductEnabled({ coachingEnabled: true }), true);
    assert.equal(
      productHomePath({ interviewEnabled: false, coachingEnabled: true }),
      "/coaching/dashboard",
    );
    assert.equal(
      productHomePath({ interviewEnabled: true, coachingEnabled: true }),
      "/dashboard",
    );
  });

  it("routes coaching chrome to coaching settings paths", () => {
    assert.equal(
      settingsOrganizationsPath({ coachingChrome: true }),
      "/coaching/settings/organizations",
    );
    assert.equal(newOrgPath({ coachingChrome: true }), "/org/new?platform=coaching");
    assert.equal(
      orgMembersPath("abc", { coachingChrome: true }),
      "/coaching/org/settings/members?organizationId=abc",
    );
    assert.equal(settingsOrganizationsPath({}), "/settings/organizations");
    assert.equal(newOrgPath({ interviewEnabled: false }), "/org/new?platform=coaching");
  });

  it("remaps interview settings URLs into coaching chrome", () => {
    assert.equal(
      remapInterviewPathToCoaching("/org/settings/members", "?organizationId=x"),
      "/coaching/org/settings/members?organizationId=x",
    );
    assert.equal(
      remapInterviewPathToCoaching("/settings/organizations"),
      "/coaching/settings/organizations",
    );
    assert.equal(remapInterviewPathToCoaching("/interviews"), "/coaching/dashboard");
    assert.equal(remapInterviewPathToCoaching("/dashboard"), "/coaching/dashboard");
  });

  it("picks an interview-enabled org for VIEWER landing", () => {
    assert.equal(
      resolveViewerLandingOrgId([
        { id: "org-coaching-only", interviewEnabled: false, coachingEnabled: true },
        { id: "org-interview-enabled", interviewEnabled: true, coachingEnabled: false },
      ]),
      "org-interview-enabled",
    );
  });

  it("falls back to coaching-enabled org when interview disabled", () => {
    assert.equal(
      resolveViewerLandingOrgId([
        { id: "org-coaching-only", interviewEnabled: false, coachingEnabled: true },
      ]),
      "org-coaching-only",
    );
  });

  it("falls back to first org when both interview/coaching are missing", () => {
    assert.equal(
      resolveViewerLandingOrgId([{ id: "org-1" } as any, { id: "org-2" } as any]),
      "org-1",
    );
  });

  it("remaps coaching-only Interview chrome to /coaching/dashboard, never /login", () => {
    const dest = interviewChromeRedirect(
      { interviewEnabled: false, coachingEnabled: true },
      "/dashboard",
    );
    assert.equal(dest, "/coaching/dashboard");
    assert.notEqual(dest, "/dashboard");
    assert.notEqual(dest, "/login");
  });

  it("stays on Interview chrome when both products are off", () => {
    assert.equal(
      interviewChromeRedirect(
        { interviewEnabled: false, coachingEnabled: false },
        "/dashboard",
      ),
      null,
    );
  });

  it("sends Coaching chrome to /dashboard when coaching is off, never /login", () => {
    assert.equal(
      coachingChromeRedirect(
        { interviewEnabled: true, coachingEnabled: false },
        "/coaching/dashboard",
      ),
      "/dashboard",
    );
    assert.equal(
      coachingChromeRedirect(
        { interviewEnabled: true, coachingEnabled: false },
        "/dashboard",
      ),
      null,
    );
  });
});
