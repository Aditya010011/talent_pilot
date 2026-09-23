"use client";

import { InterviewResults } from "@/components/interview/interview-results";
import { CandidateManager } from "@/components/interview/candidate-manager";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useEditInterview } from "../edit-context";

export default function SessionsTab() {
  const { interview, interviewId } = useEditInterview();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const sessionId = searchParams.get("session") || undefined;
  const candidateId = searchParams.get("candidate") || undefined;

  const selectedParticipant = sessionId 
    ? { id: sessionId, type: "session" as const } 
    : candidateId 
      ? { id: candidateId, type: "candidate" as const } 
      : null;

  const handleViewParticipant = (id: string, type: "session" | "candidate") => {
    const params = new URLSearchParams(searchParams.toString());
    if (type === "session") {
      params.set("session", id);
      params.delete("candidate");
    } else {
      params.set("candidate", id);
      params.delete("session");
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleBack = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("session");
    params.delete("candidate");
    router.push(`${pathname}?${params.toString()}`);
  };

  if (selectedParticipant) {
    return (
      <InterviewResults
        interviewId={interviewId}
        initialSessionId={selectedParticipant.type === "session" ? selectedParticipant.id : undefined}
        initialCandidateId={selectedParticipant.type === "candidate" ? selectedParticipant.id : undefined}
        onBack={handleBack}
      />
    );
  }

  return (
    <CandidateManager
      interviewId={interviewId}
      interview={interview}
      onViewParticipant={handleViewParticipant}
    />
  );
}
