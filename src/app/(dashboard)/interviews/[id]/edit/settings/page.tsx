"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AI_TONES, LANGUAGES } from "@/lib/constants";
import { SUPPORTED_LANGUAGES } from "@/lib/languages";
import {
  AVATAR_PRESETS,
  AVATAR_VOICES,
  DEFAULT_AVATAR_VOICE,
  absoluteAvatarImageUrl,
  findMatchingAvatarPreset,
  getAvatarVoiceAudioPath,
  resolveAvatarVoice,
  type AvatarVoice,
} from "@/lib/avatar-voices";
import { AvatarPresetTile } from "@/components/interview/avatar-preset-tile";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc/client";
import { cn, copyToClipboard } from "@/lib/utils";
import {
    Copy,
    Globe,
    LinkIcon as LinkPlusIcon,
    Loader2,
    Lock,
    MessageSquare,
    Mic,
    ShieldCheck,
    Upload,
    Video,
    X,
    PenLine,
    Code2,
    Languages,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useEditInterview } from "../edit-context";
import { getInterviewTypeCreditLabel } from "@/lib/interview-credits";
import { interviewAllowsCandidateLanguageChoice } from "@/lib/languages";

function normalizeInterviewLanguage(language?: string | null): string {
  if (!language) return "en";
  const trimmed = language.trim();
  // Check exact match against the full supported language registry (case-insensitive).
  const match = SUPPORTED_LANGUAGES.find(
    (l) => l.code.toLowerCase() === trimmed.toLowerCase(),
  );
  if (match) return match.code;
  // Fall back to English for any unrecognised value.
  return "en";
}

export default function SettingsTab() {
  const { interview, interviewId, updateMutation, isViewer } = useEditInterview();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const publishMutation = trpc.interview.publish.useMutation();
  const { data: creditRates } = trpc.creditRates.list.useQuery();

  const [title, setTitle] = useState<string>(interview.title);
  const [description, setDescription] = useState<string>(interview.description ?? "");
  const [objective, setObjective] = useState<string>(interview.objective ?? "");
  const [jobDescription, setJobDescription] = useState<string>(interview.jobDescription ?? "");
  const [whiteboardEnabled, setWhiteboardEnabled] = useState<boolean>(interview.whiteboardEnabled ?? true);
  const [codeEnabled, setCodeEnabled] = useState<boolean>(interview.codeEnabled ?? true);
  const [aiTone, setAiTone] = useState<string>(interview.aiTone);
  const [language, setLanguage] = useState<string>(
    normalizeInterviewLanguage(interview.language),
  );
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<string | number>(
    interview.timeLimitMinutes ?? "",
  );
  const [antiCheatingEnabled, setAntiCheatingEnabled] = useState<boolean>(
    interview.antiCheatingEnabled ?? false,
  );
  const [multilingualEnabled, setMultilingualEnabled] = useState<boolean>(
    interview.multilingualEnabled ?? false,
  );
  const [avatarImageUrl, setAvatarImageUrl] = useState<string | null>(
    (interview as { avatarImageUrl?: string | null }).avatarImageUrl ?? null,
  );
  const [avatarVoice, setAvatarVoice] = useState<AvatarVoice>(
    resolveAvatarVoice((interview as { avatarVoice?: string | null }).avatarVoice),
  );
  const [selectedAvatarPresetId, setSelectedAvatarPresetId] = useState<string | null>(
    () =>
      findMatchingAvatarPreset(
        (interview as { avatarImageUrl?: string | null }).avatarImageUrl,
        (interview as { avatarVoice?: string | null }).avatarVoice,
      )?.id ?? null,
  );
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const voicePreviewRef = useRef<HTMLAudioElement | null>(null);

  const requireInvite = interview.requireInvite ?? true;
  const hasShareableLink = !requireInvite;
  const shareableUrl =
    hasShareableLink &&
    interview.publicSlug &&
    interview.isActive &&
    typeof window !== "undefined"
      ? `${window.location.origin}/i/${interview.publicSlug}`
      : null;

  const isLinkLoading = updateMutation.isLoading || publishMutation.isLoading;

  const handleCreateShareableLink = useCallback(() => {
    publishMutation.mutate(
      { id: interviewId },
      {
        onSuccess: () => {
          updateMutation.mutate(
            { id: interviewId, requireInvite: false },
            {
              onSuccess: () => {
                utils.interview.getById.invalidate({ id: interviewId });
                toast({ title: "Shareable link created" });
              },
            },
          );
        },
      },
    );
  }, [interviewId, publishMutation, updateMutation, utils, toast]);

  const handleRevokeShareableLink = useCallback(() => {
    updateMutation.mutate(
      { id: interviewId, requireInvite: true, isActive: false },
      {
        onSuccess: () => {
          utils.interview.getById.invalidate({ id: interviewId });
          toast({ title: "Shareable link revoked" });
        },
      },
    );
  }, [interviewId, updateMutation, utils, toast]);

  const getInterviewTypeLabel = () =>
    getInterviewTypeCreditLabel({
      voiceEnabled: true,
      avatarMode: interview.avatarMode,
      is_voice_only: interview.is_voice_only,
      timeLimitMinutes:
        timeLimitMinutes === "" || timeLimitMinutes == null
          ? interview.timeLimitMinutes
          : Number(timeLimitMinutes),
    }, creditRates);

  const playVoicePreview = useCallback((voice: AvatarVoice) => {
    const path = getAvatarVoiceAudioPath(voice);
    if (!path) return;
    if (!voicePreviewRef.current) {
      voicePreviewRef.current = new Audio();
    }
    const audio = voicePreviewRef.current;
    audio.pause();
    audio.src = path;
    audio.currentTime = 0;
    void audio.play().catch(() => {
      /* ignore autoplay / missing file */
    });
  }, []);

  const handleSelectAvatarPreset = useCallback((presetId: string) => {
    const preset = AVATAR_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    // Stop any dropdown MP3 — selected tile video carries its own audio.
    voicePreviewRef.current?.pause();
    setSelectedAvatarPresetId(preset.id);
    setAvatarImageUrl(absoluteAvatarImageUrl(preset.imagePath));
    setAvatarVoice(preset.voice);
  }, []);

  const handleAvatarVoiceChange = useCallback(
    (voice: AvatarVoice) => {
      setAvatarVoice(voice);
      setSelectedAvatarPresetId((prev) => {
        const matched = AVATAR_PRESETS.find((p) => p.voice === voice);
        if (prev && matched && prev === matched.id) return prev;
        // Custom voice pick: keep current still image, preview mp3 sample.
        return null;
      });
      playVoicePreview(voice);
    },
    [playVoicePreview],
  );

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("Avatar image must be less than 5MB");
      }
      if (!file.type.startsWith("image/")) {
        throw new Error("Please upload an image file");
      }
      const supabase = createClient();
      const fileExt = file.name.split(".").pop() || "png";
      const filePath = `avatars/interview_${interviewId}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("public-assets")
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from("public-assets").getPublicUrl(filePath);
      setSelectedAvatarPresetId(null);
      setAvatarImageUrl(publicUrl);
      toast({ title: "Avatar image uploaded" });
    } catch (err: unknown) {
      toast({
        title: "Failed to upload avatar",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setUploadingAvatar(false);
      if (avatarFileRef.current) avatarFileRef.current.value = "";
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Shareable Link */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Shareable Link</CardTitle>
        </CardHeader>
        <CardContent>
          {hasShareableLink ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary-100 text-secondary-600 dark:bg-secondary-900/30 dark:text-secondary-400">
                  <Globe className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Open access enabled</p>
                  <p className="text-xs text-muted-foreground">
                    Anyone with this link can start the interview
                  </p>
                </div>
              </div>
              {shareableUrl && (
                <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                  <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {shareableUrl}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 px-2"
                    onClick={() => {
                      copyToClipboard(shareableUrl);
                      toast({ title: "Link copied!" });
                    }}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copy
                  </Button>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={handleRevokeShareableLink}
                disabled={isLinkLoading || isViewer}
              >
                {isLinkLoading ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="mr-2 h-3.5 w-3.5" />
                )}
                Revoke shareable link
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Lock className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Invite only</p>
                  <p className="text-xs text-muted-foreground">
                    Only sessions added from the Sessions tab can access this
                    interview via their unique invite links.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateShareableLink}
                disabled={isLinkLoading || isViewer}
              >
                {isLinkLoading ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LinkPlusIcon className="mr-2 h-3.5 w-3.5" />
                )}
                Create shareable link
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Interview Type</Label>
            <Input value={getInterviewTypeLabel()} readOnly disabled className="bg-muted/50 cursor-not-allowed" />
          </div>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={isViewer} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isViewer}
            />
          </div>
          <div className="space-y-2">
            <Label>Objective</Label>
            <Textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              disabled={isViewer}
            />
          </div>
          <div className="space-y-2">
            <Label>Job Description (JD)</Label>
            <Textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              disabled={isViewer}
              className="min-h-[100px]"
            />
          </div>
          <div className="space-y-2">
            <Label>Duration (minutes)</Label>
            <Select
              value={timeLimitMinutes ? String(timeLimitMinutes) : "none"}
              onValueChange={(val) => setTimeLimitMinutes(val === "none" ? "" : val)}
              disabled={isViewer}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No limit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No limit</SelectItem>
                {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60].map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {minutes} minutes
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Interactive Tools</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Choose the tools available to participants during the interview
            </p>
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PenLine className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label>Whiteboard</Label>
                    <p className="text-xs text-muted-foreground">Freehand drawing and sketching</p>
                  </div>
                </div>
                <Switch
                  checked={whiteboardEnabled}
                  onCheckedChange={setWhiteboardEnabled}
                  disabled={isViewer}
                />
              </div>
              <div className="border-t" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label>Code Editor</Label>
                    <p className="text-xs text-muted-foreground">Multi-language code sandbox</p>
                  </div>
                </div>
                <Switch
                  checked={codeEnabled}
                  onCheckedChange={setCodeEnabled}
                  disabled={isViewer}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>AI Name</Label>
            <Input value="Inluwa" readOnly disabled className="bg-muted" />
          </div>
          <div className="space-y-2">
            <Label>Tone</Label>
            <Select value={aiTone} onValueChange={setAiTone} disabled={isViewer}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_TONES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Language</Label>
            <Select value={language} onValueChange={setLanguage} disabled={isViewer}>
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
            {multilingualEnabled && interviewAllowsCandidateLanguageChoice(interview) && (
              <p className="text-xs text-muted-foreground">
                Default language. Candidates can choose another language when they start.
              </p>
            )}
          </div>
          {interviewAllowsCandidateLanguageChoice(interview) && (
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
                  onCheckedChange={setMultilingualEnabled}
                  disabled={isViewer}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {interview.is_voice_only && (
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Non-interactive avatar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-xs text-muted-foreground">
              Portrait still and voice used when regenerating pregenerated clips.
              Change these, then re-run pregeneration from Content to update videos.
            </p>

            <div className="space-y-3">
              <Label>Presets</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {AVATAR_PRESETS.map((preset) => {
                  const selected =
                    selectedAvatarPresetId === preset.id ||
                    (!selectedAvatarPresetId &&
                      findMatchingAvatarPreset(avatarImageUrl, avatarVoice)
                        ?.id === preset.id);
                  return (
                    <AvatarPresetTile
                      key={preset.id}
                      preset={preset}
                      selected={selected}
                      disabled={isViewer}
                      onSelect={() => handleSelectAvatarPreset(preset.id)}
                      className="rounded-lg"
                      labelClassName="text-[10px]"
                    />
                  );
                })}
              </div>
            </div>

            <div className="relative flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                — or generate your own —
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex items-center gap-3">
                <div className="h-20 w-20 overflow-hidden rounded-lg border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatarImageUrl || "/avatars/woman-v1.png"}
                    alt="Avatar preview"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="space-y-2">
                  <input
                    ref={avatarFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                    disabled={isViewer}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isViewer || uploadingAvatar}
                    onClick={() => avatarFileRef.current?.click()}
                  >
                    {uploadingAvatar ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-3.5 w-3.5" />
                    )}
                    {avatarImageUrl ? "Change image" : "Upload image"}
                  </Button>
                  {avatarImageUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isViewer}
                      className="text-muted-foreground"
                      onClick={() => {
                        setSelectedAvatarPresetId(null);
                        setAvatarImageUrl(null);
                      }}
                    >
                      Use default
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <Label>Voice</Label>
                <Select
                  value={avatarVoice}
                  onValueChange={(v) => handleAvatarVoiceChange(v as AvatarVoice)}
                  disabled={isViewer}
                >
                  <SelectTrigger>
                    <SelectValue />
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
          </CardContent>
        </Card>
      )}

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Anti-Cheating Mode</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label>Enable Anti-Cheating</Label>
                  <p className="text-xs text-muted-foreground">
                    Requires camera, mic & screen sharing. Monitors tab switches, blocks external paste, and detects multiple screens
                  </p>
                </div>
              </div>
              <Switch
                checked={antiCheatingEnabled}
                onCheckedChange={setAntiCheatingEnabled}
                disabled={isViewer}
              />
            </div>
            {antiCheatingEnabled && (
              <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="font-medium">When enabled, interviewees will experience:</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  <li>Camera, microphone, and screen sharing will be mandatory (cannot be skipped)</li>
                  <li>Tab switching and window focus loss will be tracked and flagged</li>
                  <li>Pasting content from outside the interview page will be blocked</li>
                  <li>Multiple monitor setups will be detected and warned against</li>
                </ul>
                <p className="mt-1.5 text-amber-700 dark:text-amber-300">
                  Candidates will be informed of these restrictions before starting.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-end">
        <Button
          onClick={() =>
            updateMutation.mutate({
              id: interviewId,
              title,
              description,
              objective,
              jobDescription,
              chatEnabled: true,
              voiceEnabled: true,
              videoEnabled: true,
              whiteboardEnabled,
              codeEnabled,
              aiName: "Inluwa",
              aiTone,
              followUpDepth: "LIGHT",
              language,
              timeLimitMinutes: timeLimitMinutes
                ? Number(timeLimitMinutes)
                : null,
              antiCheatingEnabled,
              multilingualEnabled: interviewAllowsCandidateLanguageChoice(interview)
                ? multilingualEnabled
                : false,
              ...(interview.is_voice_only
                ? {
                    avatarImageUrl,
                    avatarVoice: avatarVoice || DEFAULT_AVATAR_VOICE,
                  }
                : {}),
            })
          }
          disabled={updateMutation.isLoading || isViewer}
        >
          {updateMutation.isLoading && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
