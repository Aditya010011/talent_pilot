"use client";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_CREDIT_RATES,
  INTERVIEW_CREDIT_TYPE_META,
  type CreditRates,
  type InterviewCreditType,
} from "@/lib/interview-credits";
import { trpc } from "@/lib/trpc/client";
import { Coins, Loader2, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";

type DraftRates = Record<InterviewCreditType, { credits: string; minutes: string }>;

function toDraft(rates: CreditRates): DraftRates {
  return {
    realtime_avatar: {
      credits: String(rates.realtime_avatar.credits),
      minutes: String(rates.realtime_avatar.minutes),
    },
    voice_only: {
      credits: String(rates.voice_only.credits),
      minutes: String(rates.voice_only.minutes),
    },
    non_interactive: {
      credits: String(rates.non_interactive.credits),
      minutes: String(rates.non_interactive.minutes),
    },
    chat: {
      credits: String(rates.chat.credits),
      minutes: String(rates.chat.minutes),
    },
    cv_analysis: {
      credits: String(rates.cv_analysis.credits),
      minutes: String(rates.cv_analysis.minutes),
    },
  };
}

export default function CreditRatesSettingsPage() {
  const { user } = useAuth();
  const { data: isSystemAdmin = false } = trpc.user.isSystemAdmin.useQuery(undefined, {
    enabled: !!user,
  });
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.creditRates.list.useQuery(undefined, {
    enabled: isSystemAdmin,
  });
  const updateMutation = trpc.creditRates.update.useMutation({
    onSuccess: (saved) => {
      setDraft(toDraft(saved));
      utils.creditRates.list.invalidate();
      toast({
        title: "Credit rates saved",
        description: "New interviews and sessions will use these rates.",
      });
    },
    onError: (err) => {
      toast({
        title: "Could not save credit rates",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const [draft, setDraft] = useState<DraftRates>(() => toDraft(DEFAULT_CREDIT_RATES));
  const [cvCostInput, setCvCostInput] = useState("0.20");

  useEffect(() => {
    if (data) {
      setDraft(toDraft(data));
      const cost = data.cv_analysis.credits / data.cv_analysis.minutes;
      setCvCostInput(cost.toFixed(2));
    }
  }, [data]);

  if (!isSystemAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-semibold">Access Restricted</h2>
        <p className="text-muted-foreground">Only system administrators can access this page.</p>
      </div>
    );
  }

  const handleChange = (
    type: InterviewCreditType,
    field: "credits" | "minutes",
    value: string,
  ) => {
    setDraft((prev) => ({
      ...prev,
      [type]: { ...prev[type], [field]: value },
    }));
  };

  const handleCvCostChange = (val: string) => {
    setCvCostInput(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0) {
      setDraft((prev) => ({
        ...prev,
        cv_analysis: {
          credits: val,
          minutes: "1",
        },
      }));
    }
  };

  const handleSave = () => {
    // Chat stays in DEFAULT_CREDIT_RATES / DB for internal charging, but is
    // hidden from this admin UI (no chat interview tags in the product).
    const visibleMeta = INTERVIEW_CREDIT_TYPE_META.filter((meta) => meta.type !== "chat");
    const rates = visibleMeta.map((meta) => {
      const credits = parseFloat(draft[meta.type].credits);
      const minutes = parseInt(draft[meta.type].minutes, 10);
      return { type: meta.type, credits, minutes };
    });

    for (const row of rates) {
      if (isNaN(row.credits) || row.credits < 0) {
        toast({
          title: "Invalid credits",
          description: "Credits must be a number of 0 or more.",
          variant: "destructive",
        });
        return;
      }
      if (row.type !== "cv_analysis" && !Number.isInteger(row.credits)) {
        toast({
          title: "Invalid credits",
          description: "Credits must be a whole number for standard interview types.",
          variant: "destructive",
        });
        return;
      }
      if (!Number.isInteger(row.minutes) || row.minutes < 1) {
        toast({
          title: "Invalid minutes / quantity",
          description: "Minutes or quantity must be a whole number of 1 or more.",
          variant: "destructive",
        });
        return;
      }
    }

    updateMutation.mutate({
      rates: rates.map((row) => ({
        interviewType: row.type,
        credits: row.credits,
        minutes: row.minutes,
      })),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Coins className="h-6 w-6" />
          Credit Rates
        </h2>
        <p className="text-muted-foreground mt-1">
          Set how many credits each interview type costs per duration block.
          Duration is rounded up (16 minutes at 5 / 15 = 10 credits).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Interview types</CardTitle>
          <CardDescription>
            Defaults match current billing: <strong>5 credits / 15 minutes</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading rates…
            </div>
          ) : (
            <div className="space-y-4">
              <div className="hidden sm:grid sm:grid-cols-[1fr_8rem_8rem] gap-3 text-xs font-medium text-muted-foreground px-1">
                <span>Type</span>
                <span>Credits</span>
                <span>Minutes / Qty</span>
              </div>
              {INTERVIEW_CREDIT_TYPE_META.filter((meta) => meta.type !== "chat").map((meta) => {
                if (meta.type === "cv_analysis") {
                  return (
                    <div
                      key={meta.type}
                      className="grid grid-cols-1 sm:grid-cols-[1fr_16.5rem] gap-3 items-center rounded-lg border p-4"
                    >
                      <div>
                        <div className="font-semibold text-sm">{meta.label}</div>
                        <p className="text-xs text-muted-foreground mt-1">{meta.description}</p>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="cv-analysis-credits-cost" className="text-xs font-medium text-muted-foreground">
                          Credits per CV
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id="cv-analysis-credits-cost"
                            type="number"
                            min={0}
                            step={0.01}
                            value={cvCostInput}
                            onChange={(e) => handleCvCostChange(e.target.value)}
                          />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">credits / CV</span>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                     key={meta.type}
                     className="grid grid-cols-1 sm:grid-cols-[1fr_8rem_8rem] gap-3 items-start rounded-lg border p-4"
                  >
                    <div>
                      <div className="font-semibold text-sm">{meta.label}</div>
                      <p className="text-xs text-muted-foreground mt-1">{meta.description}</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${meta.type}-credits`} className="sm:sr-only">
                        Credits
                      </Label>
                      <Input
                        id={`${meta.type}-credits`}
                        type="number"
                        min={0}
                        step={1}
                        value={draft[meta.type].credits}
                        onChange={(e) => handleChange(meta.type, "credits", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${meta.type}-minutes`} className="sm:sr-only">
                        Minutes
                      </Label>
                      <Input
                        id={`${meta.type}-minutes`}
                        type="number"
                        min={1}
                        step={1}
                        value={draft[meta.type].minutes}
                        onChange={(e) => handleChange(meta.type, "minutes", e.target.value)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Button onClick={handleSave} disabled={isLoading || updateMutation.isPending}>
            {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save credit rates
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
