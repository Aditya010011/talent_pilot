"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useParams, useRouter } from "next/navigation";
import { useOrg } from "@/components/org-provider";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Brain,
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  Trash2,
  Video,
  Play,
  ChevronLeft,
  ChevronRight,
  Volume2,
  Square,
  Plus,
  MoreVertical,
  Check,
  FileText,
  Users,
  ListOrdered,
  Mail,
  Settings as SettingsIcon,
  Star,
  HelpCircle,
  Eye,
  Languages,
} from "lucide-react";
import {
  AVATAR_PRESETS,
  AVATAR_VOICES,
  DEFAULT_AVATAR_VOICE,
  absoluteAvatarImageUrl,
  findAvatarPresetByImageUrl,
  findMatchingAvatarPreset,
  resolveAvatarVoice,
  type AvatarVoice,
} from "@/lib/avatar-voices";
import { AvatarPresetTile } from "@/components/interview/avatar-preset-tile";
import {
  LANGUAGES,
} from "@/lib/languages";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect, useRef } from "react";
import CoachingCandidateManager from "@/components/coaching/coaching-candidate-manager";
import { CoachingEmailTab } from "@/components/coaching/coaching-email-tab";
import { CoachingQuizTab } from "@/components/coaching/coaching-quiz-tab";
import { CoachingResults } from "@/components/coaching/coaching-results";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { SlideMediaOverlay } from "@/components/coaching/slide-media-overlay";
import { createClient } from "@/lib/supabase/client";
import {
  createMediaOverlay,
  insertSlidesAt,
  isVideoMediaSlide,
  reorderSlides,
  shouldSkipScriptGeneration,
  type ScriptSlide,
  type SlideMediaRect,
} from "@/lib/slide-media";

type MediaInsertProgressStage = "uploading" | "converting" | "preparing" | "saving" | "finalizing";

type MediaInsertProgressState = {
  fileName: string;
  mediaTypeLabel: string;
  progress: number;
  stage: MediaInsertProgressStage;
  detail: string;
  mode: "actual" | "staged" | "mixed";
};

export default function TrainingEditPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { currentOrg } = useOrg();
  const utils = trpc.useUtils();
  const trainingId = params.id as string;

  const isAdmin =
    currentOrg?.role === "SYSTEM_ADMIN" || currentOrg?.role === "ACCOUNT_ADMIN";

  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  
  const [editingAiName, setEditingAiName] = useState(false);
  const [aiName, setAiName] = useState("");

  const [voice, setVoice] = useState<string>(DEFAULT_AVATAR_VOICE);
  const [trainingLanguage, setTrainingLanguage] = useState("en");
  const [multilingualEnabled, setMultilingualEnabled] = useState(false);

  const [selectedParticipant, setSelectedParticipant] = useState<{ id: string; type: "session" | "candidate" } | null>(null);
  const sessionDetail = trpc.coachingSession.getById.useQuery(
    { id: selectedParticipant?.id || "" },
    { enabled: !!selectedParticipant && selectedParticipant.type === "session" }
  );

  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [slideScript, setSlideScript] = useState("");
  const [activeSlideAspectRatio, setActiveSlideAspectRatio] = useState(16 / 9);
  const [generatingSlideIndex, setGeneratingSlideIndex] = useState<number | null>(null);

  const [generatingScript, setGeneratingScript] = useState(false);
  const [isDraggingScriptFile, setIsDraggingScriptFile] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number } | null>(null);
  const [isPlayingTTS, setIsPlayingTTS] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);

  // Drag-and-drop state
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const fromIndex = dragIndexRef.current;
    if (fromIndex === null || fromIndex === dropIndex) {
      dragIndexRef.current = null;
      setDragOverIndex(null);
      return;
    }

    const reindexed = reorderSlides(slides as ScriptSlide[], fromIndex, dropIndex);

    updateMutation.mutate(
      { id: trainingId, script_slides: reindexed },
      {
        onSuccess: () => {
          setActiveSlideIndex(dropIndex);
        }
      }
    );

    dragIndexRef.current = null;
    setDragOverIndex(null);
  };

  useEffect(() => {
    if (generatingSlideIndex !== null) {
      setVideoProgress(0);
      const interval = setInterval(() => {
        setVideoProgress((p) => (p < 95 ? p + Math.max(1, Math.floor(Math.random() * 3)) : p));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [generatingSlideIndex]);

  const slideFileInputRef = useRef<HTMLInputElement>(null);
  const scriptFileInputRef = useRef<HTMLInputElement>(null);
  const insertIndexRef = useRef(0);
  const [uploadingSlides, setUploadingSlides] = useState(false);
  const [isDraggingSlidesFile, setIsDraggingSlidesFile] = useState(false);
  const [mediaInsertProgress, setMediaInsertProgress] = useState<MediaInsertProgressState | null>(null);
  // Reduced quality preview for faster slide thumbnail generation in the editor.
  const PREVIEW_IMAGE_PPI = 75;

  const thumbnailScrollRef = useRef<HTMLDivElement>(null);

  const { data: training, isLoading } = trpc.training.getById.useQuery(
    { id: trainingId },
    {
      onSuccess: (data: any) => {
        if (!editingTitle) setTitle(data.title);
        if (!editingAiName) setAiName(data.aiName ?? "AI Coach");
        setVoice(resolveAvatarVoice(data.avatarVoice));
        setDescription(data.description ?? "");
        setTrainingLanguage(data.language ?? "en");
        setMultilingualEnabled(!!data.multilingualEnabled);
      },
    } as Parameters<typeof trpc.training.getById.useQuery>[1],
  );

  const updateMutation = trpc.training.update.useMutation({
    onSuccess: () => {
      toast({ title: "Training updated" });
      setEditingTitle(false);
      utils.training.getById.invalidate({ id: trainingId });
      utils.training.list.invalidate();
    },
    onError: (err) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = trpc.training.delete.useMutation({
    onSuccess: () => {
      toast({ title: "Training deleted" });
      router.push("/coaching/trainings");
    },
    onError: (err) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const generateScriptMutation = trpc.training.generateScript.useMutation();
  const generateScriptsForInsertedSlidesMutation = trpc.training.generateScriptsForInsertedSlides.useMutation();
  const previewMutation = trpc.coachingSession.create.useMutation();

  const handlePreview = async () => {
    if (!tObj?.publicSlug) return;
    try {
      const res = await previewMutation.mutateAsync({
        trainingSlug: tObj.publicSlug,
        participantName: "Presenter Preview",
      });
      window.open(`/c/${tObj.publicSlug}/session?sid=${res.sessionId}&preview=true`, "_blank");
    } catch (err: any) {
      toast({ title: "Failed to generate preview", description: err.message, variant: "destructive" });
    }
  };

  const tObj = training as any;
  const slides = Array.isArray(tObj?.script_slides) && tObj.script_slides.length > 0
    ? tObj.script_slides
    : [
        { slide: 1, title: "1. Introduction & Overview", script: `Welcome to ${tObj?.title || "this presentation"}.` },
        { slide: 2, title: "2. Key Concepts & Analysis", script: "Overview of key topic areas and discussion points." },
        { slide: 3, title: "3. Summary & Evaluation", script: "Summary points and next steps for practice." },
      ];
  const activeSlide = slides[activeSlideIndex] || slides[0];

  useEffect(() => {
    if (activeSlide) {
      setSlideScript(activeSlide.script || "");
      setActiveSlideAspectRatio(16 / 9);
    }
  }, [activeSlideIndex, training]);

  const copyLink = () => {
    if (!tObj?.publicSlug) return;
    const url = `${window.location.origin}/c/${tObj.publicSlug}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Coaching link copied!" });
  };

  const handleSaveAiName = () => {
    setEditingAiName(false);
    if (aiName.trim() && aiName.trim() !== tObj?.aiName) {
      updateMutation.mutate({ id: trainingId, aiName: aiName.trim() });
    } else {
      setAiName(tObj?.aiName || "AI Coach");
    }
  };

  const handleSaveVoice = (newVoice: string) => {
    setVoice(newVoice);
    updateMutation.mutate({ id: trainingId, avatarVoice: newVoice });
  };

  const handleSelectAvatarPreset = (presetId: string) => {
    const preset = AVATAR_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const imageUrl = absoluteAvatarImageUrl(preset.imagePath);
    setVoice(preset.voice);
    updateMutation.mutate({
      id: trainingId,
      avatarMode: "vidu",
      avatarImageUrl: imageUrl,
      avatarVoice: preset.voice,
    });
  };

  const SCRIPT_FILE_EXTS = [".doc", ".docx", ".ppt", ".pptx"];

  const processScriptFile = async (file: File) => {
    const name = file.name.toLowerCase();
    if (!SCRIPT_FILE_EXTS.some((ext) => name.endsWith(ext))) {
      toast({
        title: "Unsupported file",
        description: "Please drop a Word document (.doc, .docx) or a presentation (.ppt, .pptx).",
        variant: "destructive",
      });
      return;
    }
    setGeneratingScript(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ai/extract-text", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to extract text");
      if (!data.text?.trim()) throw new Error("No text found in the document.");

      const updated = await generateScriptMutation.mutateAsync({
        id: trainingId,
        presentationText: data.text,
      });
      const nextSlides = Array.isArray(updated?.script_slides) ? updated.script_slides : [];
      setSlideScript(nextSlides[activeSlideIndex]?.script || nextSlides[0]?.script || "");
      toast({ title: "Scripts generated from document" });
      utils.training.getById.invalidate({ id: trainingId });
    } catch (err: any) {
      toast({
        title: "Script generation failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setGeneratingScript(false);
      if (scriptFileInputRef.current) scriptFileInputRef.current.value = "";
    }
  };

  const handleScriptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processScriptFile(file);
  };

  const handleScriptDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setIsDraggingScriptFile(true);
  };

  const handleScriptDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingScriptFile(false);
  };

  const handleScriptFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingScriptFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processScriptFile(file);
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleToggleTTS = async () => {
    if (isPlayingTTS) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setIsPlayingTTS(false);
      return;
    }

    if (!slideScript.trim()) {
      toast({ title: "No script text to preview" });
      return;
    }

    setIsPlayingTTS(true);
    try {
      const language = (tObj?.language as string) || "en-US";
      const res = await fetch("/api/ai/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: slideScript, language }),
      });

      if (!res.ok) {
        throw new Error("Failed to generate TTS");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      if (!audioRef.current) {
        audioRef.current = new Audio(url);
      } else {
        audioRef.current.src = url;
      }

      audioRef.current.onended = () => {
        setIsPlayingTTS(false);
        URL.revokeObjectURL(url);
      };
      
      audioRef.current.onerror = () => {
        setIsPlayingTTS(false);
        URL.revokeObjectURL(url);
        toast({ title: "Error playing audio", variant: "destructive" });
      };

      await audioRef.current.play();
    } catch (err: any) {
      console.error(err);
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setIsPlayingTTS(false);
    }
  };

  const handleUploadSlidesFile = async (file: File) => {
    const nameLower = file.name.toLowerCase();
    const insertIndex = insertIndexRef.current;
    setUploadingSlides(true);

    const mediaTypeLabel = [".ppt", ".pptx", ".pdf"].some((ext) => nameLower.endsWith(ext))
      ? "presentation"
      : file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(nameLower)
        ? "video"
        : "image";

    setMediaInsertProgress({
      fileName: file.name,
      mediaTypeLabel,
      progress: 0,
      stage: "uploading",
      detail: "Starting upload...",
      mode: mediaTypeLabel === "presentation" ? "mixed" : "actual",
    });

    try {
      const incoming = await buildSlidesFromFile(file);
      if (incoming.length === 0) {
        toast({
          title: "Could not add media",
          description: "No slides or media could be created from that file.",
          variant: "destructive",
        });
        return;
      }

      const nextSlides = insertSlidesAt(slides as ScriptSlide[], insertIndex, incoming);
      setMediaInsertProgress((current) =>
        current
          ? {
              ...current,
              progress: 92,
              stage: "saving",
              detail: "Saving updated training...",
            }
          : current,
      );

      await updateMutation.mutateAsync({
        id: trainingId,
        script_slides: nextSlides,
      });

      setMediaInsertProgress((current) =>
        current
          ? {
              ...current,
              progress: 100,
              stage: "finalizing",
              detail: "Inserted successfully.",
            }
          : current,
      );

      setActiveSlideIndex(insertIndex);
      toast({
        title: incoming.length === 1 ? "Slide inserted" : `${incoming.length} slides inserted`,
        description: `Added at position ${insertIndex + 1}.`,
      });
    } catch (err: any) {
      toast({ title: "Slide insert failed", description: err.message, variant: "destructive" });
    } finally {
      window.setTimeout(() => {
        setMediaInsertProgress(null);
      }, 600);
      setUploadingSlides(false);
    }
  };

  const handleUploadSlidesPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void handleUploadSlidesFile(file);
  };

  const handleSlidesDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setIsDraggingSlidesFile(true);
  };

  const handleSlidesDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDraggingSlidesFile(false);
    }
  };

  const handleSlidesDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingSlidesFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    void handleUploadSlidesFile(file);
  };

  const setMediaInsertStage = (
    stage: MediaInsertProgressStage,
    progress: number,
    detail: string,
    mode?: MediaInsertProgressState["mode"],
  ) => {
    setMediaInsertProgress((current) =>
      current
        ? {
            ...current,
            stage,
            progress: Math.max(current.progress, Math.min(progress, 100)),
            detail,
            mode: mode ?? current.mode,
          }
        : current,
    );
  };

  const animateMediaInsertProgress = (
    target: number,
    detail: string,
    stage: MediaInsertProgressStage,
    stepMs = 180,
  ) => {
    setMediaInsertProgress((current) => {
      if (!current) return current;
      return {
        ...current,
        stage,
        detail,
        progress: Math.min(current.progress, target),
      };
    });

    const interval = window.setInterval(() => {
      let shouldStop = false;
      setMediaInsertProgress((current) => {
        if (!current) {
          shouldStop = true;
          return current;
        }
        if (current.progress >= target) {
          shouldStop = true;
          return {
            ...current,
            stage,
            detail,
            progress: target,
          };
        }
        const remaining = target - current.progress;
        const increment = remaining > 12 ? 4 : remaining > 5 ? 2 : 1;
        return {
          ...current,
          stage,
          detail,
          progress: Math.min(target, current.progress + increment),
        };
      });
      if (shouldStop) {
        window.clearInterval(interval);
      }
    }, stepMs);

    return () => window.clearInterval(interval);
  };

  const uploadFileWithProgress = async (
    url: string,
    options: {
      body: BodyInit;
      headers?: Record<string, string>;
      onUploadProgress?: (loaded: number, total: number | null) => void;
    },
  ) =>
    new Promise<XMLHttpRequest>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      Object.entries(options.headers ?? {}).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });
      xhr.responseType = "text";
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          options.onUploadProgress?.(event.loaded, event.total);
        } else {
          options.onUploadProgress?.(event.loaded, null);
        }
      };
      xhr.onload = () => resolve(xhr);
      xhr.onerror = () => reject(new Error("Network request failed"));
      xhr.onabort = () => reject(new Error("Upload was aborted"));
      xhr.send(options.body);
    });

  const uploadTrainingMedia = async (file: File): Promise<string> => {
    const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const filePath = `trainings/${trainingId}/media/${crypto.randomUUID()}.${ext}`;
    const supabase = createClient();
    const [{ data: sessionData }, { data: publicUrlData }] = await Promise.all([
      supabase.auth.getSession(),
      Promise.resolve(supabase.storage.from("public-assets").getPublicUrl(filePath)),
    ]);
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      throw new Error("You must be signed in to upload media.");
    }
    const storageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public-assets/${filePath}`;
    const xhr = await uploadFileWithProgress(storageUrl, {
      body: file,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-upsert": "false",
        "content-type": file.type || "application/octet-stream",
      },
      onUploadProgress: (loaded, total) => {
        if (total && total > 0) {
          const uploadProgress = Math.min(70, Math.round((loaded / total) * 70));
          setMediaInsertStage("uploading", uploadProgress, `Uploading ${file.name}...`, "actual");
        }
      },
    });
    let uploadData: { error?: { message?: string } } | null = null;
    try {
      uploadData = xhr.responseText ? JSON.parse(xhr.responseText) : null;
    } catch {
      uploadData = null;
    }
    if (xhr.status < 200 || xhr.status >= 300) {
      throw new Error(uploadData?.error?.message || "Failed to upload media");
    }
    const publicUrl = publicUrlData.data.publicUrl;
    if (!publicUrl) throw new Error("Failed to get public URL for uploaded media");
    setMediaInsertStage("preparing", 86, "Preparing media slide...");
    return publicUrl;
  };

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });

  const convertPresentationToImages = async (file: File): Promise<{ images: string[]; text: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    // Hint the backend conversion to generate lower-res preview images.
    formData.append("imagePpi", String(PREVIEW_IMAGE_PPI));
    const conversionCleanup = animateMediaInsertProgress(88, "Converting slides...", "converting", 220);
    const xhr = await uploadFileWithProgress("/api/ai/extract-text", {
      body: formData,
      onUploadProgress: (loaded, total) => {
        if (total && total > 0) {
          const uploadProgress = Math.min(30, Math.round((loaded / total) * 30));
          setMediaInsertStage("uploading", uploadProgress, `Uploading ${file.name}...`, "mixed");
        }
      },
    });
    conversionCleanup();
    let data: any = null;
    try {
      data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
    } catch {
      data = null;
    }
    if (xhr.status < 200 || xhr.status >= 300) {
      throw new Error(data?.error || "Failed to convert presentation");
    }
    const extractedImages: string[] = Array.isArray(data.images) ? data.images : [];
    setMediaInsertStage("preparing", 90, extractedImages.length > 0 ? `Prepared ${extractedImages.length} slide${extractedImages.length === 1 ? "" : "s"}...` : "Preparing converted slides...");
    return { images: extractedImages, text: data?.text ?? "" };
  };

  const buildSlidesFromFile = async (file: File): Promise<ScriptSlide[]> => {
    const name = file.name.toLowerCase();
    const isPresentation = [".ppt", ".pptx", ".pdf"].some((ext) => name.endsWith(ext));
    const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(name);
    const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(name);

    if (isPresentation) {
      const { images: extractedImages, text: extractedText } = await convertPresentationToImages(file);
      const tempSlides = extractedImages.map((imgUrl, idx) => ({
        slide: idx + 1,
        title: `Slide ${idx + 1}`,
        imageUrl: imgUrl,
      }));

      setMediaInsertStage("generating", 95, "Generating scripts from presentation content...");
      const generatedSlides = await generateScriptsForInsertedSlidesMutation.mutateAsync({
        id: trainingId,
        insertedSlides: tempSlides,
        presentationText: extractedText || `Presentation: ${file.name}`,
      });

      return generatedSlides;
    }

    if (isVideo) {
      const url = await uploadTrainingMedia(file);
      const title = file.name.replace(/\.[^.]+$/, "") || "Video";
      return [{
        slide: 1,
        title,
        script: "",
        skipScript: true,
        media: createMediaOverlay("video", url),
      }];
    }

    if (isImage) {
      let url: string;
      try {
        url = await uploadTrainingMedia(file);
      } catch {
        url = await fileToDataUrl(file);
      }
      const title = file.name.replace(/\.[^.]+$/, "") || "Image";
      return [{
        slide: 1,
        title,
        script: "",
        media: createMediaOverlay("image", url),
      }];
    }

    throw new Error("Please upload a PDF, PPTX, PPT, video, or image file.");
  };

  const openInsertPicker = (index: number) => {
    insertIndexRef.current = index;
    slideFileInputRef.current?.click();
  };

  const handleSaveActiveSlide = () => {
    if (!tObj) return;
    const newSlides = [...slides];
    if (activeSlideIndex < newSlides.length) {
      newSlides[activeSlideIndex] = {
        ...newSlides[activeSlideIndex],
        script: slideScript,
      };
    } else {
      newSlides.push({
        slide: activeSlideIndex + 1,
        title: `Slide ${activeSlideIndex + 1}`,
        script: slideScript,
      });
    }

    updateMutation.mutate({
      id: trainingId,
      script_slides: newSlides,
    });
  };

  const handleMediaRectChange = (rect: SlideMediaRect) => {
    if (!tObj) return;
    const current = slides[activeSlideIndex];
    if (!current?.media) return;
    const newSlides = [...slides];
    newSlides[activeSlideIndex] = {
      ...current,
      media: { ...current.media, ...rect },
    };
    updateMutation.mutate({
      id: trainingId,
      script_slides: newSlides,
    });
  };

  const handleDuplicateSlide = (index: number) => {
    const currentSlides = [...slides];
    if (index < 0 || index >= currentSlides.length) return;
    const target = currentSlides[index];
    const duplicated = {
      ...target,
      slide: currentSlides.length + 1,
      title: `${target.title || `Slide ${index + 1}`} (Copy)`,
    };
    currentSlides.splice(index + 1, 0, duplicated);
    const reindexed = currentSlides.map((s, idx) => ({ ...s, slide: idx + 1 }));
    updateMutation.mutate(
      { id: trainingId, script_slides: reindexed },
      { onSuccess: () => setActiveSlideIndex(index + 1) }
    );
  };

  const handleDeleteSlide = (index: number) => {
    const currentSlides = [...slides];
    if (currentSlides.length <= 1) {
      toast({ title: "Cannot delete", description: "At least one slide is required.", variant: "destructive" });
      return;
    }
    currentSlides.splice(index, 1);
    const reindexed = currentSlides.map((s, idx) => ({ ...s, slide: idx + 1 }));
    updateMutation.mutate(
      { id: trainingId, script_slides: reindexed },
      {
        onSuccess: () => {
          if (activeSlideIndex >= reindexed.length) {
            setActiveSlideIndex(Math.max(0, reindexed.length - 1));
          }
        },
      }
    );
  };

  const scrollThumbnails = (dir: "left" | "right") => {
    if (thumbnailScrollRef.current) {
      thumbnailScrollRef.current.scrollBy({
        left: dir === "left" ? -280 : 280,
        behavior: "smooth",
      });
    }
  };

  const generateSlideVideo = async (slideIndex: number) => {
    const slide = slides[slideIndex];
    const avatarOn = tObj?.avatarMode === "vidu" || tObj?.avatarMode === "static";
    if (!avatarOn) {
      toast({
        title: "AI Presenter is off",
        description: "Enable the avatar in Settings and choose a face preset first.",
        variant: "destructive",
      });
      return;
    }
    if (!tObj?.avatarImageUrl) {
      toast({
        title: "Select a face preset",
        description: "Choose an avatar face in Settings before generating videos.",
        variant: "destructive",
      });
      return;
    }
    if (shouldSkipScriptGeneration(slide)) {
      toast({
        title: "No script needed",
        description: "This video slide plays the uploaded video instead of a generated coach script.",
      });
      return;
    }
    if (!tObj || !slide?.script?.trim()) {
      toast({ title: "No script", description: "Save a script for this slide first.", variant: "destructive" });
      return;
    }
    setGeneratingSlideIndex(slideIndex);
    try {
      // Send all slides as questions but target only the one slide
      const mappedQuestions = slides.map((s: any, idx: number) => ({
        id: `slide_${s.slide}`,
        text: s.script,
        order: idx + 1,
      }));

      const res = await fetch("/api/ai/pregenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interviewId: trainingId,
          questions: mappedQuestions,
          target: { type: "question", questionIndex: slideIndex, questionId: `slide_${slide.slide}` },
          avatarUrl: tObj.avatarImageUrl,
          wait: true,
        }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Generation request failed");

      utils.training.getById.invalidate({ id: trainingId });
      toast({ title: `Slide ${slideIndex + 1} video generated!`, description: "The AI coach video is now available." });
    } catch (err: any) {
      toast({ title: "Video generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingSlideIndex(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!training) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Training not found
      </div>
    );
  }

  const hasVideos = !!tObj.pregenerated_videos || tObj.generation_status === "READY";
  const coachingUrl = tObj.publicSlug ? `/c/${tObj.publicSlug}` : null;
  const isAvatarOn = tObj.avatarMode === "vidu" || tObj.avatarMode === "static";
  const canGenerateVideo = isAvatarOn && !!tObj.avatarImageUrl;
  const selectedAvatarPresetId =
    findMatchingAvatarPreset(tObj.avatarImageUrl, tObj.avatarVoice)?.id ??
    findAvatarPresetByImageUrl(tObj.avatarImageUrl)?.id ??
    null;

  return (
    <div className="space-y-6">
      {/* Hidden Slide File Input */}
      <input
        type="file"
        ref={slideFileInputRef}
        accept=".pptx,.ppt,.pdf,video/*,image/*"
        className="hidden"
        onChange={handleUploadSlidesPdf}
      />
      <input
        type="file"
        ref={scriptFileInputRef}
        accept=".doc,.docx,.ppt,.pptx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleScriptFileChange}
      />

      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/coaching/trainings")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary shrink-0" />
            <h1 className="text-2xl font-bold">{tObj.title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {coachingUrl && (
            <>
              <Button variant="outline" size="sm" onClick={handlePreview} disabled={previewMutation.isPending}>
                {previewMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                )}
                Preview
              </Button>
              <Button variant="outline" size="sm" onClick={copyLink}>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copy Link
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={coachingUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Open
                </a>
              </Button>
            </>
          )}

          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete training?</AlertDialogTitle>
                  <AlertDialogDescription>
                    All coaching sessions for this training will also be deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => deleteMutation.mutate({ id: trainingId })}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Tabs defaultValue="content" className="w-full space-y-6">
        <TabsList className="bg-muted/50 p-1 rounded-xl flex w-fit gap-1 border shadow-sm h-auto">
          <TabsTrigger value="candidates" className="rounded-lg gap-2 text-sm px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Users className="h-4 w-4" />
            Candidates
          </TabsTrigger>
          <TabsTrigger value="content" className="rounded-lg gap-2 text-sm px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <ListOrdered className="h-4 w-4" />
            Content
          </TabsTrigger>
          <TabsTrigger value="email" className="rounded-lg gap-2 text-sm px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Mail className="h-4 w-4" />
            Email
          </TabsTrigger>
          <TabsTrigger value="quiz" className="rounded-lg gap-2 text-sm px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Brain className="h-4 w-4" />
            Quiz
          </TabsTrigger>
          <TabsTrigger value="settings" className="rounded-lg gap-2 text-sm px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <SettingsIcon className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* CANDIDATES TAB */}
        <TabsContent value="candidates" className="space-y-4">
          {selectedParticipant ? (
            <CoachingResults
              sessionId={selectedParticipant.type === "session" ? selectedParticipant.id : undefined}
              candidateId={selectedParticipant.type === "candidate" ? selectedParticipant.id : undefined}
              onBack={() => setSelectedParticipant(null)}
            />
          ) : (
            <CoachingCandidateManager
              trainingId={trainingId}
              training={tObj}
              onViewParticipant={(id, type) => setSelectedParticipant({ id, type })}
            />
          )}
        </TabsContent>

        {/* CONTENT TAB */}
        <TabsContent value="content" className="space-y-6 m-0">
          {/* PPT Main Workspace (Stage + Script Editor) */}
          <div className="grid gap-6 lg:grid-cols-12 items-stretch">
            {/* Left: Presentation Slide Preview Box (7 cols) */}
            <div className="lg:col-span-7 flex flex-col justify-between h-full space-y-2">
              <div className="w-full aspect-[16/9] rounded-xl border bg-card shadow-md flex flex-col overflow-hidden relative group border-border">
                {/* Top Header Badge inside slide stage */}
                <div className="absolute top-3 left-4 z-10">
                  <Badge variant="secondary" className="font-semibold text-xs opacity-90 backdrop-blur-md">
                    {activeSlide?.title || `Slide ${activeSlideIndex + 1}`}
                  </Badge>
                </div>

                {/* Exact Presentation Slide Visual Rendering */}
                <div className="flex-1 relative w-full min-h-0 bg-slate-900/5 dark:bg-slate-950/40 [container-type:size]">
                  <div
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border bg-slate-950/5"
                    style={{
                      width: `min(100cqw, calc(100cqh * ${activeSlideAspectRatio}))`,
                      height: `min(100cqh, calc(100cqw * ${1 / activeSlideAspectRatio}))`,
                    }}
                  >
                    {activeSlide?.imageUrl ? (
                      <img
                        src={activeSlide.imageUrl}
                        alt={`Slide ${activeSlideIndex + 1}`}
                        className="absolute inset-0 h-full w-full object-contain"
                        onLoad={(e) => {
                          const img = e.currentTarget;
                          if (img.naturalWidth && img.naturalHeight) {
                            setActiveSlideAspectRatio(img.naturalWidth / img.naturalHeight);
                          }
                        }}
                      />
                    ) : !activeSlide?.media ? (
                      <div className="absolute inset-4 flex flex-col justify-center items-center p-8 bg-card border rounded-lg shadow-sm text-center space-y-4">
                        <div className="px-4 py-1.5 rounded-full bg-primary/10 text-primary font-bold text-xs">
                          Presentation Slide {activeSlideIndex + 1}
                        </div>
                        <h2 className="text-2xl font-extrabold tracking-tight text-foreground max-w-lg">
                          {activeSlide?.title || `Slide ${activeSlideIndex + 1}`}
                        </h2>
                        <div className="w-16 h-1 bg-primary/40 rounded-full mx-auto" />
                        <p className="text-xs text-muted-foreground max-w-md line-clamp-3">
                          {slideScript || "No script entered for this slide yet."}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  {activeSlide?.media && (
                    <SlideMediaOverlay
                      media={activeSlide.media}
                      editable
                      onChange={handleMediaRectChange}
                    />
                  )}
                </div>
              </div>

              {/* Page Counter */}
              <div className="text-center text-xs font-semibold text-muted-foreground">
                Page {activeSlideIndex + 1}/{slides.length || 1}
              </div>
            </div>

            {/* Right: AI Script Box (5 cols) */}
            <div className="lg:col-span-5 flex flex-col justify-between h-full space-y-4">
              <Card className="shadow-md border-primary/20 flex-1 flex flex-col justify-between">
                <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-3 border-b shrink-0">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    Script
                  </CardTitle>
                  <div
                    className={`flex items-center gap-1.5 rounded-lg border-2 border-dashed px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
                      isDraggingScriptFile
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-primary/30 bg-muted/30 hover:bg-muted/60 text-foreground"
                    } ${generatingScript ? "opacity-60 pointer-events-none" : ""}`}
                    onClick={() => !generatingScript && scriptFileInputRef.current?.click()}
                    onDragEnter={handleScriptDragOver}
                    onDragOver={handleScriptDragOver}
                    onDragLeave={handleScriptDragLeave}
                    onDrop={handleScriptFileDrop}
                    title="Upload a document file to generate slide scripts"
                  >
                    {generatingScript ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" />
                    )}
                    <span className="pointer-events-none whitespace-nowrap">
                      {generatingScript
                        ? "Generating scripts..."
                        : isDraggingScriptFile
                          ? "Drop file to generate"
                        : "Upload Document"}
                    </span>
                  </div>
                </CardHeader>

                {/* Progress bar for script generation */}
                {(generationProgress || generatingScript) && (
                  <div className="px-4 py-2 border-b bg-muted/30 space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                      <span>
                        {generationProgress
                          ? `Generating Slide ${generationProgress.current + 1} of ${generationProgress.total}`
                          : "Extracting document and generating slide scripts..."}
                      </span>
                      {generationProgress && (
                        <span>{Math.round((generationProgress.current / generationProgress.total) * 100)}%</span>
                      )}
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-primary transition-all duration-300 ${
                          generatingScript && !generationProgress ? "w-2/3 animate-pulse" : ""
                        }`}
                        style={
                          generationProgress
                            ? { width: `${(generationProgress.current / generationProgress.total) * 100}%` }
                            : undefined
                        }
                      />
                    </div>
                  </div>
                )}

                {/* Video Generation Progress bar */}
                {generatingSlideIndex === activeSlideIndex && (
                  <div className="px-4 py-2 border-b bg-muted/30 space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                      <span>Generating Video for Slide {activeSlideIndex + 1}...</span>
                      <span>{videoProgress}%</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-1000 ease-linear"
                        style={{ width: `${videoProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Video Preview moved to Dialog next to Generate Video */}

                <CardContent className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <Textarea
                    value={slideScript}
                    onChange={(e) => setSlideScript(e.target.value)}
                    placeholder={
                      isVideoMediaSlide(activeSlide)
                        ? "Video slides play the uploaded video — a script is optional."
                        : "Enter speech script for this slide..."
                    }
                    className="flex-1 min-h-[140px] resize-none font-sans text-sm leading-relaxed border-muted focus-visible:ring-primary"
                  />

                  {/* TTS Audio Preview Bar */}
                  <div className="flex items-center gap-3 bg-muted/40 p-2.5 rounded-lg border shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-primary hover:text-primary/80"
                      onClick={handleToggleTTS}
                      title={isPlayingTTS ? "Stop TTS Preview" : "Play Basic TTS Preview"}
                    >
                      {isPlayingTTS ? (
                        <Square className="h-4 w-4 fill-current" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </Button>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden relative">
                      <div
                        className={`h-full bg-primary rounded-full transition-all duration-300 ${
                          isPlayingTTS ? "w-full animate-pulse" : "w-2/3"
                        }`}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-muted-foreground shrink-0">
                      {isPlayingTTS ? "Playing TTS..." : "TTS Preview"}
                    </span>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-1 shrink-0">
                    {(() => {
                      let activeSlideVideoUrl = null;
                      const slideKey = `slide_${activeSlide?.slide}`;
                      
                      // Try flat object format first (legacy or simple storage)
                      if (typeof tObj?.pregenerated_videos?.[slideKey] === 'string') {
                        activeSlideVideoUrl = tObj.pregenerated_videos[slideKey];
                      } 
                      // Try V2 store format
                      else if (tObj?.pregenerated_videos?.questions) {
                        const clip = tObj.pregenerated_videos.questions.find((q: any) => q.questionId === slideKey);
                        activeSlideVideoUrl = clip?.versions?.find((v: any) => v.v === clip.activeVersion)?.url || clip?.versions?.[0]?.url;
                      }

                      return (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-9 gap-1.5"
                              disabled={!activeSlideVideoUrl || generatingSlideIndex === activeSlideIndex}
                            >
                              <Play className="h-3.5 w-3.5" />
                              Preview
                            </Button>
                          </DialogTrigger>
                          {activeSlideVideoUrl && (
                            <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden bg-black border-slate-800">
                              <video 
                                src={activeSlideVideoUrl} 
                                controls 
                                autoPlay
                                preload="metadata"
                                className="w-full h-auto max-h-[80vh] object-contain"
                              />
                            </DialogContent>
                          )}
                        </Dialog>
                      );
                    })()}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-9 gap-1.5"
                      disabled={
                        !canGenerateVideo ||
                        generatingSlideIndex === activeSlideIndex ||
                        generatingSlideIndex !== null ||
                        shouldSkipScriptGeneration(activeSlide)
                      }
                      title={
                        shouldSkipScriptGeneration(activeSlide)
                          ? "Video slides play the uploaded video instead of a generated coach clip"
                          : !isAvatarOn
                            ? "Enable AI Presenter Avatar in Settings first"
                            : !tObj.avatarImageUrl
                              ? "Select a face preset in Settings first"
                              : undefined
                      }
                      onClick={() => generateSlideVideo(activeSlideIndex)}
                    >
                      {generatingSlideIndex === activeSlideIndex ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Video className="h-3.5 w-3.5" />
                      )}
                      {generatingSlideIndex === activeSlideIndex ? "Generating..." : "Generate Video"}
                    </Button>
                    <Button
                      size="sm"
                      className="bg-[#1b2a4a] hover:bg-[#15233e] dark:bg-[#152442] dark:hover:bg-[#1d325a] text-white text-xs h-9 gap-1.5"
                      onClick={handleSaveActiveSlide}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Save Script
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Bottom Horizontal Thumbnails Carousel */}
          <div
            className={`border-t pt-4 space-y-2 ${isDraggingSlidesFile ? "ring-2 ring-primary/60 rounded-xl bg-primary/5" : ""}`}
            onDragOver={handleSlidesDragOver}
            onDragLeave={handleSlidesDragLeave}
            onDrop={handleSlidesDrop}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">Presentation Slides</span>
            </div>

            {isDraggingSlidesFile && (
              <div className="text-xs text-primary font-semibold">
                Drop your PDF/PPT/PPTX/images/video to insert slides
              </div>
            )}

            {mediaInsertProgress && (
              <div className="rounded-xl border bg-muted/30 px-4 py-3 shadow-sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      Inserting {mediaInsertProgress.mediaTypeLabel}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {mediaInsertProgress.fileName} - {mediaInsertProgress.detail}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {mediaInsertProgress.progress}%
                    </p>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {mediaInsertProgress.mode === "actual"
                        ? "Live upload"
                        : mediaInsertProgress.mode === "mixed"
                          ? "Live + staged"
                          : "Staged"}
                    </p>
                  </div>
                </div>
                <Progress value={mediaInsertProgress.progress} className="h-2.5 bg-muted" />
              </div>
            )}

            <div className="relative flex items-center group">
              {/* Scroll Left Button */}
              <Button
                variant="outline"
                size="icon"
                className="absolute left-1 z-10 h-8 w-8 rounded-full shadow-md bg-background/90 hover:bg-background border"
                onClick={() => scrollThumbnails("left")}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              {/* Thumbnails Track */}
              <div
                ref={thumbnailScrollRef}
                className="flex items-center gap-1 overflow-x-auto py-3 px-10 scrollbar-none w-full scroll-smooth"
              >
                <button
                  type="button"
                  title="Insert slides, video, or image here"
                  disabled={uploadingSlides}
                  onClick={() => openInsertPicker(0)}
                  className="shrink-0 h-8 w-8 rounded-full border border-dashed border-primary/50 text-primary hover:bg-primary/10 hover:border-primary flex items-center justify-center disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                {slides.map((slide: any, index: number) => {
                  const isSelected = activeSlideIndex === index;
                  // Check if this slide already has a generated video
                  const pregVids = tObj?.pregenerated_videos as any;
                  const hasVideo = !!(() => {
                    if (!pregVids) return false;
                    const key = `slide_${slide.slide}`;
                    if (pregVids[key]) return true;
                    const clip = Array.isArray(pregVids.questions) 
                      ? pregVids.questions.find((c: any) => c?.questionId === key) || pregVids.questions[index]
                      : null;
                    if (!clip) return false;
                    if (typeof clip === "string") return !!clip;
                    if (clip?.versions?.length) return true;
                    return !!clip?.url;
                  })();
                  return (
                    <div key={index} className="flex items-center gap-1 shrink-0">
                    <div className="flex flex-col items-center shrink-0 space-y-1">
                      <div
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragLeave={handleDragLeave}
                        onDragEnd={handleDragEnd}
                        onDrop={(e) => handleDrop(e, index)}
                        onClick={() => setActiveSlideIndex(index)}
                        className={`w-36 aspect-[16/9] rounded-lg border-2 cursor-pointer transition-all duration-200 overflow-hidden relative flex flex-col justify-center items-center p-1 bg-card ${
                          isSelected
                            ? "border-primary shadow-lg ring-2 ring-primary/20 scale-105"
                            : "border-border hover:border-primary/50 opacity-80 hover:opacity-100"
                        } ${dragOverIndex === index && dragIndexRef.current !== index ? "border-dashed border-primary bg-primary/5 scale-105" : ""} ${dragIndexRef.current === index ? "opacity-50" : ""}`}
                      >
                        {slide.media?.type === "video" ? (
                          <video src={slide.media.url} className="w-full h-full object-contain rounded select-none" muted preload="metadata" draggable={false} />
                        ) : slide.media?.type === "image" ? (
                          <img src={slide.media.url} alt={`Page ${index + 1}`} className="w-full h-full object-contain rounded select-none" draggable={false} />
                        ) : slide.imageUrl ? (
                          <img src={slide.imageUrl} alt={`Page ${index + 1}`} className="w-full h-full object-contain rounded select-none" draggable={false} />
                        ) : (
                          <div className="w-full h-full bg-card p-2 flex flex-col justify-between items-center text-center border rounded select-none">
                            <span className="text-[10px] font-extrabold text-foreground truncate w-full select-none">{slide.title || `Slide ${index + 1}`}</span>
                            <div className="w-6 h-0.5 bg-primary/40 rounded-full select-none" />
                            <span className="text-[8px] text-muted-foreground line-clamp-1 select-none">{slide.script}</span>
                          </div>
                        )}

                        {/* Video status indicator */}
                        {(hasVideo || slide.media?.type === "video") && (
                          <div className="absolute top-1 left-1">
                            <div className="h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center">
                              <Video className="h-2.5 w-2.5 text-white" />
                            </div>
                          </div>
                        )}

                        {/* Context menu dropdown */}
                        <div className="absolute top-1 right-1 opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="secondary" size="icon" className="h-5 w-5 p-0 rounded bg-background/80 backdrop-blur-sm">
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openInsertPicker(index + 1)}>Insert after</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicateSlide(index)}>Duplicate</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDeleteSlide(index)} className="text-destructive">Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      <span className="text-[11px] font-medium text-muted-foreground">
                        Page {index + 1}
                      </span>
                    </div>
                    <button
                      type="button"
                      title="Insert slides, video, or image here"
                      disabled={uploadingSlides}
                      onClick={() => openInsertPicker(index + 1)}
                      className="shrink-0 h-8 w-8 rounded-full border border-dashed border-primary/50 text-primary hover:bg-primary/10 hover:border-primary flex items-center justify-center disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    </div>
                  );
                })}
              </div>

              {/* Scroll Right Button */}
              <Button
                variant="outline"
                size="icon"
                className="absolute right-1 z-10 h-8 w-8 rounded-full shadow-md bg-background/90 hover:bg-background border"
                onClick={() => scrollThumbnails("right")}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* EMAIL TAB */}
        <TabsContent value="email" className="space-y-4">
          <CoachingEmailTab
            trainingId={trainingId}
            training={tObj}
            isAdmin={isAdmin}
          />
        </TabsContent>

        {/* QUIZ TAB */}
        <TabsContent value="quiz" className="space-y-4">
          <CoachingQuizTab
            trainingId={trainingId}
            training={tObj}
          />
        </TabsContent>

        {/* SETTINGS TAB */}
        <TabsContent value="settings" className="space-y-6">
          <div className="w-full space-y-6">
            <Card className="w-full">
              <CardHeader>
                <CardTitle>Training Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold">Title</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold">Description</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                  />
                </div>
                <Button 
                  onClick={() => updateMutation.mutate({ id: trainingId, title, description })}
                  disabled={updateMutation.isPending || !title.trim()}
                >
                  {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Details
                </Button>
              </CardContent>
            </Card>

            <Card className="w-full">
              <CardHeader>
                <CardTitle>Language</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Default language</Label>
                  <Select
                    value={trainingLanguage}
                    onValueChange={(value) => {
                      setTrainingLanguage(value);
                      updateMutation.mutate({ id: trainingId, language: value });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.value} value={l.value}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {multilingualEnabled && !isAvatarOn && (
                    <p className="text-xs text-muted-foreground">
                      Default language. Learners can choose another language when they start.
                    </p>
                  )}
                </div>
                {!isAvatarOn && (
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Languages className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <Label>Multilingual</Label>
                          <p className="text-xs text-muted-foreground">
                            Candidate chooses language
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={multilingualEnabled}
                        onCheckedChange={(checked) => {
                          setMultilingualEnabled(checked);
                          updateMutation.mutate({
                            id: trainingId,
                            multilingualEnabled: checked,
                          });
                        }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="w-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle>AI Presenter Avatar</CardTitle>
                  <Switch
                    checked={isAvatarOn}
                    onCheckedChange={(checked) => {
                      updateMutation.mutate({ id: trainingId, avatarMode: checked ? "vidu" : "none" });
                    }}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isAvatarOn ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase">
                        Face presets
                      </label>
                      {!tObj.avatarImageUrl && (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Select a face before generating videos. This image is sent to Runware.
                        </p>
                      )}
                      <div className="grid grid-cols-5 gap-2 lg:grid-cols-10">
                        {AVATAR_PRESETS.map((preset) => {
                          const selected =
                            selectedAvatarPresetId === preset.id ||
                            (!selectedAvatarPresetId &&
                              findMatchingAvatarPreset(tObj.avatarImageUrl, voice)?.id ===
                                preset.id);
                          return (
                            <AvatarPresetTile
                              key={preset.id}
                              preset={preset}
                              selected={selected}
                              onSelect={() => handleSelectAvatarPreset(preset.id)}
                              className="rounded-lg"
                              labelClassName="text-[10px]"
                            />
                          );
                        })}
                      </div>
                    </div>

                    <Card className="w-full border-primary/20 p-4 shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-primary/20 bg-primary/10 shadow-sm">
                          {tObj.avatarImageUrl ? (
                            <img
                              src={tObj.avatarImageUrl}
                              alt={tObj.aiName}
                              className="h-full w-full object-cover object-[center_top]"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Brain className="h-8 w-8 text-primary" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-4">
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground uppercase">Coach Name</label>
                            {editingAiName ? (
                              <div className="flex w-full max-w-sm items-center gap-2">
                                <Input
                                  autoFocus
                                  value={aiName}
                                  onChange={(e) => setAiName(e.target.value)}
                                  onKeyDown={(e) => e.key === "Enter" && handleSaveAiName()}
                                  onBlur={handleSaveAiName}
                                  className="h-8 text-sm font-bold"
                                />
                              </div>
                            ) : (
                              <div className="flex cursor-pointer items-center gap-2" onClick={() => setEditingAiName(true)}>
                                <p className="truncate text-base font-bold">
                                  {aiName || "AI Coach"}
                                </p>
                                <Pencil className="h-3 w-3 text-muted-foreground transition-opacity" />
                              </div>
                            )}
                          </div>
                          
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground uppercase">Voice</label>
                            <Select
                              value={resolveAvatarVoice(voice)}
                              onValueChange={(v) => handleSaveVoice(v as AvatarVoice)}
                            >
                              <SelectTrigger className="h-8 w-full max-w-[200px] text-sm">
                                <SelectValue placeholder="Select a voice" />
                              </SelectTrigger>
                              <SelectContent>
                                {AVATAR_VOICES.map((v) => (
                                  <SelectItem key={v} value={v}>
                                    {v}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed bg-muted/10 p-4 py-8 text-center text-sm text-muted-foreground">
                    AI Presenter Avatar is disabled. Slides will be presented without a talking video avatar.
                  </div>
                )}
                {isAvatarOn && (
                  <p className="text-xs text-muted-foreground">
                    Use the <strong>Generate Video</strong> button on each slide in the Content tab to generate individual AI coach videos.
                    {!tObj.avatarImageUrl ? " Select a face preset first." : ""}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
