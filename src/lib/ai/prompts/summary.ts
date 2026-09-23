import { getSummaryLanguageDisplayName } from "@/lib/i18n";
import type { LLMContentPart, LLMMessage } from "../types";

export interface WhiteboardDrawingInput {
  label: string;
  imageDataUrl?: string | null;
}

export interface CodeSnippetInput {
  label: string;
  code: string;
  language: string;
}

export interface FaceAnalysisInput {
  eyeContactScore: number;
  missedCount: number;
  multipleFacesCount: number;
  emotions: { emotion: string; confidence: number }[];
}

export function buildSummaryPrompt(
  interviewTitle: string,
  messages: { role: string; content: string }[],
  objective?: string | null,
  assessmentCriteria?: { name: string; description: string }[] | null,
  questions?: { text: string; order: number; type?: string }[] | null,
  language?: string | null,
  whiteboardDrawings?: WhiteboardDrawingInput[] | null,
  codeSnippets?: CodeSnippetInput[] | null,
  faceAnalysis?: FaceAnalysisInput | null
): LLMMessage[] {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "Participant" : "Interviewer"}: ${m.content}`)
    .join("\n\n");

  const objectiveSection = objective
    ? `\nInterview Objective: "${objective}"`
    : "";

  // ── Questions section ──────────────────────────────────────────
  const questionsSection =
    questions && questions.length > 0
      ? `\n\nInterview Questions:\n${questions.map((q, i) => `${i + 1}. ${q.type ? `[${q.type}] ` : ""}${q.text}`).join("\n")}`
      : "";

  // ── Whiteboard drawings section (text context) ─────────────────
  const hasDrawings = whiteboardDrawings && whiteboardDrawings.length > 0;
  const whiteboardSection = hasDrawings
    ? `\n\nWhiteboard Drawings (created by the participant during the interview):\n${whiteboardDrawings.map((d, i) => `${i + 1}. "${d.label}"`).join("\n")}`
    : "";

  // ── Code snippets section ─────────────────────────────────────
  const hasCode = codeSnippets && codeSnippets.length > 0;
  const codeSection = hasCode
    ? `\n\nCode Snippets (written by the participant during the interview):\n${codeSnippets.map((s, i) => `--- Snippet ${i + 1}: "${s.label}" (${s.language}) ---\n${s.code}\n--- End of Snippet ${i + 1} ---`).join("\n\n")}`
    : "";

  // ── Assessment criteria section ────────────────────────────────
  const criteriaSection =
    assessmentCriteria && assessmentCriteria.length > 0
      ? `\nAssessment Criteria:\n${assessmentCriteria.map((c) => `- ${c.name}: ${c.description}`).join("\n")}`
      : "";

  const criteriaEvalInstruction =
    assessmentCriteria && assessmentCriteria.length > 0
      ? `7. Evaluate the participant against EACH assessment criterion with a score (1-10) and comprehensive, deep reasoning (at least 4-5 sentences). Cite specific transcript evidence, analyze their strengths, outline any gaps or areas for development, and explain the rationale behind the score.\n`
      : "";

  const criteriaJsonField =
    assessmentCriteria && assessmentCriteria.length > 0
      ? `,
  "criteriaEvaluations": [
    { "name": "criterion name", "score": 1-10, "reasoning": "comprehensive explanation of the score (at least 4-5 sentences) with detailed analysis of strengths and gaps based on transcript evidence" }
  ]`
      : "";

  // ── Research questions section ────────────────────────────────
  const researchQuestions = questions?.filter((q) => q.type === "RESEARCH") ?? [];
  const hasResearchQuestions = researchQuestions.length > 0;

  const toneInstruction = `${hasResearchQuestions ? "9" : "8"}. Analyze the participant's communication tone and confidence throughout the interview by examining speech patterns in the transcript: filler words ("um", "uh", "like", "嗯", "那个"), hedging language ("I think maybe", "I'm not sure but", "可能", "大概"), response lengths, directness vs evasiveness, and enthusiasm markers. Produce a per-question tone assessment.\n`;

  const researchInstruction = hasResearchQuestions
    ? `${hasResearchQuestions ? "10" : "9"}. For each RESEARCH-type question, produce a detailed research finding: a comprehensive, specific summary of ALL information the participant shared on that topic, organized into key sub-topics with supporting details, data points, examples, and direct quotes. This should read like a thorough research brief — be as specific and detailed as possible.\n`
    : "";

  const researchJsonField = hasResearchQuestions
    ? `,
  "researchFindings": [
    {
      "question": "the research question text",
      "summary": "comprehensive 2-4 paragraph summary of all information extracted, organized by sub-topics",
      "keyTopics": [
        { "topic": "topic name", "details": "specific details, data points, examples, and quotes from the participant" }
      ],
      "dataPoints": ["specific fact, number, or data point mentioned by the participant"]
    }
  ]`
    : "";

  // ── Per-question evaluation section ────────────────────────────
  const questionEvalInstruction =
    questions && questions.length > 0
      ? `6. For EACH interview question, evaluate the participant's response: how well they addressed the question, key strengths, areas for improvement, and a score (1-10). Use this calibration:
   - 9-10: Exceptional — deep, specific, clearly exceeds expectations
   - 7-8: Strong — relevant, well-explained, addresses the question with good examples (a solid good answer should land here)
   - 5-6: Adequate — partially addresses the question or lacks depth/detail
   - 3-4: Weak — vague, off-topic, or minimal effort
   - 0-2: Missing or essentially no answer
   Do NOT deflate scores for competent answers. If the participant gave a relevant, thoughtful response, score at least 7 unless there are clear gaps.\n`
      : "";

  const questionEvalJsonField =
    questions && questions.length > 0
      ? `,
  "questionEvaluations": [
    {
      "question": "the interview question text",
      "score": 8,
      "evaluation": "detailed evaluation of the participant's response to this question. If unanswered, explicitly state 'No substantive answer provided.'",
      "highlights": ["specific strength or notable point"],
      "improvements": ["area where the response could be improved"]
    }
  ]`
      : "";

  // ── Language instruction ───────────────────────────────────────
  const languageInstruction = language
    ? `\n\nIMPORTANT: Write the ENTIRE report (all text fields including summary, evaluations, insights, themes) in ${getSummaryLanguageDisplayName(language)}. Do NOT mix languages.`
    : "";

  const whiteboardInstruction = hasDrawings
    ? "\n- The participant created whiteboard drawings during the interview to visually illustrate their ideas. The drawing images are attached below. Analyze the visual content of each drawing and incorporate your observations into the report — describe what was drawn, how it relates to the discussion, and whether it demonstrates clear thinking or effective communication."
    : "";

  const codeInstruction = hasCode
    ? "\n- The participant wrote code snippets during the interview. Evaluate the code quality, correctness, readability, and problem-solving approach. Consider whether the code demonstrates strong algorithmic thinking, proper use of data structures, good coding practices, and effective handling of edge cases. Incorporate your code evaluation into the report."
    : "";

  const codeEvalInstruction = hasCode
    ? `${hasResearchQuestions ? "11" : "10"}. For EACH code snippet the participant wrote, produce a structured code evaluation with scores (1-10) for these dimensions:\n   - correctness: Does the logic produce the right output? Are edge cases handled?\n   - efficiency: Is the algorithm optimal? Consider time/space complexity.\n   - readability: Naming conventions, code structure, clarity, comments.\n   - problemSolving: Quality of approach, decomposition, design decisions.\n   - overall: Holistic composite score across all dimensions.\n   Also write a 3-5 sentence evaluation paragraph explaining the scores. Match each evaluation to the snippet by its exact label.\n`
    : "";

  const codeEvalJsonField = hasCode
    ? `,
  "codeEvaluations": [
    {
      "snippetLabel": "exact label of the snippet as provided",
      "language": "programming language",
      "correctness": 8,
      "efficiency": 7,
      "readability": 9,
      "problemSolving": 8,
      "overall": 8,
      "evaluation": "3-5 sentence paragraph assessing the code quality, approach, and specific strengths or weaknesses found in this snippet"
    }
  ]`
    : "";

  // ── Face analysis section ────────────────────────────────────
  const faceSection = faceAnalysis
    ? `\n\nBehavioral Signals (from computer vision analysis):\n- Eye Contact Score: ${faceAnalysis.eyeContactScore}% (reflects focus and engagement)\n- Eye Contact Missed: ${faceAnalysis.missedCount || 0} times (gaze was away from camera or face not visible)\n- Multiple Faces Detected: ${faceAnalysis.multipleFacesCount || 0} times (if > 0, this indicates potential cheating or distractions)\n- Detected Emotional Presence: ${faceAnalysis.emotions.map(e => `${e.emotion} (${Math.round(e.confidence * 100)}%)`).join(", ") || "None"}`
    : "";

  const systemPrompt = `You are an expert interview analyst. Evaluate and summarize the following interview transcript. Focus on the participant's responses — their depth, relevance, and quality.

Interview: "${interviewTitle}"${objectiveSection}${criteriaSection}${questionsSection}${whiteboardSection}${codeSection}${faceSection}

Transcript:
${transcript}

Your analysis should:
1. Summarize the key points from the participant's answers
2. Evaluate how well the participant addressed each topic
3. Identify recurring themes and notable insights
4. Assess the overall sentiment and engagement level
5. Highlight any particularly strong or weak responses${whiteboardInstruction}${codeInstruction}
6. Provide QUANTITATIVE behavioral feedback: Use the provided Eye Contact Score, Missed Count, and Emotion Confidence scores. Do NOT say behavioral analysis is impossible for a transcript; you must use the provided computer vision data to give evidence-based feedback.
7. Generate DYNAMIC Workmap Behavioral Assessment scores (Likert Scale 0-100%) for these 5 parameters based on ACTUAL interview transcript evidence:
   - Presentation: How well did they explain ideas logically, with clear speech and structured communication?
   - Opportunistic: Did they show proactive thinking, propose improvements, or identify opportunities?
   - Business Acumen: Did they demonstrate understanding of business operations, market dynamics, or strategic thinking?
   - Closing Techniques: Did they show persuasion skills, address concerns effectively, or drive toward outcomes?
   - Objection Handling: How well did they address concerns, provide solutions, or handle pushback?
   Base each score (0-100) and explanation on SPECIFIC transcript evidence. Do NOT use placeholder scores.
${questionEvalInstruction}${criteriaEvalInstruction}${toneInstruction}${researchInstruction}${codeEvalInstruction}${languageInstruction}
8. Identify the participant's top 3 pros (strengths, advantages, or positive indicators) and top 3 cons (areas of concern, gaps, or development opportunities) based on their answers.
9. CRITICAL ANTI-HALLUCINATION RULES:
   - Do NOT invent facts, achievements, competencies, or behaviors that are not in the transcript.
   - If a question was not substantively answered, mark it as unanswered and score it 0. Questions the interview never reached due to time limits should be scored 0 with "Not reached in session."
   - If evidence is insufficient overall, explicitly state insufficient data instead of guessing.
   - Do NOT generate strong pros from greetings, politeness, or filler language.
   - Use only transcript-backed evidence for every evaluation.
   - When computing the overall impression, weight answered questions most heavily — do not let unanswered or skipped questions unfairly drag down the evaluation of strong answers that were given.
10. Calculate a holistic Overall Hirability Score from 1 to 10 based on the participant's complete performance, considering all their answers and evaluations.

CRITICAL OUTPUT RULES:
- Respond with a single valid JSON object only. No markdown fences, no commentary before/after.
- Use only standard ASCII double quotes ("). Never Unicode smart quotes (“ ” ‘ ’).
- Do NOT include ellipsis (...), comments, trailing commas, or unquoted keys.
- Escape any double quotes that appear inside string values.
- Keep string values reasonably concise so the full JSON is not truncated.

Provide a structured analysis as VALID JSON ONLY matching this shape:
{
  "insufficientData": false,
  "overallHirabilityScore": 8,
  "summary": "2-3 paragraph evaluation of the participant's responses, covering key points discussed and overall performance",
  "themes": ["theme1", "theme2"],
  "sentiment": {
    "overall": "positive" | "neutral" | "negative",
    "details": "brief analysis of participant's engagement and attitude"
  },
  "keyInsights": ["insight1", "insight2"],
  "notableQuotes": ["direct quote from participant 1", "direct quote 2"],
  "toneAnalysis": {
    "overall": "confident" | "neutral" | "hesitant",
    "details": "brief overall communication style assessment",
    "segments": [
      {
        "question": "the interview question text",
        "tone": "confident" | "enthusiastic" | "neutral" | "hesitant" | "uncertain",
        "confidence": "high" | "medium" | "low",
        "notes": "specific observations about speech patterns, filler words, directness"
      }
    ]
  },
  "behavioralAnalysis": {
    "eyeContactFeedback": "detailed quantitative and qualitative feedback on eye contact using the Eye Contact Score and Missed Count (e.g. 'Maintained 85% eye contact, only missed 3 times'). Explain how this affects their engagement.",
    "emotionalPresenceFeedback": "detailed quantitative and qualitative feedback on emotional engagement using detected emotions and confidence % (e.g. 'Showed high enthusiasm, Happy 92% detected during the introduction'). Analyze how their mood changed during the interview.",
    "overallBehavioralInsight": "comprehensive summary of how these metrics affected the overall interview performance, providing deep behavioral feedback (at least 3 sentences)",
    "likertScale": [
      {
        "parameter": "Presentation",
        "score": 85,
        "explanation": "evidence-based assessment of how well the candidate presented their ideas, including clarity, structure, and communication effectiveness based on transcript evidence"
      },
      {
        "parameter": "Opportunistic",
        "score": 80,
        "explanation": "evidence-based assessment of the candidate's ability to identify and capitalize on opportunities, showing proactive thinking and initiative based on their responses"
      },
      {
        "parameter": "Business Acumen",
        "score": 75,
        "explanation": "evidence-based assessment of the candidate's understanding of business operations, market dynamics, and strategic thinking based on their answers"
      },
      {
        "parameter": "Closing Techniques",
        "score": 70,
        "explanation": "evidence-based assessment of persuasion skills, ability to address concerns, and drive outcomes based on their communication style"
      },
      {
        "parameter": "Objection Handling",
        "score": 65,
        "explanation": "evidence-based assessment of how well the candidate addressed concerns, provided solutions, and handled pushback based on their responses"
      }
    ]
  },
  "big5Personality": {
    "openness": 8.5,
    "conscientiousness": 7.0,
    "extraversion": 6.5,
    "agreeableness": 8.0,
    "neuroticism": 4.5
  },
  "pros": ["pro 1", "pro 2", "pro 3"],
  "cons": ["con 1", "con 2", "con 3"]${questionEvalJsonField}${criteriaJsonField}${researchJsonField}${codeEvalJsonField}
}`;

  const result: LLMMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // ── Attach whiteboard images as a multimodal user message ──────
  if (hasDrawings) {
    const drawingsWithImages = whiteboardDrawings.filter((d) => d.imageDataUrl);
    if (drawingsWithImages.length > 0) {
      const parts: LLMContentPart[] = [
        {
          type: "text",
          text: `Here are the whiteboard drawings created by the participant during the interview. Please analyze their visual content:\n${drawingsWithImages.map((d, i) => `Drawing ${i + 1}: "${d.label}"`).join("\n")}`,
        },
        ...drawingsWithImages.map(
          (d) =>
            ({
              type: "image_url",
              image_url: { url: d.imageDataUrl! },
            }) as LLMContentPart
        ),
      ];
      result.push({ role: "user", content: parts });
      return result;
    }
  }

  // Gemini via OpenAI compatibility API requires at least one user message
  result.push({ 
    role: "user", 
    content: "Analyze the interview and reply with ONLY one valid JSON object for the summary report. No markdown, no prose outside JSON, no ellipsis (...), no trailing commas." 
  });

  return result;
}
