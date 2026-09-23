import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coverageToRadarScore,
  mergeCvAssessmentRubrics,
  mergeJdAlignmentProfile,
  normalizeCvCriteria,
} from "../src/lib/cv-criteria";

describe("mergeCvAssessmentRubrics", () => {
  it("keeps all configured criteria and fills missing with 0", () => {
    const configured = normalizeCvCriteria([
      { name: "SAP Skills", description: "SAP evidence" },
      { name: "Excel Fluency", description: "Excel evidence" },
      { name: "Close Process", description: "Month-end close" },
      { name: "Audit Support", description: "Audit work" },
      { name: "IFRS Knowledge", description: "IFRS standards" },
    ]);
    const scored = [
      { subject: "SAP Skills", score: 8, description: "Strong SAP" },
      { subject: "Excel Fluency", score: 6, description: "Some Excel" },
      { subject: "Close Process", score: 4, description: "Partial close" },
    ];
    const merged = mergeCvAssessmentRubrics(configured, scored);
    assert.equal(merged.length, 5);
    assert.equal(merged[0].score, 8);
    assert.equal(merged[3].subject, "Audit Support");
    assert.equal(merged[3].score, 0);
    assert.equal(merged[4].score, 0);
    assert.equal(merged[4].description, "IFRS standards");
  });

  it("matches configured assessment criteria despite punctuation/casing differences", () => {
    const configured = normalizeCvCriteria([
      { name: "SAP Skills", description: "Hands-on SAP ERP experience" },
      { name: "Excel Fluency", description: "Advanced spreadsheets and reporting" },
    ]);
    const scored = [
      { subject: "sap_skills", score: 8, description: "Configured SAP ERP modules" },
      { subject: "EXCEL-FLUENCY", score: 7, description: "Built advanced reports" },
    ];

    const merged = mergeCvAssessmentRubrics(configured, scored);

    assert.equal(merged[0].score, 8);
    assert.equal(merged[1].score, 7);
  });
});

describe("mergeJdAlignmentProfile", () => {
  it("keeps all configured JD criteria and fills missing with 0 / Missing", () => {
    const configured = normalizeCvCriteria([
      { name: "B2B Sales", description: "Enterprise sales" },
      { name: "CRM Tools", description: "Salesforce experience" },
      { name: "Quota History", description: "Quota attainment" },
      { name: "Pipeline Mgmt", description: "Pipeline ownership" },
      { name: "Travel Ready", description: "Willingness to travel" },
    ]);
    const scored = [
      {
        subject: "B2B Sales",
        score: 9,
        fullRequirement: "B2B sales background",
        description: "Enterprise sales",
        coverage: "Yes",
        evidence: "Led enterprise deals",
      },
      {
        subject: "CRM Tools",
        score: 6,
        fullRequirement: "CRM proficiency",
        description: "Salesforce experience",
        coverage: "Partial",
        evidence: "Mentions Salesforce once",
      },
      {
        subject: "Quota History",
        score: 0,
        fullRequirement: "Quota attainment",
        description: "Quota attainment",
        coverage: "No",
        evidence: "No quota evidence",
      },
    ];
    const merged = mergeJdAlignmentProfile(configured, scored);
    assert.equal(merged.length, 5);
    assert.equal(merged[0].score, 9);
    assert.equal(merged[3].subject, "Pipeline Mgmt");
    assert.equal(merged[3].score, 0);
    assert.equal(merged[3].coverage, "Missing");
    assert.equal(merged[4].score, 0);
  });

  it("preserves evidence when configured names differ from LLM row labels", () => {
    const configured = normalizeCvCriteria([
      { name: "CRM Tools", description: "Experience with Salesforce or similar CRM platforms" },
      { name: "Travel Ready", description: "Open to regional travel for client meetings" },
      { name: "Quota History", description: "Track record of meeting sales quota" },
    ]);
    const scored = [
      {
        subject: "CRM",
        score: 6,
        fullRequirement: "Experience with Salesforce or similar CRM platforms",
        description: "CRM platform background",
        coverage: "Partial",
        evidence: "Mentions Salesforce administration and pipeline updates.",
      },
      {
        subject: "Travel",
        score: 9,
        fullRequirement: "Open to regional travel for client meetings",
        description: "Travel expectations",
        coverage: "Yes",
        evidence: "States willingness to travel across APAC for onsite meetings.",
      },
      {
        subject: "Quota Attainment",
        score: 0,
        fullRequirement: "Track record of meeting sales quota",
        description: "Quota history",
        coverage: "No",
        evidence: "No quota attainment figures listed.",
      },
    ];

    const merged = mergeJdAlignmentProfile(configured, scored);

    assert.equal(merged[0].coverage, "Partial");
    assert.equal(merged[0].evidence, "Mentions Salesforce administration and pipeline updates.");
    assert.equal(merged[1].coverage, "Yes");
    assert.equal(merged[1].evidence, "States willingness to travel across APAC for onsite meetings.");
    assert.equal(merged[2].coverage, "No");
    assert.equal(merged[2].evidence, "No quota attainment figures listed.");
  });

  it("falls back to positional rows when counts align but labels do not", () => {
    const configured = normalizeCvCriteria([
      { name: "Stakeholder Mgmt", description: "Manage senior business stakeholders" },
      { name: "Presentation", description: "Present findings to executives" },
    ]);
    const scored = [
      {
        subject: "Criterion A",
        score: 9,
        fullRequirement: "Senior stakeholder management",
        description: "",
        coverage: "Yes",
        evidence: "Worked with CFO and finance directors weekly.",
      },
      {
        subject: "Criterion B",
        score: 6,
        fullRequirement: "Executive presentations",
        description: "",
        coverage: "Partial",
        evidence: "Presented quarterly updates to leadership.",
      },
    ];

    const merged = mergeJdAlignmentProfile(configured, scored);

    assert.equal(merged[0].evidence, "Worked with CFO and finance directors weekly.");
    assert.equal(merged[0].coverage, "Yes");
    assert.equal(merged[1].evidence, "Presented quarterly updates to leadership.");
    assert.equal(merged[1].coverage, "Partial");
  });
});

describe("coverageToRadarScore", () => {
  it("maps Yes/Partial/No to scores with missing as 0", () => {
    assert.equal(coverageToRadarScore("Yes"), 9);
    assert.equal(coverageToRadarScore("Partial"), 6);
    assert.equal(coverageToRadarScore("No"), 0);
    assert.equal(coverageToRadarScore("Missing"), 0);
    assert.equal(coverageToRadarScore(undefined), 0);
  });
});
