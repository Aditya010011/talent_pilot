"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { QuestionBuilder } from "@/components/interview/question-builder";
import { useEditInterview } from "../edit-context";

export default function ContentTab() {
  const { interview, interviewId, isViewer } = useEditInterview();

  return (
    <QuestionBuilder
      interviewId={interviewId}
      isViewer={isViewer}
      isVoiceOnly={Boolean(interview.is_voice_only)}
      pregeneratedVideos={interview.pregenerated_videos}
      aiName="Inluwa"
      questions={(interview as any).questions.map((q: any) => ({
        ...q,
        starterCode: q.starterCode as { language: string; code: string } | null,
      }))}
      assessmentCriteria={
        (interview as any).assessmentCriteria as
          | { name: string; description: string }[]
          | null
      }
      cvAssessmentCriteria={(interview as any).cvAssessmentCriteria}
      cvJdAlignmentCriteria={(interview as any).cvJdAlignmentCriteria}
    />
  );
}
