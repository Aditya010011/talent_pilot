import type { LLMMessage } from "../types";
import { durationQuestionCountInstruction } from "@/lib/interview-duration";

/** Approximate spoken length budgets so avatar clips fit under ~13 seconds. */
const VOICE_ONLY_SPEECH_BUDGET = `
VOICE-ONLY / NON-INTERACTIVE MODE (HARD CONSTRAINT):
Every question "text" is spoken aloud as a video clip and MUST fit under 13 seconds of speech in ALL languages.
Approximate budgets (apply to "text" only — never to description / starterCode / options):
- English (and other space-delimited languages): MAX 25–30 words in "text"
- Chinese / Cantonese / CJK: MAX 35–45 characters in "text"
Keep wording concise and speakable. No multi-sentence preamble. One clear spoken question line.
For CODING questions in this mode: "text" MUST be a short spoken prompt only (e.g. "Please solve the coding problem shown on screen."). Put the full problem statement, constraints, and examples in "description". Put templates in "starterCode". NEVER dump the full problem, starter code, or editor content into "text".
This 13-second spoken limit applies to ALL question types including CODING and OPEN_ENDED.
`;

export function buildGeneratorPrompt(
  description: string,
  durationMinutes?: number,
  language?: string,
  jobDescription?: string,
  resumeText?: string,
  existingCriteria?: any[],
  isVoiceOnly?: boolean,
  codingQuestions?: number,
  behavioralQuestions?: number,
  codingLanguage?: string,
  numQuestions?: number,
): LLMMessage[] {
  const languageInstruction = language && language !== "en"
    ? `\nLANGUAGE: All generated content MUST be written in ${language}. Only JSON keys and enum values remain in English.\n`
    : "";

  const codingLangInstruction = codingLanguage
    ? `\nCODING LANGUAGE: Every generated CODING question's "starterCode" MUST be written in the "${codingLanguage}" programming language, and the "starterCode.language" field must be exactly "${codingLanguage.toLowerCase()}".\n`
    : "";

  const contextInstruction = (jobDescription || resumeText)
    ? `\nCONTEXT DOCUMENTS:\n${jobDescription ? "- A JOB DESCRIPTION has been provided. Tailor questions to the specific skills and responsibilities listed." : ""}\n${resumeText ? "- A CANDIDATE RESUME has been provided. Probe claimed experience and validate key skills." : ""}\n${jobDescription && resumeText ? "- When both are provided, focus on how the candidate's experience maps to role requirements." : ""}\n`
    : "";

  const voiceOnlyInstruction = isVoiceOnly ? `\n${VOICE_ONLY_SPEECH_BUDGET}\n` : "";

  const codingTextGuidance = isVoiceOnly
    ? `- For CODING questions, set "options" to null. "text" = short spoken line only. Put the full problem statement in "description". Include a "starterCode" object with "language", "code" and "templates" fields. The "code" field contains the primary language template. The "templates" object MUST map exactly 14 keys: "javascript", "typescript", "python", "java", "cpp", "c", "go", "rust", "sql", "html", "css", "json", "markdown", "shell" to their respective language boilerplate code structures for this coding question. Do not skip any keys.`
    : `- For CODING questions, set "options" to null. Write a clear problem statement in the question text. Include a "starterCode" object with "language", "code" and "templates" fields. The "code" field contains the primary language template. The "templates" object MUST map exactly 14 keys: "javascript", "typescript", "python", "java", "cpp", "c", "go", "rust", "sql", "html", "css", "json", "markdown", "shell" to their respective language boilerplate code structures for this coding question. Do not skip any keys.`;

  const hasCodingConstraint = typeof codingQuestions === "number" || typeof behavioralQuestions === "number";
  const nc = codingQuestions ?? 0;
  const nb = behavioralQuestions ?? 0;
  const totalConstrained = nc + nb;

  const codingTypeGuidance = isVoiceOnly
    ? `- "CODING": A coding question. "text" is a short spoken prompt only; full details in "description"; starter template in "starterCode".`
    : `- "CODING": A coding/programming question where the participant writes code using a code editor. Set "options" to null.`;

  const codingConstraintBlock = hasCodingConstraint
    ? `\n\nCODING INTERVIEW MODE — HARD CONSTRAINTS:\n- Generate EXACTLY ${nc} CODING question(s).\n- Generate EXACTLY ${nb} OPEN_ENDED question(s) (behavioral).\n- Total: EXACTLY ${totalConstrained} questions.\n- No other question types.\n- Order: behavioral OPEN_ENDED first, CODING last.\n- Every CODING question MUST include a "starterCode" object.\n- In starterCode, NEVER use "pass" — always use a proper return with a placeholder value (e.g. "return None" in Python, "return null" in Java/C#, "return undefined" in JS/TS, "return 0" in C++).\n`
    : "";

  const hardConstraintReminder = hasCodingConstraint
    ? `\nIMPORTANT: Output EXACTLY ${nc} CODING and ${nb} OPEN_ENDED questions. Total = ${totalConstrained}. Hard constraint — no exceptions.`
    : "";

  const userQuestionInstruction = hasCodingConstraint
    ? `CODING INTERVIEW BREAKDOWN (MANDATORY):\n- Behavioral (OPEN_ENDED): EXACTLY ${nb}\n- Coding (CODING): EXACTLY ${nc}\n- Total: EXACTLY ${totalConstrained}\nFollow this exactly. Do not add or remove questions.`
    : typeof numQuestions === "number" && numQuestions > 0
      ? `Generate EXACTLY ${numQuestions} questions. Hard constraint — no exceptions.`
      : durationMinutes
        ? durationQuestionCountInstruction(durationMinutes)
        : "Target duration: approximately 20 minutes (generate 7–9 questions).";

  return [
    {
      role: "system",
      content: `You are an expert interview designer. Create a comprehensive interview structure based on the user's requirements.
${languageInstruction}${codingLangInstruction}${contextInstruction}${voiceOnlyInstruction}${codingConstraintBlock}
TASK:
Design a complete interview with:
1. A compelling title
2. A brief description (1-2 sentences)
3. Clear objective statement
${existingCriteria && existingCriteria.length > 0 ? `4. Use exactly this scoring rubric: ${JSON.stringify(existingCriteria)}.` : `4. 5-7 specific, measurable assessment criteria`}
5. Questions matching the target count (see user message)
6. Optimal AI persona configuration
7. 5-8 CV Assessment Criteria: "name" MAX 2 WORDS, "description" ONE sentence
8. 5-8 JD Alignment Criteria: same shape

GUIDELINES:
- Start with an ice-breaker; do NOT add a closing question inviting the candidate to ask questions (e.g. "Do you have any questions for us?") — the system delivers a thank-you closing automatically
- Group related topics together
- Use OPEN_ENDED for verbal responses, CODING for programming
${codingTextGuidance}

QUESTION TYPES:
- "OPEN_ENDED": Free-form response. "options": null.
${codingTypeGuidance}

OUTPUT VALID JSON ONLY:
{
  "title": "string",
  "description": "string",
  "objective": "string",
  "jobDescription": "string (full detailed JD)",
  "assessmentCriteria": [{ "name": "string", "description": "string" }],
  "cvAssessmentCriteria": [{ "name": "string (MAX 2 WORDS)", "description": "string (ONE sentence)" }],
  "cvJdAlignmentCriteria": [{ "name": "string (MAX 2 WORDS)", "description": "string (ONE sentence)" }],
  "estimatedDurationMinutes": number,
  "questions": [
    {
      "order": number,
      "text": "string",
      "type": "OPEN_ENDED" | "CODING",
      "description": "string",
      "timeLimitSeconds": number | null,
      "isRequired": true,
      "options": { "options": ["string"], "allowMultiple": false } | null,
      "followUpPrompts": [],
      "starterCode": { 
        "language": "string", 
        "code": "string",
        "templates": {
          "javascript": "string",
          "typescript": "string",
          "python": "string",
          "java": "string",
          "cpp": "string",
          "c": "string",
          "go": "string",
          "rust": "string",
          "sql": "string",
          "html": "string",
          "css": "string",
          "json": "string",
          "markdown": "string",
          "shell": "string"
        }
      } | null
    }
  ],
  "recommendedSettings": {
    "mode": "CHAT" | "VOICE" | "HYBRID",
    "followUpDepth": "LIGHT",
    "aiTone": "CASUAL" | "PROFESSIONAL" | "FORMAL" | "FRIENDLY",
    "aiName": "Inluwa"
  }
}

IMPORTANT: aiName MUST always be "Inluwa".
IMPORTANT: cvAssessmentCriteria and cvJdAlignmentCriteria "name" MUST be at most 2 words.${isVoiceOnly ? `\nIMPORTANT: Keep question "text" under 30 words (EN) or 45 chars (CJK).` : ""}${hardConstraintReminder}`,
    },
    {
      role: "user",
      content: `Create an interview for the following goal:

"${description}"

${userQuestionInstruction}
${jobDescription ? `\n--- JOB DESCRIPTION ---\n${jobDescription}\n--- END JOB DESCRIPTION ---\n` : ""}${resumeText ? `\n--- CANDIDATE RESUME ---\n${resumeText}\n--- END CANDIDATE RESUME ---\n` : ""}
Please generate the complete interview structure as JSON.`,
    },
  ];
}

export function buildImprovePrompt(
  currentInterview: {
    title: string;
    description?: string | null;
    objective?: string | null;
    jobDescription?: string | null;
    assessmentCriteria?: { name: string; description: string }[];
    questions: { text: string; type: string }[];
  },
  feedback: string,
  language?: string,
  jobDescription?: string,
  resumeText?: string,
  isVoiceOnly?: boolean,
  codingLanguage?: string,
): LLMMessage[] {
  const questionsText = currentInterview.questions
    .map((q, i) => `${i + 1}. [${q.type}] ${q.text}`)
    .join("\n");

  const criteriaText = currentInterview.assessmentCriteria?.length
    ? currentInterview.assessmentCriteria.map((c) => `- ${c.name}: ${c.description}`).join("\n")
    : "None defined";

  const currentJd = currentInterview.jobDescription || jobDescription;
  const voiceOnlyInstruction = isVoiceOnly ? `\n${VOICE_ONLY_SPEECH_BUDGET}\n` : "";
  const codingTypeGuidance = isVoiceOnly
    ? `- "CODING": spoken "text" only; full details in "description"; template in "starterCode".`
    : `- "CODING": coding question where participant writes code. "options": null.`;

  const codingLangInstruction = codingLanguage
    ? `\nCODING LANGUAGE: Every generated CODING question's "starterCode" MUST be written in the "${codingLanguage}" programming language, and the "starterCode.language" field must be exactly "${codingLanguage.toLowerCase()}".\n`
    : "";

  return [
    {
      role: "system",
      content: `You are an expert interview designer. Improve an existing interview based on user feedback.
${language && language !== "en" ? `\nLANGUAGE: All content MUST be in ${language}. JSON keys and enum values stay in English.\n` : ""}${codingLangInstruction}${voiceOnlyInstruction}
`+`QUESTION TYPES:
- "OPEN_ENDED": Free-form. "options": null.
${codingTypeGuidance}

OUTPUT VALID JSON ONLY:
{
  "title": "string",
  "description": "string",
  "objective": "string",
  "jobDescription": "string",
  "assessmentCriteria": [{ "name": "string", "description": "string" }],
  "cvAssessmentCriteria": [{ "name": "string (MAX 2 WORDS)", "description": "string (ONE sentence)" }],
  "cvJdAlignmentCriteria": [{ "name": "string (MAX 2 WORDS)", "description": "string (ONE sentence)" }],
  "estimatedDurationMinutes": number,
  "questions": [
    {
      "order": number,
      "text": "string",
      "type": "OPEN_ENDED" | "CODING",
      "description": "string",
      "timeLimitSeconds": number | null,
      "isRequired": true,
      "options": { "options": ["string"], "allowMultiple": false } | null,
      "followUpPrompts": [],
      "starterCode": { 
        "language": "string", 
        "code": "string",
        "templates": {
          "javascript": "string",
          "typescript": "string",
          "python": "string",
          "java": "string",
          "cpp": "string",
          "c": "string",
          "go": "string",
          "rust": "string",
          "sql": "string",
          "html": "string",
          "css": "string",
          "json": "string",
          "markdown": "string",
          "shell": "string"
        }
      } | null
    }
  ],
  "recommendedSettings": {
    "mode": "CHAT" | "VOICE" | "HYBRID",
    "followUpDepth": "LIGHT",
    "aiTone": "CASUAL" | "PROFESSIONAL" | "FORMAL" | "FRIENDLY",
    "aiName": "Inluwa"
  }
}

IMPORTANT: aiName MUST always be "Inluwa".
IMPORTANT: Include 5-7 assessment criteria.
IMPORTANT: cvAssessmentCriteria and cvJdAlignmentCriteria "name" MUST be at most 2 words.${isVoiceOnly ? `\nIMPORTANT: Keep "text" under 30 words (EN) or 45 chars (CJK).` : ""}`,
    },
    {
      role: "user",
      content: `Current interview:
Title: ${currentInterview.title}
Description: ${currentInterview.description ?? "Not set"}
Objective: ${currentInterview.objective ?? "Not set"}
Assessment Criteria:
${criteriaText}
Questions:
${questionsText}

${currentJd ? `\n--- CURRENT JOB DESCRIPTION ---\n${currentJd}\n--- END CURRENT JOB DESCRIPTION ---\n` : ""}${resumeText ? `\n--- CANDIDATE RESUME ---\n${resumeText}\n--- END CANDIDATE RESUME ---\n` : ""}
User feedback: "${feedback}"

Please improve this interview. Output ONLY valid JSON.`,
    },
  ];
}
