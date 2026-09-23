"use client";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc/client";
import { FileText, Loader2, Plus, Pencil, Trash2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Criterion = { name: string; description: string };
type Question = { order: number; text: string; type: "OPEN_ENDED"; isRequired: boolean };

type Template = {
  id: string;
  jobType: string;
  title: string;
  jobDescription: string;
  scoringRubric: Criterion[] | null;
  interviewQuestions: Question[] | null;
};

function TemplateForm({
  initial,
  onSave,
  onClose,
  saving,
}: {
  initial?: Template;
  onSave: (data: {
    jobType: string;
    title: string;
    jobDescription: string;
    scoringRubric: Criterion[];
    interviewQuestions: Question[];
  }) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [jobType, setJobType] = useState(initial?.jobType ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [jobDescription, setJobDescription] = useState(initial?.jobDescription ?? "");

  const [rubricList, setRubricList] = useState<Criterion[]>(initial?.scoringRubric ?? []);
  const [criterionName, setCriterionName] = useState("");
  const [criterionDesc, setCriterionDesc] = useState("");

  const [questionsList, setQuestionsList] = useState<Question[]>(initial?.interviewQuestions ?? []);
  const [questionText, setQuestionText] = useState("");

  const { toast } = useToast();

  const handleSave = () => {
    if (!jobType.trim() || !title.trim() || !jobDescription.trim()) {
      toast({ title: "Please fill in Job Category, Role Title, and Job Description." });
      return;
    }
    if (rubricList.length === 0) {
      toast({ title: "Please add at least one scoring criterion." });
      return;
    }
    if (questionsList.length === 0) {
      toast({ title: "Please add at least one interview question." });
      return;
    }
    onSave({ jobType, title, jobDescription, scoringRubric: rubricList, interviewQuestions: questionsList });
  };

  return (
    <>
      <div className="space-y-4 py-2 text-left">
        {/* Job Category */}
        <div className="space-y-1.5">
          <Label htmlFor="tpl-type">Job Category <span className="text-destructive">*</span></Label>
          <Input
            id="tpl-type"
            placeholder="e.g. Technology, Marketing, Sales..."
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
            className="rounded-xl border-border/80"
          />
        </div>
        {/* Role Title */}
        <div className="space-y-1.5">
          <Label htmlFor="tpl-title">Role Title <span className="text-destructive">*</span></Label>
          <Input
            id="tpl-title"
            placeholder="e.g. Junior UI/UX Designer..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-xl border-border/80"
          />
        </div>
        {/* Job Description */}
        <div className="space-y-1.5">
          <Label htmlFor="tpl-desc">Job Description <span className="text-destructive">*</span></Label>
          <Textarea
            id="tpl-desc"
            placeholder="Paste the full job description here..."
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            rows={4}
            className="resize-none rounded-xl border-border/80 text-xs"
          />
        </div>

        {/* Scoring Rubric */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Scoring Rubric <span className="text-destructive">*</span>
          </Label>
          {rubricList.length > 0 ? (
            <div className="space-y-1.5 mb-2 max-h-40 overflow-y-auto pr-1 code-scrollbar">
              {rubricList.map((c, idx) => (
                <div key={idx} className="flex items-start justify-between bg-muted/40 p-2 rounded-xl border text-xs">
                  <div className="flex-1">
                    <span className="font-bold text-foreground">{c.name}</span>
                    {": "}
                    <span className="text-muted-foreground">{c.description}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRubricList(rubricList.filter((_, i) => i !== idx))}
                    className="text-destructive hover:text-destructive/80 ml-2 shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground italic mb-2">No criteria added yet.</p>
          )}
          <div className="space-y-2 border p-3 rounded-2xl bg-muted/10">
            <Input
              placeholder="Criterion name (e.g. Problem Solving)"
              value={criterionName}
              onChange={(e) => setCriterionName(e.target.value)}
              className="rounded-xl border-border/80 text-xs"
            />
            <div className="flex gap-2">
              <Textarea
                placeholder="Description..."
                value={criterionDesc}
                onChange={(e) => setCriterionDesc(e.target.value)}
                rows={2}
                className="resize-none rounded-xl border-border/80 text-xs flex-1"
              />
              <Button
                type="button"
                onClick={() => {
                  if (!criterionName.trim() || !criterionDesc.trim()) return;
                  setRubricList([...rubricList, { name: criterionName.trim(), description: criterionDesc.trim() }]);
                  setCriterionName("");
                  setCriterionDesc("");
                }}
                className="bg-primary/10 text-primary hover:bg-primary/20 rounded-xl self-end px-3.5"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Interview Questions */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Interview Questions <span className="text-destructive">*</span>
          </Label>
          {questionsList.length > 0 ? (
            <div className="space-y-1.5 mb-2 max-h-40 overflow-y-auto pr-1 code-scrollbar">
              {questionsList.map((q, idx) => (
                <div key={idx} className="flex items-start justify-between bg-muted/40 p-2 rounded-xl border text-xs">
                  <div className="flex-1">
                    <span className="font-semibold text-muted-foreground">Q{q.order}:</span> {q.text}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = questionsList
                        .filter((_, i) => i !== idx)
                        .map((item, i) => ({ ...item, order: i + 1 }));
                      setQuestionsList(updated);
                    }}
                    className="text-destructive hover:text-destructive/80 ml-2 shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground italic mb-2">No questions added yet.</p>
          )}
          <div className="border p-3 rounded-2xl bg-muted/10">
            <div className="flex gap-2">
              <Textarea
                placeholder="Question text (e.g. How would you approach designing a scalable API?)"
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                rows={2}
                className="resize-none rounded-xl border-border/80 text-xs flex-1"
              />
              <Button
                type="button"
                onClick={() => {
                  if (!questionText.trim()) return;
                  setQuestionsList([
                    ...questionsList,
                    { order: questionsList.length + 1, text: questionText.trim(), type: "OPEN_ENDED", isRequired: true },
                  ]);
                  setQuestionText("");
                }}
                className="bg-primary/10 text-primary hover:bg-primary/20 rounded-xl self-end px-3.5"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter className="flex items-center justify-end gap-2 pt-4">
        <Button variant="ghost" onClick={onClose} className="rounded-xl">
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 rounded-full px-6 shadow-md shadow-primary/20"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {initial ? "Save Changes" : "Create Template"}
        </Button>
      </DialogFooter>
    </>
  );
}

export default function TemplatesSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: isSystemAdmin = false } = trpc.user.isSystemAdmin.useQuery(undefined, {
    enabled: !!user,
  });

  // Redirect non-admins away
  if (!isSystemAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
        <ShieldAlert className="h-12 w-12 text-muted-foreground/40" />
        <h2 className="text-lg font-semibold text-foreground">Access Restricted</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Only the system administrator can manage job templates.
        </p>
        <Button variant="outline" onClick={() => router.push("/settings")} className="rounded-xl mt-2">
          Back to Settings
        </Button>
      </div>
    );
  }

  const { data: templates, isLoading, refetch } = trpc.jobTemplate.list.useQuery();

  const createMutation = trpc.jobTemplate.create.useMutation({
    onSuccess: () => {
      toast({ title: "Template created successfully!" });
      setCreateOpen(false);
      refetch();
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = trpc.jobTemplate.update.useMutation({
    onSuccess: () => {
      toast({ title: "Template updated successfully!" });
      setEditTarget(null);
      refetch();
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = trpc.jobTemplate.delete.useMutation({
    onSuccess: () => {
      toast({ title: "Template deleted." });
      refetch();
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Template | null>(null);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">Job Templates</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage global interview templates. Every template you add here is available to all workspace accounts.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-primary hover:bg-primary/90 rounded-full px-5 shadow-md shadow-primary/20 shrink-0"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Template
        </Button>
      </div>

      {/* Template List */}
      <Card>
        <CardHeader>
          <CardTitle>All Templates</CardTitle>
          <CardDescription>
            {templates?.length ?? 0} template{(templates?.length ?? 0) !== 1 ? "s" : ""} available across the platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !templates || templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground space-y-3">
              <FileText className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm">No job templates yet. Click &ldquo;Add Template&rdquo; to create the first one.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2 code-scrollbar">
              {templates.map((t) => {
                const rubric = Array.isArray(t.scoringRubric) ? (t.scoringRubric as Criterion[]) : [];
                const questions = Array.isArray(t.interviewQuestions) ? (t.interviewQuestions as Question[]) : [];
                return (
                  <div
                    key={t.id}
                    className="flex items-start gap-4 p-4 rounded-2xl border bg-card hover:border-primary/30 transition-all"
                  >
                    <div className="h-10 w-10 rounded-xl bg-muted/60 flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5 text-muted-foreground/80" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-foreground truncate">{t.title}</h4>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold shrink-0">
                          {t.jobType}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.jobDescription}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] text-muted-foreground">
                          {rubric.length} criterion{rubric.length !== 1 ? "a" : ""} &middot;{" "}
                          {questions.length} question{questions.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditTarget({ ...t, scoringRubric: rubric, interviewQuestions: questions })}
                        className="rounded-xl h-8 w-8 p-0"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-xl h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Template?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete &ldquo;{t.title}&rdquo; from the platform. Users will no longer be able to select it when creating interviews.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate({ id: t.id })}
                              className="bg-destructive hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg w-[90vw] p-6 rounded-2xl bg-card border max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Add New Job Template</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              This template will be saved globally and available to all workspace users when creating interviews.
            </DialogDescription>
          </DialogHeader>
          <TemplateForm
            onSave={(data) => createMutation.mutate(data)}
            onClose={() => setCreateOpen(false)}
            saving={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-w-lg w-[90vw] p-6 rounded-2xl bg-card border max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Edit Template</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Changes will apply globally — all users will see the updated template.
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <TemplateForm
              initial={editTarget}
              onSave={(data) => updateMutation.mutate({ id: editTarget.id, ...data })}
              onClose={() => setEditTarget(null)}
              saving={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
