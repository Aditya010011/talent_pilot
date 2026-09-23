"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc/client";
import { createClient } from "@/lib/supabase/client";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  Mail,
  MailCheck,
  MailX,
  Save,
  Send,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useEditInterview } from "../edit-context";
import { DEFAULT_EMAIL_TEMPLATE } from "@/lib/email-constants";

/* ------------------------------------------------------------------ */
/*  Template variable buttons                                          */
/* ------------------------------------------------------------------ */
const TEMPLATE_VARS = [
  { label: "Candidate Name", value: "{{candidate_name}}" },
  { label: "Interview Title", value: "{{interview_title}}" },
  { label: "Invite Link", value: "{{invite_link}}" },
  { label: "Description", value: "{{interview_description}}" },
  { label: "Company Name", value: "{{company_name}}" },
  { label: "Validity Period", value: "{{validity_period}}" },
] as const;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function EmailInviteTab() {
  const { interviewId, interview, isViewer } = useEditInterview();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // ── Template data ──
  const templateQuery = trpc.emailInvite.getTemplate.useQuery({
    interviewId,
  });
  const saveMutation = trpc.emailInvite.saveTemplate.useMutation({
    onSuccess: () => {
      utils.emailInvite.getTemplate.invalidate({ interviewId });
      toast({ title: "Email template saved" });
    },
    onError: (err) => {
      toast({
        title: "Failed to save template",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // ── Send mutations ──
  const sendOneMutation = trpc.emailInvite.sendToCandidate.useMutation({
    onSuccess: () => {
      utils.emailInvite.getSendLogs.invalidate({ interviewId });
      toast({ title: "Email sent successfully" });
    },
    onError: (err) => {
      toast({
        title: "Failed to send email",
        description: err.message,
        variant: "destructive",
      });
    },
  });
  const sendBulkMutation = trpc.emailInvite.sendBulk.useMutation({
    onSuccess: (result) => {
      utils.emailInvite.getSendLogs.invalidate({ interviewId });
      setSelectedCandidateIds(new Set());
      toast({
        title: `Emails sent: ${result.sent} success, ${result.failed} failed`,
      });
    },
    onError: (err) => {
      toast({
        title: "Failed to send emails",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // ── Candidates & logs ──
  const candidateList = trpc.candidate.list.useQuery({ interviewId });
  const sendLogs = trpc.emailInvite.getSendLogs.useQuery({
    interviewId,
    limit: 100,
  });

  // ── Local state for template editor ──
  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [autoSendReminder, setAutoSendReminder] = useState<boolean | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(
    new Set(),
  );
  const [showPreview, setShowPreview] = useState(false);

  // Initialize from query data
  const tmpl = templateQuery.data;
  const dbSubject = tmpl?.subject || DEFAULT_EMAIL_TEMPLATE.subject;
  const dbBody = tmpl?.body || DEFAULT_EMAIL_TEMPLATE.body;
  const dbReminderSubject = (tmpl as any)?.reminderSubject || DEFAULT_EMAIL_TEMPLATE.reminderSubject;
  const dbReminderBody = (tmpl as any)?.reminderBody || (DEFAULT_EMAIL_TEMPLATE as any).reminderBody;

  const previewCandidate = candidateList.data?.candidates?.[0];
  const previewStartDate = startDate || previewCandidate?.startDate;
  const previewEndDate = endDate || previewCandidate?.endDate;
  let previewValidity = "";
  if (previewStartDate && previewEndDate) {
    previewValidity = `<strong>Available:</strong> ${new Date(previewStartDate).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} to ${new Date(previewEndDate).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
  } else if (previewStartDate) {
    previewValidity = `<strong>Available:</strong> From ${new Date(previewStartDate).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
  } else if (previewEndDate) {
    previewValidity = `<strong>Available:</strong> Until ${new Date(previewEndDate).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
  }

  const effectiveSubject = subject !== null ? subject : dbSubject;
  const effectiveBody = body !== null ? body : dbBody;
  const isAutoSendReminder = autoSendReminder !== null ? autoSendReminder : (dbReminderBody === "AUTO_SEND");

  const effectiveLogoUrl =
    logoUrl !== null ? logoUrl : (tmpl as any)?.logoUrl ?? "";
  const effectiveReplyTo =
    replyTo !== null ? replyTo : (tmpl as any)?.replyTo ?? "";


  // ── Candidates with email ──
  const candidates = useMemo(() => {
    const list = candidateList.data?.candidates ?? [];
    return list.filter(
      (c: any) => c.email && c.email.trim(),
    ) as Array<{
      id: string;
      name: string;
      email: string;
      inviteToken: string | null;
    }>;
  }, [candidateList.data]);

  // ── Log lookup: most recent send per candidate ──
  const lastSendByCandidate = useMemo(() => {
    const map = new Map<
      string,
      { sentAt: string; status: string }
    >();
    for (const log of sendLogs.data ?? []) {
      if (log.candidateId && !map.has(log.candidateId)) {
        map.set(log.candidateId, {
          sentAt: log.sentAt,
          status: log.status,
        });
      }
    }
    return map;
  }, [sendLogs.data]);

  // ── Handlers ──
  const handleSave = useCallback(() => {
    saveMutation.mutate({
      interviewId,
      subject: effectiveSubject,
      body: effectiveBody,
      reminderSubject: dbReminderSubject,
      reminderBody: isAutoSendReminder ? "AUTO_SEND" : "NO_SEND",
      logoUrl: effectiveLogoUrl || null,
      replyTo: effectiveReplyTo || null,
    });
  }, [
    interviewId,
    effectiveSubject,
    effectiveBody,
    isAutoSendReminder,
    dbReminderSubject,
    effectiveLogoUrl,
    effectiveReplyTo,
    saveMutation,
  ]);

  const handleSendSelected = useCallback(async () => {
    if (selectedCandidateIds.size === 0) return;
    try {
      await saveMutation.mutateAsync({
        interviewId,
        subject: effectiveSubject,
        body: effectiveBody,
        reminderSubject: dbReminderSubject,
        reminderBody: isAutoSendReminder ? "AUTO_SEND" : "NO_SEND",
        logoUrl: effectiveLogoUrl || null,
        replyTo: effectiveReplyTo || null,
      });
      sendBulkMutation.mutate({
        interviewId,
        candidateIds: Array.from(selectedCandidateIds),
        type: "INVITE",
        startDate: startDate ? new Date(startDate).toISOString() : null,
        endDate: endDate ? new Date(endDate).toISOString() : null,
      });
    } catch (e) {
      // Save error handled by mutation
    }
  }, [
    interviewId,
    effectiveSubject,
    effectiveBody,
    dbReminderSubject,
    isAutoSendReminder,
    effectiveLogoUrl,
    effectiveReplyTo,
    selectedCandidateIds,
    sendBulkMutation,
    saveMutation,
    startDate,
    endDate,
  ]);

  const handleSendOne = useCallback(
    async (candidateId: string) => {
      try {
        await saveMutation.mutateAsync({
          interviewId,
          subject: effectiveSubject,
          body: effectiveBody,
          reminderSubject: dbReminderSubject,
          reminderBody: isAutoSendReminder ? "AUTO_SEND" : "NO_SEND",
          logoUrl: effectiveLogoUrl || null,
          replyTo: effectiveReplyTo || null,
        });
        sendOneMutation.mutate({ 
          interviewId, 
          candidateId, 
          type: "INVITE",
          startDate: startDate ? new Date(startDate).toISOString() : null,
          endDate: endDate ? new Date(endDate).toISOString() : null,
        });
      } catch (e) {
        // Save error handled by mutation
      }
    },
    [
      interviewId,
      effectiveSubject,
      effectiveBody,
      dbReminderSubject,
      isAutoSendReminder,
      effectiveLogoUrl,
      effectiveReplyTo,
      sendOneMutation,
      saveMutation,
      startDate,
      endDate,
    ],
  );

  const toggleCandidate = useCallback((id: string) => {
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllCandidates = useCallback(() => {
    setSelectedCandidateIds((prev) => {
      if (prev.size === candidates.length) return new Set();
      return new Set(candidates.map((c) => c.id));
    });
  }, [candidates]);

  const insertVariable = useCallback(
    (variable: string) => {
      setBody((prev) => (prev ?? effectiveBody) + variable);
    },
    [effectiveBody],
  );

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingLogo(true);
    try {
      const supabase = createClient();
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("Logo file size must be less than 5MB");
      }

      const fileExt = file.name.split(".").pop();
      const fileName = `logo_${interviewId}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("public-assets")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("public-assets").getPublicUrl(filePath);

      setLogoUrl(publicUrl);
    } catch (err: any) {
      toast({
        title: "Failed to upload logo",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const isSending = sendOneMutation.isLoading || sendBulkMutation.isLoading;

  if (templateQuery.isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-[500px] animate-pulse rounded-lg bg-muted" />
        <div className="h-[500px] animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ─── LEFT: Template Editor ─── */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Email Template
                  </CardTitle>
                  <CardDescription>
                    Customize the emails your candidates will receive. Use template variables to personalize each email.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Logo URL */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Logo Image
                </Label>
                <div className="flex gap-2">
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/gif"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={handleLogoUpload}
                      disabled={isUploadingLogo}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isUploadingLogo}
                    >
                      {isUploadingLogo ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      {isUploadingLogo ? "Uploading..." : "Upload Logo"}
                    </Button>
                  </div>
                  <Input
                    placeholder="Or paste an image URL..."
                    value={effectiveLogoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    className="flex-1"
                  />
                </div>
                {effectiveLogoUrl && (
                  <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={effectiveLogoUrl}
                      alt="Email logo preview"
                      className="max-h-12 max-w-[160px] object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 text-muted-foreground"
                      onClick={() => setLogoUrl("")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Upload a PNG/JPG or paste a URL. It will appear at the top of the email.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Invite Subject Line</Label>
                 <Input
                  value={effectiveSubject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject..."
                  disabled={isViewer}
                />
              </div>

              {/* Reply-to */}
              <div className="space-y-2">
                <Label>Reply-to Email (optional)</Label>
                 <Input
                  type="email"
                  value={effectiveReplyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  placeholder="replies@yourcompany.com"
                  disabled={isViewer}
                />
                <p className="text-xs text-muted-foreground">
                  When candidates reply, the email will go to this address.
                </p>
              </div>

              {/* Body */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Email Body</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Leave empty to use the default professional template. Or write
                      a custom message with the variables below.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPreview(!showPreview)}
                  >
                    {showPreview ? (
                      <><EyeOff className="mr-2 h-4 w-4" /> Edit</>
                    ) : (
                      <><Eye className="mr-2 h-4 w-4" /> Preview</>
                    )}
                  </Button>
                </div>
                
                {!showPreview && (
                  <div className="flex flex-wrap gap-1.5 pb-1">
                    {TEMPLATE_VARS.map((v) => (
                       <button
                        key={v.value}
                        type="button"
                        onClick={() => insertVariable(v.value)}
                        disabled={isViewer}
                        className="inline-flex items-center rounded-md border bg-muted/50 px-2 py-0.5 text-xs font-mono text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                )}

                {showPreview ? (
                  <div 
                    className="min-h-[220px] rounded-md border bg-white p-4 text-sm font-sans text-gray-700 shadow-sm"
                    style={{ lineHeight: "1.6" }}
                    dangerouslySetInnerHTML={{ 
                      __html: (effectiveBody || "<em>Default template will be used</em>")
                        .replace(/\n/g, '<br />')
                        .replace(/\{\{candidate_name\}\}/gi, previewCandidate?.name || "Candidate Name")
                        .replace(/\{\{interview_title\}\}/gi, interview?.title || "Interview Title")
                        .replace(/\{\{interview_description\}\}/gi, interview?.description || "")
                        .replace(/\{\{invite_link\}\}/gi, `<a href="#" style="color:#7c3aed;text-decoration:underline;">https://app.inluwa.com/i/invite/${previewCandidate?.inviteToken || "xyz123"}</a>`)
                        .replace(/\{\{company_name\}\}/gi, 'Your Company')
                        .replace(/\{\{validity_period\}\}/gi, previewValidity)
                        .replace(/^(<br \/>\s*)+|(<br \/>\s*)+$/g, '') // remove trailing br tags after empty replaces
                    }}
                  />
                ) : (
                   <Textarea
                    value={effectiveBody}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Leave empty for default template, or enter custom message..."
                    className="min-h-[220px] font-sans text-sm"
                    disabled={isViewer}
                  />
                )}
              </div>

              {/* Reminder Checkbox */}
              <div className="flex items-center space-x-2 pt-2 border-t mt-4">
                 <Checkbox 
                  id="reminder-checkbox" 
                  checked={isAutoSendReminder}
                  onCheckedChange={(checked) => setAutoSendReminder(checked === true)}
                  disabled={isViewer}
                />
                <label 
                  htmlFor="reminder-checkbox" 
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Check this if you want Inluwa to send a reminder email to the candidate 1 day before the interview
                </label>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleSave}
                  disabled={saveMutation.isLoading || isViewer}
                >
                  {saveMutation.isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Template
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── RIGHT: Send Panel ─── */}
        <div className="space-y-6">
          {/* Validity Period */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Validity Period</CardTitle>
              <CardDescription>Set the dates during which the invited candidates can access the interview.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Available From</Label>
                <Input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Available Until</Label>
                <Input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Candidate selection */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Send className="h-5 w-5" />
                    Send Invitations
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Select candidates to send invite emails to.{" "}
                    {candidates.length === 0 && (
                      <span className="text-amber-600">
                        No candidates with email addresses found. Add candidates
                        in the Sessions tab first.
                      </span>
                    )}
                  </CardDescription>
                </div>
                {selectedCandidateIds.size > 0 && (
                  <Button
                    onClick={handleSendSelected}
                    disabled={isSending}
                    size="sm"
                  >
                    {isSending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Send ({selectedCandidateIds.size})
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {candidates.length > 0 ? (
                <div className="space-y-1">
                  {/* Select all */}
                  <div className="flex items-center gap-3 rounded-md border-b px-3 py-2 text-sm font-medium text-muted-foreground">
                     <Checkbox
                      checked={
                        selectedCandidateIds.size === candidates.length &&
                        candidates.length > 0
                      }
                      onCheckedChange={toggleAllCandidates}
                      disabled={isViewer}
                    />
                    <span className="flex-1">Select all ({candidates.length})</span>
                    <span className="w-20 text-right">Status</span>
                  </div>

                  <div className="max-h-[400px] overflow-y-auto">
                    {candidates.map((c) => {
                      const lastSend = lastSendByCandidate.get(c.id);
                      return (
                        <div
                          key={c.id}
                          className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-muted/50 transition-colors"
                        >
                           <Checkbox
                            checked={selectedCandidateIds.has(c.id)}
                            onCheckedChange={() => toggleCandidate(c.id)}
                            disabled={isViewer}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {c.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {c.email}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {lastSend ? (
                              <Badge
                                variant={
                                  lastSend.status === "SENT"
                                    ? "default"
                                    : "destructive"
                                }
                                className="text-xs"
                              >
                                {lastSend.status === "SENT" ? (
                                  <MailCheck className="mr-1 h-3 w-3" />
                                ) : (
                                  <MailX className="mr-1 h-3 w-3" />
                                )}
                                {lastSend.status === "SENT" ? "Sent" : "Failed"}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                Not sent
                              </Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => handleSendOne(c.id)}
                              disabled={isSending || isViewer}
                            >
                              {sendOneMutation.isLoading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    No candidates with email addresses yet.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add candidates in the Sessions tab to send invitations.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Send History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <MailCheck className="h-4 w-4" />
                Send History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(sendLogs.data ?? []).length > 0 ? (
                <div className="max-h-[300px] overflow-y-auto space-y-1">
                  {(sendLogs.data ?? []).map((log: any) => (
                    <div
                      key={log.id}
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm border-b last:border-0"
                    >
                      {log.status === "SENT" ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                      ) : (
                        <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {log.recipientName || log.recipientEmail}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {log.recipientEmail}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">
                          {new Date(log.sentAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        {log.status === "FAILED" && log.errorMessage && (
                          <p className="text-xs text-red-500 truncate max-w-[140px]">
                            {log.errorMessage}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-center text-muted-foreground py-6">
                  No emails sent yet
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
