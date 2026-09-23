import { appendResumeScoringLog, type CvAnalysisLog } from "@/lib/ai/resume-scoring-log";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/logger";
import { getProvider, GENERATOR_MODEL } from "@/lib/ai/registry";
import { extractJson } from "@/lib/ai/extract-json";
import { normalizeCvCriteria } from "@/lib/cv-criteria";

export const maxDuration = 300;

const log = createLogger("api/ai/parse-resume");

const RESUME_SERVICE_URL =
  process.env.RESUME_SERVICE_URL || "http://127.0.0.1:8091";

type ParsedCandidate = {
  name?: string;
  email?: string;
  phone?: string;
  gender?: string | null;
  birthday?: string | null;
  education?: string | null;
  school?: string | null;
  major?: string | null;
  graduationYear?: number | null;
  workExperience?: string | null;
  notes?: string | null;
  cvAnalysis?: CvAnalysisLog;
};

type ResumeServiceResponse = {
  success: boolean;
  candidate: ParsedCandidate;
  resumeTextLength?: number;
  resumePreview?: string;
  parsingTimeSeconds?: number;
};

function streamJsonAsSse(json: string): Response {
  const encoder = new TextEncoder();
  const chunkSize = 80;

  const readable = new ReadableStream({
    start(controller) {
      for (let i = 0; i < json.length; i += chunkSize) {
        const token = json.slice(i, i + chunkSize);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ token })}\n\n`),
        );
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData().catch((e) => {
      log.error("Failed to parse formData", e);
      throw e;
    });
    const file = formData.get("file") as File | null;
    const interviewId = formData.get("interviewId") as string | null;

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Start async processing in a stream to prevent 504 Gateway Timeouts
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const keepaliveInterval = setInterval(() => {
          controller.enqueue(encoder.encode("data: \n\n"));
        }, 5000); // 5s keepalive

        try {
          let resumePath: string | null = null;
          let resumeName: string | null = null;
          try {
            resumeName = file.name;
            const fileExt = file.name.split(".").pop();
            const storageFileName = `resumes/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
            const fileBuffer = Buffer.from(await file.arrayBuffer());
            const { error: uploadError } = await supabaseAdmin.storage
              .from("support-attachments")
              .upload(storageFileName, fileBuffer, {
                contentType: file.type,
                cacheControl: "3600",
              });

            if (uploadError) {
              log.error("Failed to upload CV to storage:", uploadError);
            } else {
              resumePath = storageFileName;
            }
          } catch (storageErr) {
            log.error("Error during CV storage upload:", storageErr);
          }

          if (file.size > 5 * 1024 * 1024) {
            throw new Error("CV file size must be less than 5MB");
          }

          let interviewTitle: string | null = null;
          let jobDescription: string | null = null;
          let assessmentCriteria: unknown = null;
          const interviewContext: Record<string, unknown> = {};

          if (interviewId) {
            const { data: interview } = await supabaseAdmin
              .from("interviews")
              .select("title, objective, assessmentCriteria, jobDescription, cvAssessmentCriteria, cvJdAlignmentCriteria")
              .eq("id", interviewId)
              .single();

            if (interview) {
              interviewTitle = interview.title;
              jobDescription = interview.jobDescription ?? null;
              assessmentCriteria = interview.assessmentCriteria ?? null;
              
              let cvAssessmentCriteria = interview.cvAssessmentCriteria;
              let cvJdAlignmentCriteria = interview.cvJdAlignmentCriteria;

              if ((!cvAssessmentCriteria || !cvJdAlignmentCriteria) && jobDescription) {
                  log.info(`Generating CV parameters JIT for interview ${interviewId}`);
                  try {
                      const provider = getProvider(GENERATOR_MODEL);
                      const resp = await provider.generateResponse({
                          model: GENERATOR_MODEL,
                          messages: [
                              {
                                  role: "system",
                                  content: `You are an expert HR system. Based ONLY on the provided job description, generate EXACTLY 5 to 8 CV-verifiable parameters for "Assessment Rubrics" (overall candidate competency) and 5 to 8 parameters for "JD Alignment" (specific requirements in the JD).
                                  
RULES:
1. BE HIGHLY SPECIFIC TO THE JD. Do NOT generate generic parameters like "Domain Expertise" or "Technical Skills". Extract the exact domains and technologies mentioned in the JD.
2. ONLY include parameters that can be verified from reading a resume. NEVER include soft skills like "Communication", "Leadership", or "Cultural Fit".
3. Each parameter MUST be an object with:
   - "name": MAX 2 WORDS for the radar graph (e.g. "SAP Skills", "Cloud Ops", "B2B Sales")
   - "description": ONE sentence explaining what is measured / required (shown in a dropdown, not on the graph)
4. Return ONLY a valid JSON object:
{
  "cvAssessmentCriteria": [{ "name": "SAP Skills", "description": "One sentence..." }, ...],
  "cvJdAlignmentCriteria": [{ "name": "B2B Sales", "description": "One sentence..." }, ...]
}`
                              },                              {
                                  role: "user",
                                  content: `Job Description:\n${jobDescription}`
                              }
                          ]
                      });
                      
                      let rawJson = resp.content;
                      const match = rawJson.match(/\{[\s\S]*\}/);
                      if (match) rawJson = match[0];
                      const parsed = JSON.parse(rawJson);
                      
                      if (parsed.cvAssessmentCriteria && Array.isArray(parsed.cvAssessmentCriteria)) {
                          cvAssessmentCriteria = normalizeCvCriteria(parsed.cvAssessmentCriteria);
                      }
                      if (parsed.cvJdAlignmentCriteria && Array.isArray(parsed.cvJdAlignmentCriteria)) {
                          cvJdAlignmentCriteria = normalizeCvCriteria(parsed.cvJdAlignmentCriteria);
                      }
                      
                      if (cvAssessmentCriteria || cvJdAlignmentCriteria) {
                          await supabaseAdmin.from("interviews").update({
                              cvAssessmentCriteria,
                              cvJdAlignmentCriteria
                          }).eq("id", interviewId);
                      }
                  } catch (err) {
                      log.error("Failed to generate JIT CV criteria:", err);
                  }
              }

              interviewContext.title = interview.title;
              interviewContext.objective = interview.objective;
              interviewContext.jobDescription = jobDescription;
              interviewContext.assessmentCriteria = assessmentCriteria;
              if (cvAssessmentCriteria) interviewContext.cvAssessmentCriteria = normalizeCvCriteria(cvAssessmentCriteria);
              if (cvJdAlignmentCriteria) interviewContext.cvJdAlignmentCriteria = normalizeCvCriteria(cvJdAlignmentCriteria);
            }
          }

          const upstream = new FormData();
          upstream.append("file", file);
          if (Object.keys(interviewContext).length > 0) {
            upstream.append("interviewContext", JSON.stringify(interviewContext));
          }

          log.info(
            "Calling resume service at %s for file %s",
            RESUME_SERVICE_URL,
            file.name,
          );

          const serviceRes = await fetch(
            `${RESUME_SERVICE_URL}/parse-and-score`,
            { method: "POST", body: upstream },
          );

          if (!serviceRes.ok) {
            const errText = await serviceRes.text();
            log.error("Resume service error:", serviceRes.status, errText);
            let message = "Resume parsing service failed";
            try {
              const errJson = JSON.parse(errText) as { detail?: string };
              message = errJson.detail || message;
            } catch {
              if (errText) message = errText.slice(0, 300);
            }
            throw new Error(message);
          }

          const serviceData = (await serviceRes.json()) as ResumeServiceResponse;
          const candidate = serviceData.candidate;

          if (resumePath) {
            if (!candidate.cvAnalysis) {
              candidate.cvAnalysis = {} as any;
            }
            (candidate.cvAnalysis as any).resumePath = resumePath;
            (candidate.cvAnalysis as any).resumeName = resumeName;
          }

          const responseJson = JSON.stringify(candidate);

          void appendResumeScoringLog({
            interviewId,
            interviewTitle,
            fileName: file.name,
            resumeTextLength: serviceData.resumeTextLength ?? 0,
            resumePreview: serviceData.resumePreview ?? "",
            jobDescriptionPreview: jobDescription,
            assessmentCriteria,
            parsedCandidate: {
              name: candidate.name,
              email: candidate.email,
              workExperience: candidate.workExperience,
              education: candidate.education,
            },
            cvAnalysis: candidate.cvAnalysis ?? null,
            rawResponse: responseJson,
          });

          clearInterval(keepaliveInterval);

          // Stream the actual JSON back to the client
          const chunkSize = 80;
          for (let i = 0; i < responseJson.length; i += chunkSize) {
            const token = responseJson.slice(i, i + chunkSize);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ token })}\n\n`),
            );
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          clearInterval(keepaliveInterval);
          log.error("Stream Error:", err);
          const message = err instanceof Error ? err.message : "Internal server error";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    log.error("Initial Error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
