"use client";

import { createContext, useContext, useState, ReactNode, useRef } from "react";
import { trpc } from "@/lib/trpc/client";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AVATAR_PRESETS,
  type AvatarVoice,
} from "@/lib/avatar-voices";
import { AvatarPresetTile } from "@/components/interview/avatar-preset-tile";
import { Switch } from "@/components/ui/switch";
import { Brain, Loader2, Upload, FileText, Check, ChevronLeft, Mic, X, Search, Languages } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SUPPORTED_LANGUAGES } from "@/lib/languages";

function getFlagIcon(code: string): JSX.Element {
  const map: Record<string, boolean> = {
    ar: true, bg: true, yue: true, zh: true, hr: true, cs: true,
    da: true, nl: true, en: true, fil: true, fi: true, fr: true,
    de: true, el: true, hi: true, hu: true, id: true, it: true,
    ja: true, ko: true, ms: true, nb: true, pl: true, pt: true,
    "pt-BR": true, ro: true, ru: true, sk: true, es: true, sv: true,
    ta: true, th: true, tr: true, uk: true, vi: true,
  };
  const file = map[code] ? code : "fallback";
  return <img src={`/flags/${file}.svg`} alt={`${code} flag`} className="h-8 w-11 object-cover rounded shadow-sm shrink-0" />;
}

interface NewTrainingContextType {
  openNewTraining: (projectId?: string) => void;
  closeNewTraining: () => void;
}

const NewTrainingContext = createContext<NewTrainingContextType | undefined>(undefined);

export function NewTrainingProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>();

  const openNewTraining = (projectId?: string) => {
    setActiveProjectId(projectId);
    setIsOpen(true);
  };

  const closeNewTraining = () => setIsOpen(false);

  return (
    <NewTrainingContext.Provider value={{ openNewTraining, closeNewTraining }}>
      {children}
      <NewTrainingDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        projectId={activeProjectId}
      />
    </NewTrainingContext.Provider>
  );
}

export function useNewTraining() {
  const context = useContext(NewTrainingContext);
  if (context === undefined) {
    return {
      openNewTraining: () => {},
      closeNewTraining: () => {},
    };
  }
  return context;
}

type WizardStep = "language" | "upload" | "avatar" | "details" | "quiz";

function NewTrainingDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const utils = trpc.useUtils();

  const [step, setStep] = useState<WizardStep>("language");
  const [langSearch, setLangSearch] = useState("");

  // Step 1: Document Upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [extracting, setExtracting] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [presentationText, setPresentationText] = useState("");
  const [fileName, setFileName] = useState("");
  const [slideImages, setSlideImages] = useState<string[]>([]);

  // Step 2: Avatar Selection
  const [avatarEnabled, setAvatarEnabled] = useState(true);
  const [selectedAvatarPresetId, setSelectedAvatarPresetId] = useState<string | null>("f1");
  const [avatarImageUrl, setAvatarImageUrl] = useState<string | null>("/avatars/f1.jpg");
  const [avatarVoice, setAvatarVoice] = useState<AvatarVoice>("Zephyr (Female)");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  // Step 3: Training Details
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [objective, setObjective] = useState("");
  const [aiName, setAiName] = useState("AI Coach");
  const [language, setLanguage] = useState("en");
  const [multilingualEnabled, setMultilingualEnabled] = useState(false);

  // Step 4: Quiz Configuration
  const [quizEnabled, setQuizEnabled] = useState(true);
  const [timeLimitOn, setTimeLimitOn] = useState(false);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(30);
  const [mcqSingleCount, setMcqSingleCount] = useState(5);
  const [mcqMultipleCount, setMcqMultipleCount] = useState(5);
  const [tfCount, setTfCount] = useState(5);
  const [shortAnswerCount, setShortAnswerCount] = useState(5);
  const [minPassPercentage, setMinPassPercentage] = useState(80);

  const createMutation = trpc.training.create.useMutation({
    onSuccess: (training) => {
      toast({ title: "Training created! Analyzing presentation..." });
      utils.training.list.invalidate();
      onOpenChange(false);
      resetForm();
      router.push(`/coaching/trainings/${(training as { id: string }).id}/edit`);
    },
    onError: (err) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setStep("language");
    setLangSearch("");
    setPresentationText("");
    setFileName("");
    setSlideImages([]);
    setAvatarEnabled(true);
    setSelectedAvatarPresetId("f1");
    setAvatarImageUrl("/avatars/f1.jpg");
    setAvatarVoice("Zephyr (Female)");
    setTitle("");
    setDescription("");
    setObjective("");
    setAiName("AI Coach");
    setLanguage("en");
    setMultilingualEnabled(false);
    setQuizEnabled(true);
    setTimeLimitOn(false);
    setTimeLimitMinutes(30);
    setMcqSingleCount(5);
    setMcqMultipleCount(5);
    setTfCount(5);
    setShortAnswerCount(5);
    setMinPassPercentage(80);
  };

  const PRESENTATION_EXTS = [".pdf", ".doc", ".docx", ".ppt", ".pptx"];

  const isPresentationFile = (file: File) => {
    const name = file.name.toLowerCase();
    return PRESENTATION_EXTS.some((ext) => name.endsWith(ext));
  };

  const processPresentationFile = async (file: File) => {
    if (!isPresentationFile(file)) {
      toast({
        title: "Unsupported file",
        description: "Please use a PDF or Word document (.pdf, .doc, .docx). PPTX is also supported.",
        variant: "destructive",
      });
      return;
    }
    setFileName(file.name);
    setExtracting(true);
    try {
      // 1. Send file to backend to extract text for AI script generation
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ai/extract-text", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to extract text");
      if (data.text) setPresentationText(data.text);
      if (Array.isArray(data.images) && data.images.length > 0) {
        setSlideImages(data.images);
      } else {
        // Client fallback using pdfjs-dist
        try {
          const pdfjsLib = await import("pdfjs-dist");
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

          const arrayBuffer = await file.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
          const pdfDoc = await loadingTask.promise;
          const renderedImages: string[] = [];

          for (let i = 1; i <= Math.min(pdfDoc.numPages, 30); i++) {
            const page = await pdfDoc.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              await page.render({ canvasContext: ctx, viewport }).promise;
              renderedImages.push(canvas.toDataURL("image/png"));
            }
          }
          if (renderedImages.length > 0) {
            setSlideImages(renderedImages);
          }
        } catch (pdfErr) {
          console.warn("Client PDF rendering skipped:", pdfErr);
        }
      }

      toast({ title: "Presentation analyzed successfully!" });
    } catch (err: any) {
      toast({
        title: "Could not read file",
        description: err.message || "You can continue configuring your training.",
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processPresentationFile(file);
    e.target.value = "";
  };

  const handlePresentationDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setIsDraggingFile(true);
  };

  const handlePresentationDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingFile(false);
  };

  const handlePresentationDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processPresentationFile(file);
  };

  const handleAvatarPresetSelect = (presetId: string) => {
    const preset = AVATAR_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSelectedAvatarPresetId(presetId);
    setAvatarImageUrl(preset.imagePath);
    setAvatarVoice(preset.voice);
  };

  const handleAvatarCustomUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const supabase = createClient();
      const fileExt = file.name.split(".").pop() || "png";
      const filePath = `avatars/coaching_${Date.now()}.${fileExt}`;
      const { error } = await supabase.storage.from("public-assets").upload(filePath, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("public-assets").getPublicUrl(filePath);
      setAvatarImageUrl(publicUrl);
      setSelectedAvatarPresetId(null);
      toast({ title: "Custom avatar uploaded!" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleCreate = () => {
    if (!title.trim()) return;

    const customSlides = slideImages.length > 0
      ? slideImages.map((imgUrl, idx) => ({
          slide: idx + 1,
          title: `Slide ${idx + 1}`,
          script: `Welcome to Slide ${idx + 1}.`,
          imageUrl: imgUrl,
        }))
      : undefined;

    createMutation.mutate({
      projectId,
      title: title.trim(),
      description: description.trim() || undefined,
      objective: objective.trim() || undefined,
      aiName: aiName.trim() || "AI Coach",
      language,
      avatarMode: avatarEnabled ? "vidu" : "none",
      avatarImageUrl: avatarEnabled ? (avatarImageUrl || undefined) : undefined,
      avatarVoice: avatarEnabled ? avatarVoice : undefined,
      multilingualEnabled: !avatarEnabled && multilingualEnabled,
      presentationText: presentationText || undefined,
      customSlides,
      quiz_settings: quizEnabled ? {
        timeLimitOn,
        timeLimitMinutes: timeLimitOn ? timeLimitMinutes : null,
        minPassPercentage,
        questionCounts: {
          mcq_single: mcqSingleCount,
          mcq_multiple: mcqMultipleCount,
          tf: tfCount,
          short_answer: shortAnswerCount,
        }
      } : { enabled: false },
      quiz_questions: [],
    });
  };

  const progressStep = 
    step === "language" ? 1 :
    step === "upload" ? 2 :
    step === "avatar" ? 3 :
    step === "details" ? 4 : 5;
  const totalSteps = 5;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="max-w-[1400px] w-[95vw] h-[95vh] max-h-[1000px] p-0 gap-0 overflow-hidden flex flex-col [&>button]:hidden bg-background border shadow-2xl">
        <DialogTitle className="sr-only">Create Coaching Training</DialogTitle>
        <DialogDescription className="sr-only">Step-by-step wizard to create an AI coaching session.</DialogDescription>

        {/* Top Progress Bar */}
        <div className="absolute top-0 left-0 z-50 h-1.5 w-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${(progressStep / totalSteps) * 100}%` }}
          />
        </div>

        {/* Top Header Bar */}
        <div className="z-20 flex h-16 shrink-0 items-center justify-between px-6 border-b">
          {step !== "language" ? (
            <Button
              variant="ghost"
              size="icon"
              disabled={createMutation.isPending}
              onClick={() => {
                if (step === "quiz") setStep("details");
                else if (step === "details") setStep("avatar");
                else if (step === "avatar") setStep("upload");
                else if (step === "upload") setStep("language");
              }}
              className="rounded-full hover:bg-muted"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          ) : (
            <div className="w-9" />
          )}

          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <span className="font-bold text-base">
              {step === "language"
                ? "1. Select Language"
                : step === "upload"
                ? "2. Upload Presentation"
                : step === "avatar"
                ? "3. Configure Avatar & Voice"
                : step === "details"
                ? "4. Coaching Details"
                : "5. Quiz Configuration"}
            </span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            disabled={createMutation.isPending}
            onClick={() => { onOpenChange(false); resetForm(); }}
            className="rounded-full hover:bg-muted text-muted-foreground animate-in fade-in zoom-in-50"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Wizard Main Content Area */}
        <div
          className={
            step === "language"
              ? "flex min-h-0 flex-1 flex-col overflow-hidden px-10 pb-3 pt-3"
              : "mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center overflow-y-auto p-8"
          }
        >
          {/* STEP 1: LANGUAGE */}
          {step === "language" && (
            <div className="mx-auto flex w-full max-w-6xl min-h-0 flex-1 flex-col space-y-2.5">
              <div className="shrink-0 text-center">
                <h2 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
                  Select Training Language
                </h2>
                <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground sm:text-sm">
                  Choose the primary language for this coaching session. The AI will speak and evaluate in this language.
                </p>
              </div>

              <div className="relative mx-auto w-full max-w-sm shrink-0">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search languages..."
                  value={langSearch}
                  onChange={(e) => setLangSearch(e.target.value)}
                  className="h-9 rounded-xl border-border/80 bg-muted/30 pl-9"
                />
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1">
                <div className="grid h-full min-h-0 grid-cols-2 gap-2.5 p-1 sm:grid-cols-3 md:grid-cols-7 md:[grid-template-rows:repeat(5,minmax(0,1fr))]">
                  {SUPPORTED_LANGUAGES.filter(lang => 
                    lang.label.toLowerCase().includes(langSearch.toLowerCase()) ||
                    lang.nativeLabel.toLowerCase().includes(langSearch.toLowerCase())
                  ).map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => setLanguage(lang.code)}
                      className={`relative flex h-full min-h-[4.75rem] flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-center transition-all duration-200 ${
                        language === lang.code
                          ? "border-primary bg-primary/10 shadow-sm ring-2 ring-inset ring-primary/20"
                          : "border-border bg-card hover:border-primary/40 hover:bg-muted/50"
                      }`}
                    >
                      <div className="shrink-0 flex items-center justify-center">{getFlagIcon(lang.code)}</div>
                      <div className="w-full min-w-0 px-0.5">
                        <p className="truncate text-sm font-bold leading-tight text-foreground">{lang.label}</p>
                        <p className="truncate text-xs leading-tight text-muted-foreground">{lang.nativeLabel}</p>
                      </div>
                      {language === lang.code && (
                        <div className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary shadow-sm">
                          <Check className="h-3 w-3 stroke-[3] text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {/* STEP 1: UPLOAD */}
          {step === "upload" && (
            <div className="space-y-6 my-auto py-4">
              <div className="text-center space-y-2 mb-4">
                <h2 className="text-2xl font-extrabold tracking-tight">Upload Presentation Slides</h2>
                <p className="text-sm text-muted-foreground">
                  Upload a PDF or Word document (.pdf, .doc, .docx). PPTX is also supported. Our AI will parse the content and generate coaching scripts.
                </p>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".pdf,.doc,.docx,.pptx,.ppt"
                onChange={handleFileUpload}
              />
              <div
                className={`border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 group ${
                  isDraggingFile
                    ? "border-primary bg-primary/10"
                    : "border-primary/30 dark:border-primary/40 bg-muted/20 hover:bg-muted/40"
                }`}
                onClick={() => !extracting && fileInputRef.current?.click()}
                onDragEnter={handlePresentationDragOver}
                onDragOver={handlePresentationDragOver}
                onDragLeave={handlePresentationDragLeave}
                onDrop={handlePresentationDrop}
              >
                <div className="p-4 rounded-full bg-primary/10 group-hover:scale-110 transition-transform mb-4 pointer-events-none">
                  <FileText className="h-12 w-12 text-primary" />
                </div>
                <p className="text-base font-bold text-center pointer-events-none">
                  {isDraggingFile ? "Drop file to upload" : "Click to select or drag presentation file"}
                </p>
                <p className="text-xs text-muted-foreground mt-1 pointer-events-none">
                  Supports PDF, Word (.doc, .docx), PPTX, and PPT
                </p>
                {fileName && (
                  <div className="mt-6 flex items-center gap-2 bg-emerald-500/10 dark:bg-emerald-500/20 px-4 py-2 rounded-full text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-sm">
                    <Check className="h-4 w-4" />
                    <span>{fileName}</span>
                  </div>
                )}
              </div>

              {extracting && (
                <div className="flex items-center justify-center gap-2 text-sm font-medium text-primary py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Extracting presentation text...</span>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: AVATAR & VOICE */}
          {step === "avatar" && (
            <div className="space-y-6 my-auto py-4">
              <div className="text-center space-y-2 mb-2">
                <h2 className="text-2xl font-extrabold tracking-tight">Configure AI Coach Avatar & Voice</h2>
                <p className="text-sm text-muted-foreground">
                  Choose a realistic presenter avatar and voice for your video coaching session, or disable the presenter.
                </p>
              </div>

              <div className="flex items-center justify-between border p-4 rounded-xl bg-card">
                <div className="space-y-0.5">
                  <Label className="font-bold text-sm">Use AI Presenter Avatar</Label>
                  <p className="text-xs text-muted-foreground">When enabled, learners will watch a realistic talking video avatar.</p>
                </div>
                <Switch checked={avatarEnabled} onCheckedChange={setAvatarEnabled} />
              </div>

              {avatarEnabled ? (
                <>
                  <div className="space-y-3">
                    <Label className="text-sm font-bold">Select Preset Presenter Avatar</Label>
                    <div className="grid grid-cols-5 gap-3">
                      {AVATAR_PRESETS.map((preset) => (
                        <AvatarPresetTile
                          key={preset.id}
                          preset={preset}
                          selected={selectedAvatarPresetId === preset.id}
                          onSelect={() => handleAvatarPresetSelect(preset.id)}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6 border-t pt-6">
                    <div className="space-y-3">
                      <Label className="font-bold">Or Upload Custom Presenter Photo</Label>
                      <div className="flex items-center gap-4">
                        <div className="h-16 w-16 rounded-xl border bg-muted overflow-hidden shrink-0 shadow-sm">
                          {avatarImageUrl && (
                            <img src={avatarImageUrl} className="h-full w-full object-cover" alt="Preview" />
                          )}
                        </div>
                        <input
                          ref={avatarFileRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAvatarCustomUpload}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={uploadingAvatar}
                          onClick={() => avatarFileRef.current?.click()}
                        >
                          {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                          Upload Custom Photo
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label className="font-bold">Select AI Voice</Label>
                      <div className="flex items-center gap-2">
                        <Mic className="h-4 w-4 text-primary shrink-0" />
                        <Select value={avatarVoice} onValueChange={(v) => setAvatarVoice(v as AvatarVoice)}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AVATAR_PRESETS.map((p) => (
                              <SelectItem key={p.voice} value={p.voice}>
                                {p.voice}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="p-8 border border-dashed rounded-xl text-center text-muted-foreground text-sm bg-muted/10">
                    AI Presenter Avatar is disabled. Presentations will be narrated without a video avatar.
                  </div>
                  <div className="flex items-center justify-between border p-4 rounded-xl bg-card">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <Languages className="h-5 w-5" />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="font-bold text-sm">Multilingual</Label>
                        <p className="text-xs text-muted-foreground">
                          Let learners choose the session language at start.
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={multilingualEnabled}
                      onCheckedChange={setMultilingualEnabled}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: DETAILS */}
          {step === "details" && (
            <div className="space-y-6 my-auto py-4">
              <div className="text-center space-y-2 mb-2">
                <h2 className="text-2xl font-extrabold tracking-tight">Coaching Session Details</h2>
                <p className="text-sm text-muted-foreground">
                  Give your coaching session a clear title and description for your team participants.
                </p>
              </div>

              <div className="space-y-4 max-w-xl mx-auto w-full">
                <div className="space-y-2">
                  <Label className="font-bold">Coaching Title *</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Q3 Product Pitch Coaching"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-bold">Description / Overview</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Briefly describe what this coaching session covers..."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-bold">AI Coach Name</Label>
                  <Input
                    value={aiName}
                    onChange={(e) => setAiName(e.target.value)}
                    placeholder="AI Coach"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: QUIZ CONFIGURATION */}
          {step === "quiz" && (
            <div className="space-y-6 my-auto py-4">
              <div className="text-center space-y-2 mb-2">
                <h2 className="text-2xl font-extrabold tracking-tight">Coaching Quiz Settings</h2>
                <p className="text-sm text-muted-foreground">
                  Configure the quiz that learners will take immediately after completing the training, or skip it entirely.
                </p>
              </div>

              <div className="space-y-4 max-w-xl mx-auto w-full">
                <div className="flex items-center justify-between border p-3 rounded-lg bg-card">
                  <div className="space-y-0.5">
                    <Label className="font-bold text-sm">Include Quiz in Coaching</Label>
                    <p className="text-xs text-muted-foreground">Learners will be tested immediately after completing slides.</p>
                  </div>
                  <Switch checked={quizEnabled} onCheckedChange={setQuizEnabled} />
                </div>

                {quizEnabled ? (
                  <>
                    <div className="flex items-center justify-between border p-3 rounded-lg bg-card">
                      <div className="space-y-0.5">
                        <Label className="font-bold text-sm">Time Limit</Label>
                        <p className="text-xs text-muted-foreground">Limit candidate's time to complete the quiz (Max 2 hours)</p>
                      </div>
                      <Switch checked={timeLimitOn} onCheckedChange={setTimeLimitOn} />
                    </div>

                    <div className="space-y-2 border p-3 rounded-lg bg-card">
                      <Label className="font-bold text-sm">Minimum Passing Score (%)</Label>
                      <p className="text-xs text-muted-foreground mb-1">Set the minimum percentage score candidates need to pass the training.</p>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={minPassPercentage}
                        onChange={(e) => setMinPassPercentage(Math.min(100, Math.max(1, Number(e.target.value))))}
                        placeholder="e.g. 80"
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
                          placeholder="e.g. 30"
                        />
                      </div>
                    )}

                    <div className="space-y-3 border p-4 rounded-lg bg-card">
                      <Label className="font-bold text-sm block border-b pb-2">Questions Count per Type</Label>
                      <p className="text-xs text-muted-foreground mb-2">Configure how many questions of each type the AI should generate (Max total 30).</p>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">MCQ (Single Answer)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={30}
                            value={mcqSingleCount}
                            onChange={(e) => setMcqSingleCount(Math.max(0, Number(e.target.value)))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">MCQ (Multiple Answers)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={30}
                            value={mcqMultipleCount}
                            onChange={(e) => setMcqMultipleCount(Math.max(0, Number(e.target.value)))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">True / False</Label>
                          <Input
                            type="number"
                            min={0}
                            max={30}
                            value={tfCount}
                            onChange={(e) => setTfCount(Math.max(0, Number(e.target.value)))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">Short Answer</Label>
                          <Input
                            type="number"
                            min={0}
                            max={30}
                            value={shortAnswerCount}
                            onChange={(e) => setShortAnswerCount(Math.max(0, Number(e.target.value)))}
                          />
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t flex justify-between items-center text-xs font-bold">
                        <span>Total Questions:</span>
                        <span className={mcqSingleCount + mcqMultipleCount + tfCount + shortAnswerCount > 30 ? "text-destructive" : "text-emerald-500"}>
                          {mcqSingleCount + mcqMultipleCount + tfCount + shortAnswerCount} / 30
                        </span>
                      </div>
                      {mcqSingleCount + mcqMultipleCount + tfCount + shortAnswerCount > 30 && (
                        <p className="text-xs text-destructive mt-1">Total questions cannot exceed 30.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="p-8 border border-dashed rounded-xl text-center text-muted-foreground text-sm bg-muted/10">
                    Coaching Quiz is disabled. Learners will complete the training immediately after reviewing all slides.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Step Footer Bar (Uniform with Interview Wizard) */}
        <div className="flex h-20 shrink-0 items-center justify-between border-t px-8 bg-muted/20 z-20">
          {step !== "language" ? (
            <Button variant="outline" disabled={createMutation.isPending} onClick={() => {
              if (step === "quiz") setStep("details");
              else if (step === "details") setStep("avatar");
              else if (step === "avatar") setStep("upload");
              else if (step === "upload") setStep("language");
            }}>
              Back
            </Button>
          ) : (
            <div />
          )}

          {step === "language" && (
            <Button
              className="bg-[#1b2a4a] hover:bg-[#15233e] dark:bg-[#152442] dark:hover:bg-[#1d325a] text-white px-6 gap-2 shadow-sm"
              onClick={() => setStep("upload")}
            >
              Next: Upload Presentation
            </Button>
          )}

          {step === "upload" && (
            <Button
              className="bg-[#1b2a4a] hover:bg-[#15233e] dark:bg-[#152442] dark:hover:bg-[#1d325a] text-white px-6 gap-2 shadow-sm"
              onClick={() => setStep("avatar")}
              disabled={extracting}
            >
              {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Next: Select Avatar & Voice
            </Button>
          )}

          {step === "avatar" && (
            <Button
              className="bg-[#1b2a4a] hover:bg-[#15233e] dark:bg-[#152442] dark:hover:bg-[#1d325a] text-white px-6 gap-2 shadow-sm"
              onClick={() => setStep("details")}
            >
              Next: Coaching Details
            </Button>
          )}

          {step === "details" && (
            <Button
              className="bg-[#1b2a4a] hover:bg-[#15233e] dark:bg-[#152442] dark:hover:bg-[#1d325a] text-white px-6 gap-2 shadow-sm"
              onClick={() => setStep("quiz")}
              disabled={!title.trim()}
            >
              Next: Quiz Configuration
            </Button>
          )}

          {step === "quiz" && (
            <Button
              className="bg-[#1b2a4a] hover:bg-[#15233e] dark:bg-[#152442] dark:hover:bg-[#1d325a] text-white px-6 gap-2 shadow-sm"
              onClick={handleCreate}
              disabled={
                createMutation.isPending || 
                (quizEnabled && (mcqSingleCount + mcqMultipleCount + tfCount + shortAnswerCount > 30)) ||
                (quizEnabled && (mcqSingleCount + mcqMultipleCount + tfCount + shortAnswerCount === 0))
              }
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Coaching Project
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
