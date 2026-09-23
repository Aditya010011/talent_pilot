import { createLogger } from "@/lib/logger";
import fs from "fs/promises";
import path from "path";

const log = createLogger("resume-scoring");
const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "resume-scoring.log");

export type CvAnalysisLog = {
  trustScore?: number;
  trustReasoning?: string;
  overallScore?: number;
  overallSummary?: string;
  estimatedSeniority?: string;
  verdict?: string;
  matchingMatrix?: {
    requirement?: string;
    evidence?: string;
    coverage?: string;
  }[];
  scoreBreakdown?: {
    factor?: string;
    points?: number;
    reason?: string;
  }[];
  areasToValidate?: string[];
};

export type ResumeScoringLogEntry = {
  interviewId?: string | null;
  interviewTitle?: string | null;
  fileName: string;
  resumeTextLength: number;
  resumePreview: string;
  jobDescriptionPreview?: string | null;
  assessmentCriteria?: unknown;
  parsedCandidate?: {
    name?: string | null;
    email?: string | null;
    workExperience?: string | null;
    education?: string | null;
  };
  cvAnalysis?: CvAnalysisLog | null;
  rawResponse?: string;
  parseError?: string;
};

function truncate(text: string, max = 1200): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}… [truncated ${text.length - max} chars]`;
}

function formatEntry(entry: ResumeScoringLogEntry): string {
  const lines: string[] = [];
  const ts = new Date().toISOString();

  lines.push(`RESUME SCORING LOG — ${ts}`);
  lines.push("-".repeat(72));
  lines.push(`File: ${entry.fileName}`);
  if (entry.interviewTitle || entry.interviewId) {
    lines.push(
      `Interview: ${entry.interviewTitle ?? "Unknown"} (${entry.interviewId ?? "n/a"})`,
    );
  }
  if (entry.parsedCandidate?.name || entry.parsedCandidate?.email) {
    lines.push(
      `Candidate: ${entry.parsedCandidate.name ?? "Unknown"} <${entry.parsedCandidate.email ?? "n/a"}>`,
    );
  }
  if (entry.parsedCandidate?.workExperience || entry.parsedCandidate?.education) {
    lines.push(
      `Profile: ${entry.parsedCandidate.workExperience ?? "?"} experience | ${entry.parsedCandidate.education ?? "?"} education`,
    );
  }
  lines.push(`Resume text length: ${entry.resumeTextLength} chars`);
  lines.push("");

  if (entry.jobDescriptionPreview) {
    lines.push("JOB DESCRIPTION (scoring basis):");
    lines.push(truncate(entry.jobDescriptionPreview, 2000));
    lines.push("");
  }

  if (entry.assessmentCriteria) {
    lines.push("ASSESSMENT CRITERIA:");
    lines.push(truncate(JSON.stringify(entry.assessmentCriteria, null, 2), 1500));
    lines.push("");
  }

  lines.push("RESUME EXTRACT (first ~1200 chars):");
  lines.push(truncate(entry.resumePreview, 1200));
  lines.push("");

  const cv = entry.cvAnalysis;
  if (cv) {
    lines.push("=== LLM SCORING OUTPUT ===");
    lines.push(`Overall score: ${cv.overallScore ?? "n/a"}/100`);
    lines.push(`Verdict: ${cv.verdict ?? "n/a"}`);
    lines.push(`Estimated seniority: ${cv.estimatedSeniority ?? "n/a"}`);
    lines.push(`Trust score: ${cv.trustScore ?? "n/a"}/100`);
    if (cv.trustReasoning) {
      lines.push(`Trust reasoning: ${cv.trustReasoning}`);
    }
    if (cv.overallSummary) {
      lines.push("");
      lines.push("Overall summary:");
      lines.push(cv.overallSummary);
    }

    if (cv.scoreBreakdown?.length) {
      lines.push("");
      lines.push("Score breakdown (how the LLM arrived at the score):");
      for (const row of cv.scoreBreakdown) {
        const pts =
          typeof row.points === "number"
            ? row.points >= 0
              ? `+${row.points}`
              : `${row.points}`
            : "?";
        lines.push(`  • [${pts}] ${row.factor ?? "Factor"}: ${row.reason ?? ""}`);
      }
    }

    if (cv.matchingMatrix?.length) {
      lines.push("");
      lines.push("Matching matrix (requirement vs CV evidence):");
      for (const row of cv.matchingMatrix) {
        lines.push(
          `  • ${row.requirement ?? "?"} → ${row.coverage ?? "?"} — ${row.evidence ?? "no evidence cited"}`,
        );
      }
    }

    if (cv.areasToValidate?.length) {
      lines.push("");
      lines.push("Areas to validate in interview:");
      for (const item of cv.areasToValidate) {
        lines.push(`  • ${item}`);
      }
    }
  } else if (entry.parseError) {
    lines.push("=== PARSE ERROR ===");
    lines.push(entry.parseError);
    if (entry.rawResponse) {
      lines.push("");
      lines.push("Raw LLM response:");
      lines.push(truncate(entry.rawResponse, 4000));
    }
  }

  return lines.join("\n");
}

export async function appendResumeScoringLog(
  entry: ResumeScoringLogEntry,
): Promise<void> {
  const block = formatEntry(entry);

  log.info(
    `CV scored: ${entry.parsedCandidate?.name ?? entry.fileName} → ${entry.cvAnalysis?.overallScore ?? "?"} (${entry.cvAnalysis?.verdict ?? "no verdict"})`,
  );
  log.info(`Full reasoning written to logs/resume-scoring.log`);

  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    await fs.appendFile(LOG_FILE, `${block}\n${"=".repeat(80)}\n\n`, "utf8");
  } catch (err) {
    log.error("Failed to write resume-scoring.log:", err);
    log.info(block);
  }
}
