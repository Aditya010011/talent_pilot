"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Wand2, Check, Pencil, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { nanoid } from "@/lib/id";

interface Question {
  id: string;
  type: "MCQ_SINGLE" | "MCQ_MULTIPLE" | "TF" | "SHORT_ANSWER";
  text: string;
  options: string[];
  correctAnswer: string | string[];
}

export function CoachingQuizTab({ trainingId, training }: { trainingId: string; training: any }) {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const settings = training.quiz_settings || {};
  const [timeLimitOn, setTimeLimitOn] = useState(!!settings.timeLimitOn);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(settings.timeLimitMinutes || 30);
  const [minPassPercentage, setMinPassPercentage] = useState(settings.minPassPercentage || 80);

  const initialCounts = settings.questionCounts || { mcq_single: 5, mcq_multiple: 5, tf: 5, short_answer: 5 };
  const [mcqSingleCount, setMcqSingleCount] = useState(initialCounts.mcq_single);
  const [mcqMultipleCount, setMcqMultipleCount] = useState(initialCounts.mcq_multiple);
  const [tfCount, setTfCount] = useState(initialCounts.tf);
  const [shortAnswerCount, setShortAnswerCount] = useState(initialCounts.short_answer);

  const [questions, setQuestions] = useState<Question[]>(training.quiz_questions || []);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  // Temporary edit states
  const [editText, setEditText] = useState("");
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [editCorrectAnswer, setEditCorrectAnswer] = useState<string | string[]>([]);

  const totalDesired = mcqSingleCount + mcqMultipleCount + tfCount + shortAnswerCount;

  const updateMutation = trpc.training.update.useMutation({
    onSuccess: () => {
      toast({ title: "Quiz saved successfully" });
      utils.training.getById.invalidate({ id: trainingId });
    },
    onError: (err) => toast({ title: "Error saving quiz", description: err.message, variant: "destructive" }),
  });

  const generateMutation = trpc.training.generateQuizQuestions.useMutation({
    onSuccess: async (data) => {
      setQuestions(data);
      // Automatically save to DB
      await updateMutation.mutateAsync({
        id: trainingId,
        quiz_questions: data,
      });
      toast({ title: "Questions generated and saved!" });
    },
    onError: (err) => toast({ title: "Error generating questions", description: err.message, variant: "destructive" }),
  });

  const [quizEnabled, setQuizEnabled] = useState(settings.enabled !== false);

  const handleSaveSettings = () => {
    if (totalDesired > 30) {
      toast({ title: "Validation Error", description: "Total desired questions count cannot exceed 30.", variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      id: trainingId,
      quiz_settings: {
        enabled: quizEnabled,
        timeLimitOn,
        timeLimitMinutes: timeLimitOn ? timeLimitMinutes : null,
        minPassPercentage,
        questionCounts: {
          mcq_single: mcqSingleCount,
          mcq_multiple: mcqMultipleCount,
          tf: tfCount,
          short_answer: shortAnswerCount,
        },
      },
    });
  };

  const handleGenerateQuestions = () => {
    if (totalDesired > 30) {
      toast({ title: "Validation Error", description: "Total desired questions count cannot exceed 30.", variant: "destructive" });
      return;
    }
    generateMutation.mutate({
      trainingId,
      counts: {
        mcq_single: mcqSingleCount,
        mcq_multiple: mcqMultipleCount,
        tf: tfCount,
        short_answer: shortAnswerCount,
      },
    });
  };

  const handleAddQuestion = () => {
    const newQ: Question = {
      id: nanoid(8),
      type: "MCQ_SINGLE",
      text: "New Question Text?",
      options: ["Option A", "Option B", "Option C", "Option D"],
      correctAnswer: "Option A",
    };
    const updated = [...questions, newQ];
    setQuestions(updated);
    updateMutation.mutate({ id: trainingId, quiz_questions: updated });
  };

  const handleDeleteQuestion = (id: string) => {
    const updated = questions.filter((q) => q.id !== id);
    setQuestions(updated);
    updateMutation.mutate({ id: trainingId, quiz_questions: updated });
  };

  const startEditQuestion = (q: Question) => {
    setEditingQuestionId(q.id);
    setEditText(q.text);
    setEditOptions([...q.options]);
    setEditCorrectAnswer(q.correctAnswer);
  };

  const saveEditQuestion = (id: string) => {
    const updated = questions.map((q) => {
      if (q.id === id) {
        return {
          ...q,
          text: editText,
          options: editOptions,
          correctAnswer: editCorrectAnswer,
        };
      }
      return q;
    });
    setQuestions(updated);
    setEditingQuestionId(null);
    updateMutation.mutate({ id: trainingId, quiz_questions: updated });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border p-4 rounded-xl bg-card">
        <div className="space-y-0.5">
          <Label className="font-bold text-sm">Enable Quiz for this Coaching</Label>
          <p className="text-xs text-muted-foreground">When disabled, learners will not be tested after reviewing slides.</p>
        </div>
        <Switch
          checked={quizEnabled}
          onCheckedChange={(val) => {
            setQuizEnabled(val);
            updateMutation.mutate({
              id: trainingId,
              quiz_settings: {
                ...settings,
                enabled: val,
              },
            });
          }}
        />
      </div>

      {quizEnabled ? (
        <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Quiz Settings</CardTitle>
            <CardDescription>Configure quiz limits & question counts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between border p-3 rounded-lg bg-card">
              <div className="space-y-0.5">
                <Label className="font-bold text-sm">Time Limit</Label>
                <p className="text-xs text-muted-foreground">Limit quiz time</p>
              </div>
              <Switch checked={timeLimitOn} onCheckedChange={setTimeLimitOn} />
            </div>

            <div className="space-y-2 border p-3 rounded-lg bg-card">
              <Label className="font-bold text-sm">Minimum Passing Score (%)</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={minPassPercentage}
                onChange={(e) => setMinPassPercentage(Math.min(100, Math.max(1, Number(e.target.value))))}
              />
            </div>

            {timeLimitOn && (
              <div className="space-y-2 border p-3 rounded-lg bg-card">
                <Label className="font-bold text-sm">Time Limit (Minutes)</Label>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={timeLimitMinutes}
                  onChange={(e) => setTimeLimitMinutes(Math.min(120, Math.max(1, Number(e.target.value))))}
                />
              </div>
            )}

            <div className="space-y-3 border p-4 rounded-lg bg-card">
              <Label className="font-bold text-sm block border-b pb-2">Questions Count</Label>
              <div className="space-y-2">
                <div className="flex justify-between items-center gap-2">
                  <Label className="text-xs font-semibold">MCQ (Single)</Label>
                  <Input
                    className="w-20 h-8"
                    type="number"
                    value={mcqSingleCount}
                    onChange={(e) => setMcqSingleCount(Math.max(0, Number(e.target.value)))}
                  />
                </div>
                <div className="flex justify-between items-center gap-2">
                  <Label className="text-xs font-semibold">MCQ (Multiple)</Label>
                  <Input
                    className="w-20 h-8"
                    type="number"
                    value={mcqMultipleCount}
                    onChange={(e) => setMcqMultipleCount(Math.max(0, Number(e.target.value)))}
                  />
                </div>
                <div className="flex justify-between items-center gap-2">
                  <Label className="text-xs font-semibold">True / False</Label>
                  <Input
                    className="w-20 h-8"
                    type="number"
                    value={tfCount}
                    onChange={(e) => setTfCount(Math.max(0, Number(e.target.value)))}
                  />
                </div>
                <div className="flex justify-between items-center gap-2">
                  <Label className="text-xs font-semibold">Short Answer</Label>
                  <Input
                    className="w-20 h-8"
                    type="number"
                    value={shortAnswerCount}
                    onChange={(e) => setShortAnswerCount(Math.max(0, Number(e.target.value)))}
                  />
                </div>
              </div>

              <div className="mt-3 pt-2 border-t flex justify-between items-center text-xs font-bold">
                <span>Total Desired:</span>
                <span className={totalDesired > 30 ? "text-destructive" : "text-emerald-500"}>
                  {totalDesired} / 30
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button onClick={handleSaveSettings} disabled={updateMutation.isPending} className="w-full">
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Settings
              </Button>

              <Button
                variant="outline"
                onClick={handleGenerateQuestions}
                disabled={generateMutation.isPending || totalDesired === 0 || totalDesired > 30}
                className="w-full border-primary text-primary hover:bg-primary/5"
              >
                {generateMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-2 h-4 w-4" />
                )}
                Generate Quiz with AI
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Quiz Questions</CardTitle>
              <CardDescription>Manage and edit quiz questions manually</CardDescription>
            </div>
            <Button onClick={handleAddQuestion} size="sm">
              <Plus className="mr-1 h-4 w-4" /> Add Question
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {questions.length === 0 ? (
              <div className="text-center py-12 border border-dashed rounded-lg bg-muted/20">
                <p className="text-sm text-muted-foreground">No questions generated yet. Configure counts and click "Generate Quiz with AI".</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                {questions.map((q, idx) => (
                  <div key={q.id} className="border p-4 rounded-lg bg-card space-y-3 relative group">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-muted-foreground">Q{idx + 1}</span>
                        <Badge variant="secondary">{q.type}</Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        {editingQuestionId !== q.id ? (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEditQuestion(q)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteQuestion(q.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-500" onClick={() => saveEditQuestion(q.id)}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setEditingQuestionId(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {editingQuestionId !== q.id ? (
                      <div className="space-y-2">
                        <p className="font-semibold text-sm">{q.text}</p>
                        {q.options && q.options.length > 0 && (
                          <div className="grid grid-cols-2 gap-2 pl-4">
                            {q.options.map((opt, oIdx) => (
                              <div key={oIdx} className="text-xs text-muted-foreground flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                                <span>{opt}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          Correct Answer: {Array.isArray(q.correctAnswer) ? q.correctAnswer.join(", ") : String(q.correctAnswer)}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Question Text</Label>
                          <Input value={editText} onChange={(e) => setEditText(e.target.value)} />
                        </div>

                        {q.type !== "SHORT_ANSWER" && q.type !== "TF" && (
                          <div className="space-y-2">
                            <Label className="text-xs font-bold">Options</Label>
                            <div className="grid grid-cols-2 gap-2">
                              {editOptions.map((opt, oIdx) => (
                                <Input
                                  key={oIdx}
                                  value={opt}
                                  onChange={(e) => {
                                    const nextOpts = [...editOptions];
                                    nextOpts[oIdx] = e.target.value;
                                    setEditOptions(nextOpts);
                                  }}
                                  placeholder={`Option ${oIdx + 1}`}
                                  className="h-8 text-xs"
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Correct Answer</Label>
                          {q.type === "TF" ? (
                            <Select value={String(editCorrectAnswer)} onValueChange={setEditCorrectAnswer}>
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="True">True</SelectItem>
                                <SelectItem value="False">False</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : q.type === "MCQ_MULTIPLE" ? (
                            <div className="space-y-1.5 pl-2">
                              <p className="text-[10px] text-muted-foreground mb-1">Select all correct options (comma-separated):</p>
                              <Input
                                value={Array.isArray(editCorrectAnswer) ? editCorrectAnswer.join(", ") : ""}
                                onChange={(e) => setEditCorrectAnswer(e.target.value.split(",").map((s) => s.trim()))}
                                placeholder="Option A, Option C"
                                className="h-8"
                              />
                            </div>
                          ) : (
                            <Input
                              value={String(editCorrectAnswer)}
                              onChange={(e) => setEditCorrectAnswer(e.target.value)}
                              placeholder={q.type === "SHORT_ANSWER" ? "Sample/model answer criteria..." : "e.g. Option A"}
                              className="h-8"
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      ) : (
        <div className="p-8 border border-dashed rounded-xl text-center text-muted-foreground text-sm bg-muted/10">
          Coaching Quiz is disabled. Click the switch above to enable and configure the quiz.
        </div>
      )}
    </div>
  );
}
