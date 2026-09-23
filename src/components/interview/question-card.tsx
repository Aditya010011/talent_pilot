"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { CodeBlock } from "@/components/code-editor/code-block";
import { CodeEditorCanvas, SUPPORTED_LANGUAGES } from "@/components/code-editor/code-editor-canvas";
import { cn } from "@/lib/utils";
import {
  Check,
  CircleDot,
  Code2,
  Eye,
  GripVertical,
  ListChecks,
  Loader2,
  MessageSquare,
  Microscope,
  Pencil,
  PenLine,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

const getStarterCodeForLanguage = (language: string): string => {
  switch (language) {
    case "javascript":
    case "typescript":
      return `function calculateCommission(salesAmount) {\n  // Write your logic here\n  return 0.0;\n}`;
    case "python":
      return `def calculate_commission(sales_amount: float) -> float:\n    # Write your logic here\n    return 0.0`;
    case "go":
      return `package main\n\nfunc calculateCommission(salesAmount float64) float64 {\n\t// Write your logic here\n\treturn 0.0\n}`;
    case "rust":
      return `fn calculate_commission(sales_amount: f64) -> f64 {\n    // Write your logic here\n    0.0\n}`;
    case "java":
      return `public class Solution {\n    public static double calculateCommission(double salesAmount) {\n        // Write your logic here\n        return 0.0;\n    }\n}`;
    case "cpp":
      return `double calculateCommission(double salesAmount) {\n    // Write your logic here\n    return 0.0;\n}`;
    case "c":
      return `double calculateCommission(double salesAmount) {\n    // Write your logic here\n    return 0.0;\n}`;
    case "sql":
      return `CREATE OR REPLACE FUNCTION calculate_commission(sales_amount NUMERIC)\nRETURNS NUMERIC AS $$\nBEGIN\n  -- Write your logic here\n  RETURN 0.0;\nEND;\n$$ LANGUAGE plpgsql;`;
    case "css":
      return `.commission-calculator {\n  /* Write your styles here */\n  display: block;\n}`;
    case "html":
      return `<!-- Write your HTML structure here -->\n<div class="commission-calculator">\n</div>`;
    case "json":
      return `{\n  "salesAmount": 0.0,\n  "commission": 0.0\n}`;
    case "markdown":
      return `# Commission Calculator\n\nWrite your implementation notes here.`;
    case "shell":
      return `#!/bin/bash\n# Write your script here\nsales_amount=$1\ncommission=0\necho $commission`;
    default:
      return `// Write your code here`;
  }
};

/* ------------------------------------------------------------------ */
/*  Shared constants                                                   */
/* ------------------------------------------------------------------ */

export const QUESTION_TYPES = [
  { value: "OPEN_ENDED", label: "Open Ended" },
  { value: "CODING", label: "Coding" },
] as const;

export const QUESTION_TYPE_STYLES: Record<
  string,
  {
    icon: React.ElementType;
    label: string;
    badgeClass: string;
    optionClass: string;
  }
> = {
  OPEN_ENDED: {
    icon: MessageSquare,
    label: "Open Ended",
    badgeClass:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
    optionClass: "",
  },
  CODING: {
    icon: Code2,
    label: "Coding",
    badgeClass:
      "border-secondary-200 bg-secondary-50 text-secondary-700 dark:border-secondary-800 dark:bg-secondary-900/30 dark:text-secondary-300",
    optionClass: "",
  },
};

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface QuestionCardData {
  text: string;
  type: string;
  description?: string | null;
  isRequired: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options?: { options: string[]; allowMultiple?: boolean } | any;
  starterCode?: { language: string; code: string; templates?: Record<string, string> } | null;
}

interface QuestionCardProps {
  data: QuestionCardData;
  index: number;
  editing: boolean;
  onStartEdit: () => void;
  onSave: (data: QuestionCardData) => void;
  onCancel: () => void;
  onDelete: () => void;
  /** Hide the Delete button (useful for newly-added questions). */
  hideDelete?: boolean;
  /** Show loading spinner on the Done button. */
  saving?: boolean;
  /** Show loading spinner on the Delete confirmation. */
  deleting?: boolean;
  isViewer?: boolean;
  dragProps?: {
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  /** Non-interactive: per-question pregenerated clip controls. */
  videoClip?: {
    url?: string;
    status: "ready" | "processing" | "missing" | "stale";
    onPreview: () => void;
    onRegenerate?: () => void;
  };
  className?: string;
}

function VideoClipControls({
  videoClip,
}: {
  videoClip: NonNullable<QuestionCardProps["videoClip"]>;
}) {
  const { url, status, onPreview } = videoClip;
  const processing = status === "processing";
  const canPreview = !!url;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      {status === "stale" && (
        <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-200">
          Video out of date
        </Badge>
      )}
      {status === "missing" && !processing && (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          No video yet
        </Badge>
      )}
      {processing && (
        <Badge variant="outline" className="text-[10px] gap-1">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          {status === "missing" ? "Generating…" : "Regenerating…"}
        </Badge>
      )}
      {videoClip.onRegenerate && !processing && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          title="Regenerate video"
          onClick={videoClip.onRegenerate}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        disabled={!canPreview}
        onClick={onPreview}
      >
        <Eye className="mr-1 h-3 w-3" />
        Preview the video
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function QuestionCard({
  data,
  index,
  editing,
  onStartEdit,
  onSave,
  onCancel,
  onDelete,
  hideDelete,
  saving,
  deleting,
  dragProps,
  isViewer,
  videoClip,
  className,
}: QuestionCardProps) {
  const [local, setLocal] = useState<QuestionCardData>(() =>
    structuredClone(data),
  );

  // Re-clone from parent when entering edit mode
  useEffect(() => {
    if (editing) {
      setLocal(structuredClone(data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const update = (updates: Partial<QuestionCardData>) => {
    setLocal((prev) => ({ ...prev, ...updates }));
  };

  const handleSave = () => {
    if (!local.text.trim()) return;
    onSave(local);
  };

  const displayData = editing ? local : data;
  const style =
    QUESTION_TYPE_STYLES[displayData.type] ?? QUESTION_TYPE_STYLES.OPEN_ENDED;
  const TypeIcon = style.icon;

  return (
    <div
      draggable={dragProps?.draggable && !editing && !isViewer}
      onDragStart={!editing ? dragProps?.onDragStart : undefined}
      onDragOver={!editing ? dragProps?.onDragOver : undefined}
      onDragLeave={!editing ? dragProps?.onDragLeave : undefined}
      onDrop={!editing ? dragProps?.onDrop : undefined}
      onDragEnd={!editing ? dragProps?.onDragEnd : undefined}
      className={cn(
        "group rounded-lg border p-3 transition-all",
        !editing && "hover:border-primary/30",
        className,
      )}
    >
      {editing ? (
        /* -------- Edit mode -------- */
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
              {index + 1}
            </span>
            <div className="flex-1 space-y-3">
              {/* Question text */}
              <div className="space-y-1">
                <Label className="text-xs">Question text</Label>
                <Textarea
                  value={local.text}
                  onChange={(e) => update({ text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSave();
                    }
                  }}
                  rows={2}
                  className="resize-y"
                  placeholder="Enter the question..."
                  autoFocus
                />
                {videoClip && (
                  <VideoClipControls videoClip={videoClip} />
                )}
              </div>

              {/* Type + Description */}
              <div className="flex gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={local.type}
                    onValueChange={(v) => {
                      const updates: Partial<QuestionCardData> = { type: v };
                      if (
                        (v === "SINGLE_CHOICE" || v === "MULTIPLE_CHOICE") &&
                        !local.options
                      ) {
                        updates.options = {
                          options: ["", ""],
                          allowMultiple: v === "MULTIPLE_CHOICE",
                        };
                      }
                      if (v === "SINGLE_CHOICE" && local.options) {
                        updates.options = { ...local.options, allowMultiple: false };
                      }
                      if (v === "MULTIPLE_CHOICE" && local.options) {
                        updates.options = { ...local.options, allowMultiple: true };
                      }
                      if (v === "OPEN_ENDED" || v === "CODING" || v === "WHITEBOARD" || v === "RESEARCH") {
                        updates.options = undefined;
                      }
                      update(updates);
                    }}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUESTION_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Description (optional)</Label>
                  <Input
                    value={local.description ?? ""}
                    onChange={(e) =>
                      update({ description: e.target.value || undefined })
                    }
                    placeholder="Helper text for the interviewee..."
                  />
                </div>
              </div>

              {/* Choice options editor */}
              {(local.type === "SINGLE_CHOICE" ||
                local.type === "MULTIPLE_CHOICE") && (
                <div className="space-y-2">
                  <Label className="text-xs">Options</Label>
                  <div className="space-y-1.5">
                    {(local.options?.options ?? []).map(
                      (opt: string, oi: number) => (
                        <div key={oi} className="flex items-center gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                            {String.fromCharCode(65 + oi)}
                          </span>
                          <Input
                            value={opt}
                            onChange={(e) => {
                              const newOpts = [...(local.options?.options ?? [])];
                              newOpts[oi] = e.target.value;
                              update({
                                options: {
                                  ...local.options,
                                  options: newOpts,
                                  allowMultiple: local.options?.allowMultiple ?? false,
                                },
                              });
                            }}
                            placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                            className="h-8 flex-1 text-sm"
                          />
                          {(local.options?.options?.length ?? 0) > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() => {
                                const newOpts = (local.options?.options ?? []).filter(
                                  (_: string, idx: number) => idx !== oi,
                                );
                                update({
                                  options: {
                                    ...local.options,
                                    options: newOpts,
                                    allowMultiple: local.options?.allowMultiple ?? false,
                                  },
                                });
                              }}
                            >
                              <X className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 w-full border-dashed text-xs"
                    onClick={() => {
                      const newOpts = [...(local.options?.options ?? []), ""];
                      update({
                        options: {
                          ...local.options,
                          options: newOpts,
                          allowMultiple: local.options?.allowMultiple ?? false,
                        },
                      });
                    }}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add Option
                  </Button>
                </div>
              )}

              {/* Starter code editor */}
              {local.type === "CODING" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Starter Code</Label>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`lang-select-${index}`} className="text-xs text-muted-foreground">Language</Label>

                      <Select
                        value={local.starterCode?.language ?? "javascript"}
                        onValueChange={(lang) => {
                          setLocal((prev) => ({
                            ...prev,
                            starterCode: {
                              language: lang,
                              code: getStarterCodeForLanguage(lang),
                            },
                          }));
                        }}
                      >
                        <SelectTrigger id={`lang-select-${index}`} className="h-8 w-32 border-zinc-800 text-xs bg-zinc-950">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SUPPORTED_LANGUAGES.map((lang) => (
                            <SelectItem key={lang.value} value={lang.value} className="text-xs">
                              {lang.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div
                    className="overflow-auto rounded-md border border-zinc-800 code-scrollbar"
                    style={{
                      height: `${Math.max(
                        200,
                        ((local.starterCode?.code ?? "").split("\n").length + 2) * 20 + 40,
                      )}px`,
                      minHeight: 120,
                    }}
                  >
                    <CodeEditorCanvas
                      key={`code-editor-${index}-${local.starterCode?.language ?? "javascript"}`}
                      fillParent
                      dark
                      initialData={JSON.stringify({
                        code: local.starterCode?.code ?? "",
                        language: local.starterCode?.language ?? "javascript",
                      })}
                      onAutoSave={(snapshot) => {
                        try {
                          const parsed = JSON.parse(snapshot);
                          setLocal((prev) => ({
                            ...prev,
                            starterCode: {
                              language: parsed.language,
                              code: parsed.code,
                            },
                          }));
                        } catch {
                          /* ignore */
                        }
                      }}
                      autoSaveInterval={500}
                    />
                  </div>
                </div>
              )}

              {/* Required toggle */}
              <div className="flex items-center gap-2">
                <Switch
                  checked={local.isRequired}
                  onCheckedChange={(checked) => update({ isRequired: checked })}
                  id={`required-${index}`}
                />
                <Label htmlFor={`required-${index}`} className="text-xs">
                  Required
                </Label>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2">
            {!hideDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={saving || deleting}
                  >
                    {deleting ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1 h-3 w-3" />
                    )}
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete question?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove this question. This action
                      cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={onDelete}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button
              size="sm"
              variant="outline"
              className="border-foreground/50 hover:bg-foreground/5"
              onClick={onCancel}
              disabled={saving || deleting}
            >
              <X className="mr-1 h-3 w-3" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || deleting || !local.text.trim()}
            >
              {saving ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Check className="mr-1 h-3 w-3" />
              )}
              Done
            </Button>
          </div>
        </div>
      ) : (
        /* -------- View mode -------- */
        <div className="flex gap-3">
          {dragProps && (
            <div
              className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
            </div>
          )}
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
            {index + 1}
          </span>
          <div className={cn("flex-1", !isViewer && "cursor-pointer")} onClick={isViewer ? undefined : onStartEdit}>
            <p className="font-medium">
              {data.text || (
                <span className="italic text-muted-foreground">
                  Empty question — click to edit
                </span>
              )}
            </p>
            {data.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {data.description}
              </p>
            )}
            {(data.type === "SINGLE_CHOICE" || data.type === "MULTIPLE_CHOICE") &&
              (data.options?.options?.length ?? 0) > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {(data.options?.options ?? [])
                    .slice(0, 4)
                    .map((opt: string, oi: number) => (
                      <span
                        key={oi}
                        className={cn(
                          "inline-flex items-center rounded px-1.5 py-0.5 text-xs",
                          style.optionClass || "bg-muted text-muted-foreground",
                        )}
                      >
                        {opt}
                      </span>
                    ))}
                  {(data.options?.options?.length ?? 0) > 4 && (
                    <span className="text-xs text-muted-foreground">
                      +{(data.options?.options?.length ?? 0) - 4} more
                    </span>
                  )}
                </div>
              )}
            {data.type === "CODING" && data.starterCode?.code && (
              <div className="mt-2 overflow-hidden rounded-md border bg-zinc-950">
                <div className="flex items-center gap-1.5 border-b border-zinc-800 bg-zinc-900 px-3 py-1.5">
                  <Code2 className="h-3 w-3 text-zinc-400" />
                  <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                    {data.starterCode.language}
                  </span>
                </div>
                <CodeBlock
                  code={data.starterCode.code}
                  language={data.starterCode.language}
                  className="max-h-96"
                />
              </div>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline" className={cn("text-xs", style.badgeClass)}>
                <TypeIcon className="mr-1 h-3 w-3" />
                {style.label}
              </Badge>
              {data.isRequired ? (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Required
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Optional
                </Badge>
              )}
              {videoClip && !isViewer && (
                <VideoClipControls videoClip={videoClip} />
              )}
            </div>
          </div>
          {!isViewer && (
            <div className="flex flex-col gap-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                className="p-0.5 text-muted-foreground/80 hover:text-foreground transition-colors"
                onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
              >
                <Pencil className="h-3 w-3" />
              </button>
              {!hideDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="p-0.5 text-muted-foreground/80 hover:text-destructive transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete question?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently remove this question. This action
                        cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={onDelete}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
