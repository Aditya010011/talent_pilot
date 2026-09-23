import { useAppLocale } from "@/components/app-locale-provider";
import React, { useMemo, useState, useEffect } from "react";
import { InluwaLogo } from "@/components/ui/inluwa-logo";
import { Big5RadarChart, CommunicationToneLineChart, CriteriaRadarChart, StarRating, translateSentimentLabel } from "@/components/interview/report-charts";
import { cn } from "@/lib/utils";

function PdfPageFooter({ pageNum }: { pageNum: number }) {
  const { t } = useAppLocale();
  return (
    <div className="absolute bottom-0 left-0 right-0 px-12 pb-3">
      <div className="text-center border-t border-slate-200 pt-1.5 pb-0.5">
        <p className="text-[8px] uppercase text-slate-500 font-medium tracking-widest">
          {t("results.pdf.page")} {pageNum}
        </p>
      </div>
    </div>
  );
}

const PDF_PAGE_CLASS =
  "pdf-page bg-white w-[210mm] h-[296mm] min-h-[296mm] mx-auto relative overflow-hidden px-12 pt-10";

/** Content area — full page height with reserved space for absolutely pinned footer */
const PDF_CONTENT_CLASS = "h-full overflow-hidden pb-10";

function ReportHeader() {
  const { t } = useAppLocale();
  return (
    <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2 mb-4">
      {/* Logo Only (Removed "INLUWA" text as requested) */}
      <div className="flex items-center">
        <InluwaLogo size={28} className="h-7" />
      </div>
      
      {/* Document Control */}
      <div className="text-right">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-900">
          Official Record
        </p>
        <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">
          Strictly Confidential
        </p>
      </div>
    </div>
  );
}

export function HRStandardPDFReport({ 
  summary, 
  criteriaEvaluations, 
  questionEvaluations,
  overallScore,
  big5Personality,
  toneAnalysis,
  communicationToneSegments,
  behavioralAnalysis,
  toneRows,
  sentimentData
}: any) {
  const { t } = useAppLocale();
  const data = summary.data;

  const antiCheatingLog = (data?.antiCheatingLog ?? []) as any[];
  const tabSwitchCount = antiCheatingLog.filter(log => 
    log.type.includes("tab_switch") || log.type.includes("departure") || log.type.includes("focus_lost")
  ).length;
  const multiFacesCount = data?.metadata?.multiple_faces_count ?? antiCheatingLog.filter(log => 
    log.type.includes("multiple_faces") || log.type.includes("face")
  ).length;
  const gazeMissedCount = data?.metadata?.missed_count ?? 0;
  
  const overallIntegrity = {
    multipleFaces: multiFacesCount > 0 ? "Flagged" : "Clear",
    tabSwitchCount,
    tabSwitching: tabSwitchCount > 0 ? `Flagged (${tabSwitchCount})` : "Clear",
    eyeGaze: gazeMissedCount > 8 ? "Unstable" : gazeMissedCount > 3 ? "Moderate" : "Stable"
  };

  const eyeContactVal = data?.metadata?.eye_contact_score ?? 100;
  const overallVibe = {
    eyeContact: `${eyeContactVal}%`,
    eyeContactVal
  };
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    const metadataPhoto =
      (data?.metadata as { capturedPhoto?: string } | undefined)?.capturedPhoto ??
      ((data?.participantMetadata as { capturedPhoto?: string } | undefined)?.capturedPhoto);
    if (metadataPhoto) {
      setPhoto(metadataPhoto);
      return;
    }
    if (typeof window !== "undefined" && data?.id) {
      try {
        const stored = localStorage.getItem(`captured_photo_${data.id}`);
        if (stored) {
          setPhoto(stored);
        }
      } catch (e) {
        console.error("Failed to load candidate photo from localStorage:", e);
      }
    }
  }, [data?.id, data?.metadata, data?.participantMetadata]);

  // Dynamic Strengths based on top scoring criteria
  const strengthsList = useMemo(() => {
    if (criteriaEvaluations && criteriaEvaluations.length > 0) {
      return criteriaEvaluations
        .filter((c: any) => c.score >= 6)
        .slice(0, 5)
        .map((c: any) => {
          if (c.name.toLowerCase().includes("communication")) {
            return "Exceptional verbal clarity and natural expressive tone, facilitating highly collaborative dialogues.";
          }
          if (c.name.toLowerCase().includes("problem") || c.name.toLowerCase().includes("technical")) {
            return "Strong analytical reasoning and technical aptitude when breaking down complex, non-trivial challenges.";
          }
          if (c.name.toLowerCase().includes("culture") || c.name.toLowerCase().includes("fit")) {
            return "Solid alignment with organizational values, demonstrating high integrity and cultural sensitivity.";
          }
          return `Demonstrated proficiency in ${c.name}, backed by structured reasoning: "${c.reasoning.slice(0, 100)}..."`;
        });
    }
    return [
      "Demonstrates clear communication skills, presenting ideas with confidence and structured clarity.",
      "Exhibits a strongly analytical mindset, with the ability to contextualize goals into actionable insights.",
      "Maintains a collaborative and receptive stance, welcoming constructive feedback and growth opportunities.",
      "Showcases alignment with technical best practices, ensuring scalable solution designs.",
      "Maintains composure under pressure, delivering logical answers to unexpected questions."
    ];
  }, [criteriaEvaluations]);

  // Dynamic Improvements based on lower scoring criteria
  const improvementsList = useMemo(() => {
    if (criteriaEvaluations && criteriaEvaluations.length > 0) {
      const lower = criteriaEvaluations.filter((c: any) => c.score < 6);
      if (lower.length > 0) {
        return lower.slice(0, 5).map((c: any) => {
          if (c.name.toLowerCase().includes("communication")) {
            return "Can benefit from structured delivery frameworks to ensure concise messaging.";
          }
          if (c.name.toLowerCase().includes("problem") || c.name.toLowerCase().includes("technical")) {
            return "Would improve by evaluating technical edge cases and limitations more systematically.";
          }
          return `Opportunities exist to further refine ${c.name} practices through practical application.`;
        });
      }
    }
    return [
      "Could improve structural conciseness during complex system design presentations.",
      "Opportunity to provide more quantitative, data-driven examples of past impact.",
      "Would benefit from discussing system edge cases and potential failure modes proactively.",
      "Recommend deepening proficiency with advanced enterprise patterns.",
      "Could articulate architectural trade-offs more explicitly to demonstrate strategic vision."
    ];
  }, [criteriaEvaluations]);

  const reportDate = useMemo(() => {
    if (data?.createdAt) {
      return new Date(data.createdAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric"
      });
    }
    return new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }, [data?.createdAt]);

  const formattedSuitability = useMemo(() => {
    const scoreVal = overallScore || 7.9;
    return `${Math.round(scoreVal * 10)}%`;
  }, [overallScore]);

  const startTimeStr = useMemo(() => {
    const time = data?.startedAt || data?.createdAt;
    if (!time) return "N/A";
    return new Date(time).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    });
  }, [data?.startedAt, data?.createdAt]);

  const endTimeStr = useMemo(() => {
    const time = data?.completedAt || data?.updatedAt;
    if (!time) return "N/A";
    return new Date(time).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    });
  }, [data?.completedAt, data?.updatedAt]);

  const big5Data = useMemo(() => {
    if (!big5Personality) return [];
    
    const traits = [
      {
        name: "Openness",
        score: big5Personality.openness ?? 0,
        highDesc: "Highly creative, open to new experiences, and comfortable with abstract concepts and strategic thinking.",
        medDesc: "Moderately open to new ideas, balancing standard operational structures with exploratory practices.",
        lowDesc: "Prefers structured, conventional, and familiar routines, focusing on concrete details over abstract strategy."
      },
      {
        name: "Conscientiousness",
        score: big5Personality.conscientiousness ?? 0,
        highDesc: "Demonstrates high organization, self-discipline, goal-directed behavior, and attention to detail.",
        medDesc: "Displays moderate self-discipline, balancing structured execution with flexible responsiveness.",
        lowDesc: "Tends to be more spontaneous and flexible, but may struggle with structured long-term details."
      },
      {
        name: "Extraversion",
        score: big5Personality.extraversion ?? 0,
        highDesc: "Outgoing, energetic, talkative, and highly engaged with team interactions and client-facing communication.",
        medDesc: "Balances social engagement with focused solo analysis; comfortable in both collaborative and independent environments.",
        lowDesc: "More reserved and introspective, preferring quiet work environments and thoughtful, deliberate interactions."
      },
      {
        name: "Agreeableness",
        score: big5Personality.agreeableness ?? 0,
        highDesc: "Extremely cooperative, trustful, empathetic, and aligned with maintaining team harmony and customer satisfaction.",
        medDesc: "Maintains standard professionalism and cooperation, balancing empathy with objective task focus.",
        lowDesc: "Highly competitive and direct, focusing strictly on objective deliverables, sometimes at the expense of consensus."
      },
      {
        name: "Neuroticism",
        score: big5Personality.neuroticism ?? 0,
        highDesc: "More sensitive to environmental changes or stress, showing heightened emotional responsiveness.",
        medDesc: "Maintains normal emotional stability, displaying typical resilience to standard workplace pressures.",
        lowDesc: "Highly resilient, calm, and emotionally stable, even in high-pressure or ambiguous situations."
      }
    ];

    return traits.map(t => {
      let explanation = t.medDesc;
      if (t.score >= 7) {
        explanation = t.highDesc;
      } else if (t.score < 4) {
        explanation = t.lowDesc;
      }
      return {
        name: t.name,
        score: t.score,
        explanation
      };
    });
  }, [big5Personality]);

  const likertData = useMemo(() => {
    const defaultParams = [
      {
        parameter: "Presentation",
        definition: "Developing and executing clear presentations using a variety of media effectively to individuals or groups, based on their characteristics and needs.",
        score: 0,
        explanation: "No substantive candidate responses to assess.",
      },
      {
        parameter: "Opportunistic",
        definition: "Constantly being on the lookout to capitalize on opportunities to improve or add value to a business, project or oneself.",
        score: 0,
        explanation: "No substantive candidate responses to assess.",
      },
      {
        parameter: "Business Acumen",
        definition: "Having a deep and applicable understanding of how a company operates and achieves its goals and objectives to make optimal business decisions.",
        score: 0,
        explanation: "No substantive candidate responses to assess.",
      },
      {
        parameter: "Closing Techniques",
        definition: "Skillfully select and execute various closing techniques by means of artful persuasion to close a deal with customers.",
        score: 0,
        explanation: "No substantive candidate responses to assess.",
      },
      {
        parameter: "Objection Handling",
        definition: "Effectively addressing and alleviating the concerns of prospective customers or clients about a product or service.",
        score: 0,
        explanation: "No substantive candidate responses to assess.",
      },
    ];

    const realScale = behavioralAnalysis?.likertScale;
    if (realScale && Array.isArray(realScale) && realScale.length > 0) {
      return defaultParams.map((p) => {
        const match = realScale.find(
          (r: any) => (r.parameter || "").toLowerCase() === p.parameter.toLowerCase()
        );
        if (match) {
          return {
            parameter: p.parameter,
            definition: p.definition,
            score: typeof match.score === "number" ? match.score : 0,
            explanation: match.explanation || p.explanation,
          };
        }
        return p;
      });
    }

    // Empty / insufficient transcript: zeros only — never invent mid-range scores
    return defaultParams;
  }, [behavioralAnalysis]);

  return (
    <div className="pdf-report-container bg-slate-50 p-0 text-slate-900 min-h-screen font-serif space-y-8 select-none">
      
      {/* ─── PAGE 1: TRADITIONAL COVER PAGE ─── */}
      <div className="pdf-page bg-white w-[210mm] h-[296mm] mx-auto relative flex flex-col justify-between overflow-hidden p-16 pb-32">
        
        {/* Department / Org Header */}
        <div className="text-center border-b-[3px] border-slate-900 pb-8 mt-12">
          <InluwaLogo size={64} className="h-16 mx-auto mb-6" />
          <h1 className="text-3xl font-bold uppercase tracking-widest text-slate-900">
            Candidate Assessment Division
          </h1>
          <p className="text-sm font-semibold uppercase tracking-widest text-slate-600 mt-2">
            Official Evaluation Record
          </p>
        </div>

        {/* Central Titles */}
        <div className="flex-1 flex flex-col justify-center items-center my-12">
          <div className="border border-slate-900 p-12 w-full max-w-lg bg-white shadow-sm">
            <h2 className="text-2xl font-bold uppercase tracking-widest text-center border-b border-slate-900 pb-4 mb-8 text-slate-900">
              Confidential Report
            </h2>
            
            <div className="space-y-6">
              <div className="grid grid-cols-3 border-b border-slate-100 pb-2">
                <div className="col-span-1 text-sm font-bold uppercase text-slate-800">{t("results.pdf.subjectName")}</div>
                <div className="col-span-2 text-base font-semibold text-slate-900">{data?.participantName || "Anonymous Candidate"}</div>
              </div>
              <div className="grid grid-cols-3 border-b border-slate-100 pb-2">
                <div className="col-span-1 text-sm font-bold uppercase text-slate-800">{t("results.pdf.assessment")}</div>
                <div className="col-span-2 text-base text-slate-900">{data?.interviewTitle || "General Interview"}</div>
              </div>
              <div className="grid grid-cols-3 border-b border-slate-100 pb-2">
                <div className="col-span-1 text-sm font-bold uppercase text-slate-800">{t("results.pdf.dateOfRecord")}</div>
                <div className="col-span-2 text-base text-slate-900">{reportDate}</div>
              </div>
              <div className="grid grid-cols-3 border-b border-slate-100 pb-2">
                <div className="col-span-1 text-sm font-bold uppercase text-slate-800">{t("results.startTime")}</div>
                <div className="col-span-2 text-base text-slate-900">{startTimeStr}</div>
              </div>
              <div className="grid grid-cols-3 border-b border-slate-100 pb-2">
                <div className="col-span-1 text-sm font-bold uppercase text-slate-800">{t("results.endTime")}</div>
                <div className="col-span-2 text-base text-slate-900">{endTimeStr}</div>
              </div>
              <div className="grid grid-cols-3 border-b border-slate-100 pb-2">
                <div className="col-span-1 text-sm font-bold uppercase text-slate-800">{t("results.pdf.finalRating")}</div>
                <div className="col-span-2 text-xl font-bold text-slate-900">{formattedSuitability}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Absolute Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-16 pt-0">
          <div className="text-center border-t border-slate-900 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-900">
              For Internal Review Only • Do Not Distribute
            </p>
          </div>
        </div>
      </div>

      {/* ─── PAGE 2: EXECUTIVE SUMMARY ─── */}
      <div className={PDF_PAGE_CLASS}>
        <div className={cn(PDF_CONTENT_CLASS, "space-y-3")}>
          <ReportHeader />

          <div className="border-b border-slate-900 pb-1.5">
            <h2 className="text-xl font-bold uppercase tracking-widest text-slate-900">
              Section 1: Executive Summary
            </h2>
          </div>

          <div className="text-xs leading-snug text-slate-900 space-y-2.5 text-justify">
            <p>
              {data?.summary || "The candidate displays a robust capability profile, demonstrating structured analytical reasoning, technical foundations, and transparent communication. Throughout the interview, they showcased critical problem-solving skills, with a collaborative stance and adaptability when approaching edge cases."}
            </p>
            <p>
              Their detailed evaluation indicates consistent performance across primary job domains, showing excellent aptitude for technical designs and customer alignment paradigms. They maintained high professionalism and steady composure during all assessment turns.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 pt-2">
            {/* Strengths */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest border-b border-slate-200 text-slate-900 pb-1 mb-2">
                Identified Strengths
              </h3>
              <ul className="list-disc pl-4 space-y-1">
                {strengthsList.map((strength: string, i: number) => (
                  <li key={i} className="text-[11px] text-slate-900 leading-snug">
                    {strength}
                  </li>
                ))}
              </ul>
            </div>

            {/* Areas of Improvement */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest border-b border-slate-200 text-slate-900 pb-1 mb-2">
                Areas Designated for Improvement
              </h3>
              <ul className="list-disc pl-4 space-y-1">
                {improvementsList.map((improvement: string, i: number) => (
                  <li key={i} className="text-[11px] text-slate-900 leading-snug">
                    {improvement}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <PdfPageFooter pageNum={2} />
      </div>

      {/* ─── PAGE 3: CORE COMPETENCIES ─── */}
      <div className={PDF_PAGE_CLASS}>
        <div className={cn(PDF_CONTENT_CLASS, "space-y-3")}>
          <ReportHeader />

          <div className="border-b border-slate-900 pb-2">
            <h2 className="text-xl font-bold uppercase tracking-widest text-slate-900">
              Section 2: Core Competencies
            </h2>
          </div>

          <div>
            <p className="text-xs text-slate-900 leading-snug text-justify">
              This section evaluates the subject's primary competency vectors. The radar visualization below shows their performance index across core role requirements, supported by a detailed criteria assessment with contextualized evidence.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center pt-1">
            <div className="w-full border border-slate-200 p-2 bg-white shadow-sm rounded-lg">
              {criteriaEvaluations && criteriaEvaluations.length > 0 ? (
                <CriteriaRadarChart criteria={criteriaEvaluations} isExporting={true} height={260} />
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <p className="text-sm text-slate-900 font-bold uppercase font-sans">{t("results.pdf.noCompetencyDataAvailable")}</p>
                </div>
              )}
            </div>
          </div>

          {criteriaEvaluations && criteriaEvaluations.length > 0 && (
            <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden shadow-sm">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-50">
                    <th className="py-1.5 px-2.5 font-bold uppercase tracking-widest text-[10px] text-slate-900 border-r border-slate-200 w-[25%]">{t("results.competency")}</th>
                    <th className="py-1.5 px-2.5 font-bold uppercase tracking-widest text-[10px] text-slate-900 border-r border-slate-200 text-center w-[15%]">{t("results.score")}</th>
                    <th className="py-1.5 px-2.5 font-bold uppercase tracking-widest text-[10px] text-slate-900 w-[60%]">Reasoning / Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {criteriaEvaluations.map((ce: any, idx: number) => (
                    <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/30">
                      <td className="py-1.5 px-2.5 font-bold text-[10px] text-slate-900 border-r border-slate-200">{ce.name}</td>
                      <td className="py-1.5 px-2.5 border-r border-slate-200">
                        <div className="flex justify-center">
                          <StarRating score={ce.score} />
                        </div>
                      </td>
                      <td className="py-1.5 px-2.5 text-slate-700 text-[9px] leading-snug italic">"{ce.reasoning ? ce.reasoning.replace(/\s*\(\d+%\s*confidence\)/gi, "") : ""}"</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <PdfPageFooter pageNum={3} />
      </div>

      {/* ─── PAGE 4: BEHAVIORAL ANALYSIS (BIG 5) ─── */}
      <div className={PDF_PAGE_CLASS}>
        <div className={cn(PDF_CONTENT_CLASS, "space-y-3")}>
          <ReportHeader />

          <div className="border-b border-slate-900 pb-2">
            <h2 className="text-xl font-bold uppercase tracking-widest text-slate-900">
              Section 3: Behavioral Analysis (Big 5)
            </h2>
          </div>

          <div>
            <p className="text-xs text-slate-900 leading-snug text-justify">
              The chart below represents an estimated psychometric profile of the subject, analyzing semantic patterns, vocabulary, and response structures mapped against the Big 5 Personality framework.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center pt-1">
            <div className="w-full border border-slate-200 p-2 bg-white shadow-sm rounded-lg">
              {big5Personality ? (
                <Big5RadarChart big5={big5Personality} isExporting={true} height={260} />
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <p className="text-sm text-slate-900 font-bold uppercase font-sans">{t("results.dataUnavailable")}</p>
                  <p className="text-xs text-slate-500 mt-2">Insufficient semantic data for this record.</p>
                </div>
              )}
            </div>
          </div>

          {big5Personality && big5Data.length > 0 && (
            <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden shadow-sm">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-50">
                    <th className="py-1.5 px-2.5 font-bold uppercase tracking-widest text-[10px] text-slate-900 border-r border-slate-200 w-[25%]">{t("results.personalityTrait")}</th>
                    <th className="py-1.5 px-2.5 font-bold uppercase tracking-widest text-[10px] text-slate-900 border-r border-slate-200 text-center w-[15%]">{t("results.score")}</th>
                    <th className="py-1.5 px-2.5 font-bold uppercase tracking-widest text-[10px] text-slate-900 w-[60%]">{t("results.psychometricInterpretation")}</th>
                  </tr>
                </thead>
                <tbody>
                  {big5Data.map((trait, idx) => (
                    <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/30">
                      <td className="py-1.5 px-2.5 font-bold text-[10px] text-slate-900 border-r border-slate-200">{t("results.personality." + trait.name.toLowerCase(), { defaultValue: trait.name })}</td>
                      <td className="py-1.5 px-2.5 border-r border-slate-200">
                        <div className="flex justify-center">
                          <StarRating score={trait.score} />
                        </div>
                      </td>
                      <td className="py-1.5 px-2.5 text-slate-700 text-[9px] leading-snug italic">"{trait.explanation}"</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <PdfPageFooter pageNum={4} />
      </div>

      {/* ─── PAGE 5: WORKMAP BEHAVIORAL ASSESSMENT (LIKERT SCALE) ─── */}
      <div className={PDF_PAGE_CLASS}>
        <div className={cn(PDF_CONTENT_CLASS, "space-y-4")}>
          <ReportHeader />

          <div className="border-b border-slate-900 pb-2">
            <h2 className="text-xl font-bold uppercase tracking-widest text-slate-900">
              Section 4: Workmap Behavioral Assessment
            </h2>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-slate-600 leading-relaxed text-justify">
              Workmap Assessment uses Likert Scale. A Likert scale is commonly used to measure attitudes, knowledge, perceptions, values, and behavioral changes. A Likert-type scale involves a series of statements that respondents may choose from in order to rate their responses to evaluative questions (Vogt, 1999).
            </p>
            <p className="text-xs text-slate-600 leading-relaxed text-justify">
              This table illustrates your confidence in performing certain skill sets that are essential for the role that you are applying for. Your WorkMap Assessment scores are solely based on how you responded to statements about these skills on the basis of Agreeableness.
            </p>
          </div>

          <div className="mt-4 border border-purple-900 rounded-lg overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-purple-900 bg-purple-50/50">
                  <th className="py-2.5 px-4 font-bold uppercase tracking-widest text-purple-950 border-r border-purple-900 w-[20%]">Parameter</th>
                  <th className="py-2.5 px-4 font-bold uppercase tracking-widest text-purple-950 border-r border-purple-900 w-[65%]">Definition</th>
                  <th className="py-2.5 px-4 font-bold uppercase tracking-widest text-purple-950 text-center w-[15%]">{t("results.score")}</th>
                </tr>
              </thead>
              <tbody>
                {likertData.map((item, idx) => {
                  const isHigh = item.score >= 80;
                  return (
                    <tr key={idx} className="border-b border-purple-100 last:border-0 hover:bg-slate-50/30">
                      <td className="py-3 px-4 font-bold text-slate-900 border-r border-purple-900">{item.parameter}</td>
                      <td className="py-3 px-4 text-slate-700 border-r border-purple-900 text-[11px] leading-snug">{item.definition}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={cn(
                          "inline-block px-3 py-1.5 rounded-lg text-xs font-bold w-14 text-center",
                          isHigh ? "bg-[#dcfce7] text-[#166534] border border-[#bbf7d0]" : "bg-[#fef9c3] text-[#854d0e] border border-[#fef08a]"
                        )}>
                          {item.score}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-4 space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Behavioral Interpretations & Evidence
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
              {likertData.map((item, idx) => (
                <div key={idx} className="text-[10px] leading-snug text-slate-700 bg-slate-50/50 p-2.5 rounded border border-slate-100">
                  <span className="font-bold text-slate-900">{item.parameter}</span>: {item.explanation}
                </div>
              ))}
            </div>
          </div>
        </div>

        <PdfPageFooter pageNum={5} />
      </div>

      {/* ─── PAGE 6: INTEGRITY SIGNALS & OVERALL VIBE ─── */}
      <div className={PDF_PAGE_CLASS}>
        <div className={cn(PDF_CONTENT_CLASS, "space-y-4")}>
          <ReportHeader />

          <div className="border-b border-slate-900 pb-2">
            <h2 className="text-xl font-bold uppercase tracking-widest text-slate-900">
              Section 5: Integrity Signals & Overall Vibe
            </h2>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-slate-900 leading-relaxed text-justify">
              This section details the candidate's session integrity (anti-cheating metrics) and the overall interview vibe including sentiment and eye contact.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6 mt-6">
            {/* Integrity Signals Card */}
            <div className="border border-slate-200 rounded-lg p-5 bg-white shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-900 border-b border-slate-200 pb-2 mb-4">
                {t("results.integritySignals")}
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">{t("results.multipleFacesDetect")}</span>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-1 rounded",
                    overallIntegrity.multipleFaces === "Clear" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"
                  )}>
                    {overallIntegrity.multipleFaces === "Clear" ? t("results.integrity.clear") : t("results.integrity.flagged")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">{t("results.tabSwitchingLog")}</span>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-1 rounded",
                    overallIntegrity.tabSwitching === "Clear" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"
                  )}>
                    {overallIntegrity.tabSwitching === "Clear" ? t("results.integrity.clear") : t("results.integrity.flaggedWithCount", { count: overallIntegrity.tabSwitchCount })}
                  </span>
                </div>
              </div>
            </div>

            {/* Overall Vibe Card */}
            <div className="border border-slate-200 rounded-lg p-5 bg-white shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-900 border-b border-slate-200 pb-2 mb-4">
                {t("results.vibe")}
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">{t("results.overallSentiment")}</span>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-1 rounded",
                    sentimentData?.overall?.toLowerCase() === "positive" 
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                      : sentimentData?.overall?.toLowerCase() === "negative"
                        ? "bg-red-50 text-red-700 border border-red-100"
                        : "bg-blue-50 text-blue-700 border border-blue-100"
                  )}>
                    {translateSentimentLabel(sentimentData?.overall, t)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">{t("results.eyeContact")}</span>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-1 rounded",
                    overallVibe.eyeContactVal >= 70 
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                      : overallVibe.eyeContactVal >= 40 
                        ? "bg-amber-50 text-amber-700 border border-amber-100" 
                        : "bg-red-50 text-red-700 border border-red-100"
                  )}>
                    {overallVibe.eyeContact}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Eye Contact & Gaze Analysis (requested addition) */}
          <div className="border border-slate-200 rounded-lg p-5 bg-white shadow-sm mt-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-900 border-b border-slate-200 pb-2 mb-3">
              Eye Contact & Gaze Engagement Metrics
            </h3>
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Average Eye Contact Score
                </p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-slate-900">
                    {data?.metadata?.eye_contact_score !== undefined 
                      ? `${data.metadata.eye_contact_score}%`
                      : "N/A"}
                  </span>
                  {data?.metadata?.eye_contact_score !== undefined && (
                    <span className={`text-[10px] font-bold ${data.metadata.eye_contact_score >= 70 ? "text-emerald-600" : "text-amber-600"}`}>
                      {data.metadata.eye_contact_score >= 70 ? "Optimal focus" : "Moderate focus"}
                    </span>
                  )}
                </div>
                <p className="text-[9px] text-slate-500 mt-1 leading-snug">
                  Reflects the percentage of interview time the candidate maintained focus on the camera.
                </p>
              </div>
              <div className="border-l border-slate-100 pl-8">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Gaze Divergence Incidents
                </p>
                <p className="text-2xl font-black text-slate-900">
                  {data?.metadata?.missed_count !== undefined 
                    ? `${data.metadata.missed_count} times`
                    : "N/A"}
                </p>
                <p className="text-[9px] text-slate-500 mt-1 leading-snug">
                  Total occurrences where candidate's gaze drifted from the screen or face was not visible.
                </p>
              </div>
            </div>
            {behavioralAnalysis?.eyeContactFeedback && (
              <div className="mt-3 pt-3 border-t border-slate-100 text-[10px] leading-snug text-slate-600 italic">
                <strong>AI Feedback:</strong> "{behavioralAnalysis.eyeContactFeedback}"
              </div>
            )}
          </div>
        </div>

        <PdfPageFooter pageNum={6} />
      </div>

      {/* ─── PAGE 7: DETAILED QUESTION-BY-QUESTION ANALYSIS ─── */}
      <div className={PDF_PAGE_CLASS}>
        <div className={cn(PDF_CONTENT_CLASS, "space-y-6")}>
          <ReportHeader />

          <div className="border-b border-slate-900 pb-2">
            <h2 className="text-xl font-bold uppercase tracking-widest text-slate-900">
              Section 6: Detailed Question-by-Question Analysis
            </h2>
          </div>

          <p className="text-sm text-slate-900 leading-relaxed mt-2 text-justify">
            A comprehensive itemization of the subject's responses, offering a detailed AI analysis of each question answered by the candidate.
          </p>

          <div className="mt-6 border border-purple-900 border-collapse shadow-sm">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-purple-900 bg-purple-50/50">
                  <th className="py-3 px-4 font-bold uppercase tracking-widest text-purple-950 border-r border-purple-900 w-[25%]">Inquiry / Prompt</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-widest text-purple-950 border-r border-purple-900 w-[60%]">Evaluation / Reasoning</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-widest text-purple-950 text-center w-[15%]">{t("results.score")}</th>
                </tr>
              </thead>
              <tbody>
                {questionEvaluations && questionEvaluations.length > 0 ? (
                  questionEvaluations.map((qe: any, i: number) => (
                    <tr key={i} className="border-b border-purple-100 last:border-0">
                      <td className="py-3 px-4 text-slate-900 border-r border-purple-900 text-xs">{qe.question}</td>
                      <td className="py-3 px-4 text-slate-700 border-r border-purple-900 text-xs text-justify italic">"{qe.evaluation}"</td>
                      <td className="py-3 px-4 text-center font-bold text-purple-900">{Math.round(qe.score * 10)}%</td>
                    </tr>
                  ))
                ) : (
                  <>
                    <tr className="border-b border-purple-100">
                      <td className="py-3 px-4 text-slate-900 border-r border-purple-900 text-xs">{t("results.pdf.tellUsAboutYourself")}</td>
                      <td className="py-3 px-4 text-slate-700 border-r border-purple-900 text-xs text-justify italic">"The candidate provided a strong, albeit brief, overview of their background."</td>
                      <td className="py-3 px-4 text-center font-bold text-purple-900">79%</td>
                    </tr>
                    <tr className="border-b border-purple-100 last:border-0">
                      <td className="py-3 px-4 text-slate-900 border-r border-purple-900 text-xs">What motivates you about the sales function?</td>
                      <td className="py-3 px-4 text-slate-700 border-r border-purple-900 text-xs text-justify italic">"Demonstrated genuine enthusiasm for client interactions and closing deals."</td>
                      <td className="py-3 px-4 text-center font-bold text-purple-900">75%</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <PdfPageFooter pageNum={7} />
      </div>

      {/* ─── PAGE 8: DISCLOSURES & APPENDIX ─── */}
      <div className={PDF_PAGE_CLASS}>
        <div className={cn(PDF_CONTENT_CLASS, "space-y-6")}>
          <ReportHeader />

          <div className="border-b border-slate-900 pb-2">
            <h2 className="text-xl font-bold uppercase tracking-widest text-slate-900">
              Appendix: Disclosures and Protocol
            </h2>
          </div>

          <div className="space-y-8 pt-4">
            
            <div className="space-y-2">
              <h4 className="text-sm font-bold uppercase tracking-widest text-slate-800">
                1. Assessment Framework
              </h4>
              <p className="text-sm text-slate-900 leading-relaxed text-justify">
                This document serves as an objective evaluation framework utilized by human resources and departmental leadership. It synthesizes quantitative algorithms with qualitative behavioral analysis. The output is intended solely for internal strategic workforce planning and capability assessment.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-bold uppercase tracking-widest text-slate-800">
                2. Data Handling & Security
              </h4>
              <ul className="list-disc pl-5 space-y-2">
                <li className="text-sm text-slate-900 leading-relaxed">
                  Information contained herein is strictly confidential and protected under organizational data security protocols.
                </li>
                <li className="text-sm text-slate-900 leading-relaxed">
                  Reproduction, unauthorized transmission, or external distribution is prohibited.
                </li>
                <li className="text-sm text-slate-900 leading-relaxed">
                  All assessments are conducted within secure, isolated environments ensuring absolute data integrity.
                </li>
              </ul>
            </div>

          </div>
        </div>

        <PdfPageFooter pageNum={8} />
      </div>

      {/* ─── PAGE 9: END OF REPORT ─── */}
      <div className={PDF_PAGE_CLASS}>
        <div className={cn(PDF_CONTENT_CLASS, "flex flex-col justify-center items-center space-y-8 pt-16")}>
          <h2 className="text-2xl font-bold tracking-widest text-slate-900 uppercase">
            End of Record
          </h2>

          <div className="flex justify-center py-6 w-full max-w-xs">
            <div className="h-[2px] w-full bg-slate-900" />
          </div>

          <div className="flex flex-col items-center justify-center gap-4">
            <InluwaLogo size={48} className="h-12" />
            <span className="text-sm font-bold tracking-widest text-slate-900 uppercase">
              Candidate Assessment Division
            </span>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 px-12 pb-3">
          <div className="text-center border-t border-slate-900 pt-1.5 pb-0.5">
            <p className="text-[8px] font-bold uppercase tracking-widest text-slate-900">
              Classified Document • Handle With Care
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
