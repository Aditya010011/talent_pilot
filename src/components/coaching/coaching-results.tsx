/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, HelpCircle, Loader2, ChevronLeft } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

interface CoachingResultsProps {
  sessionId?: string;
  candidateId?: string;
  onBack: () => void;
}

export function CoachingResults({ sessionId, candidateId, onBack }: CoachingResultsProps) {
  // If we only have candidateId, we need to find their session.
  // The backend trpc.coachingSession.getById procedure handles fetching details by session ID.
  const targetId = sessionId || "";
  const sessionDetail = trpc.coachingSession.getById.useQuery(
    { id: targetId },
    { enabled: !!targetId }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b pb-4">
        <Button variant="outline" onClick={onBack} size="sm" className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Back to Candidates
        </Button>
        <h2 className="text-xl font-bold text-foreground">Coaching & Quiz Report</h2>
      </div>

      {candidateId && !sessionId && (
        <div className="py-12 text-center text-sm text-muted-foreground border border-dashed rounded-xl bg-muted/10">
          This candidate has not started their training session yet.
        </div>
      )}

      {targetId && (
        <div className="space-y-6">
          {sessionDetail.isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !sessionDetail.data ? (
            <div className="py-12 text-center text-sm text-destructive border rounded-xl bg-destructive/5">
              Failed to load session details.
            </div>
          ) : (() => {
            const s = sessionDetail.data as any;
            const qr = s.quiz_results;
            return (
              <div className="space-y-6">
                {/* Candidate Metadata */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border p-4 rounded-xl bg-muted/30 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground font-semibold block uppercase">Participant</span>
                    <span className="font-bold text-foreground">{s.participantName || "Anonymous"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground font-semibold block uppercase">Email</span>
                    <span className="font-medium text-foreground">{s.participantEmail || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground font-semibold block uppercase">Started At</span>
                    <span className="text-foreground">{s.startedAt ? new Date(s.startedAt).toLocaleString() : "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground font-semibold block uppercase">Completed At</span>
                    <span className="text-foreground">{s.completedAt ? new Date(s.completedAt).toLocaleString() : "N/A"}</span>
                  </div>
                </div>

                {/* Quiz Results Summary */}
                {qr && qr.completed ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card className="border shadow-sm">
                        <CardHeader className="py-3">
                          <CardTitle className="text-xs text-muted-foreground uppercase font-bold">Passing Outcome</CardTitle>
                        </CardHeader>
                        <CardContent className="py-0 pb-3">
                          <Badge variant={qr.passed ? "default" : "destructive"} className="text-sm px-3 py-1 font-bold">
                            {qr.passed ? "PASSED" : "FAILED"}
                          </Badge>
                        </CardContent>
                      </Card>
                      <Card className="border shadow-sm">
                        <CardHeader className="py-3">
                          <CardTitle className="text-xs text-muted-foreground uppercase font-bold">Percentage Score</CardTitle>
                        </CardHeader>
                        <CardContent className="py-0 pb-3">
                          <p className="text-2xl font-extrabold text-primary">
                            {qr.percentageScore ?? 0}% 
                            <span className="text-xs text-muted-foreground font-normal ml-1">
                              (Required: {qr.minPassPercentage ?? 80}%)
                            </span>
                          </p>
                        </CardContent>
                      </Card>
                      <Card className="border shadow-sm">
                        <CardHeader className="py-3">
                          <CardTitle className="text-xs text-muted-foreground uppercase font-bold">Short Answer Average</CardTitle>
                        </CardHeader>
                        <CardContent className="py-0 pb-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-2xl font-extrabold text-amber-500">{qr.shortAnswerAverage || 0}</span>
                            <Star className="h-5 w-5 fill-amber-500 text-amber-500" />
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Answers Breakdown */}
                    <div className="space-y-4">
                      <h4 className="font-bold text-sm border-b pb-2">Questions & Answers Breakdown</h4>
                      <div className="space-y-4">
                        {Array.isArray(qr.answers) && qr.answers.map((ans: any, idx: number) => (
                          <div key={idx} className="border p-4 rounded-xl bg-card space-y-2.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-muted-foreground">Q{idx + 1}</span>
                                <Badge variant="secondary" className="text-[10px]">{ans.type}</Badge>
                              </div>
                              {ans.type === "SHORT_ANSWER" ? (
                                <div className="flex items-center gap-0.5">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <Star
                                      key={i}
                                      className={`h-4 w-4 ${
                                        i < (ans.rating || 0)
                                          ? "fill-amber-500 text-amber-500"
                                          : "text-muted-foreground/30"
                                      }`}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <Badge variant={ans.isCorrect ? "default" : "destructive"}>
                                  {ans.isCorrect ? "Correct" : "Incorrect"}
                                </Badge>
                              )}
                            </div>

                            <p className="text-sm font-semibold text-foreground">{ans.text}</p>
                            
                            <div className="text-xs space-y-1 pl-2 border-l-2 border-muted">
                              <p>
                                <span className="text-muted-foreground font-medium mr-1">Correct Answer:</span>
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                  {Array.isArray(ans.correctAnswer) ? ans.correctAnswer.join(", ") : String(ans.correctAnswer || "N/A")}
                                </span>
                              </p>
                              <p>
                                <span className="text-muted-foreground font-medium mr-1">Candidate Answer:</span>
                                <span className="font-semibold text-foreground">
                                  {Array.isArray(ans.candidateAnswer) ? ans.candidateAnswer.join(", ") : String(ans.candidateAnswer || "N/A")}
                                </span>
                              </p>
                            </div>

                            {ans.type === "SHORT_ANSWER" && ans.comment && (
                              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-xs rounded-lg text-amber-700 dark:text-amber-300">
                                <strong className="block mb-1 font-bold">AI Grading Comment:</strong>
                                {ans.comment}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-sm text-muted-foreground border border-dashed rounded-xl bg-muted/10">
                    This candidate has completed the training slides but has not taken or submitted the quiz yet.
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
