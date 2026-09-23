"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { useOrg } from "@/components/org-provider";
import { Switch } from "@/components/ui/switch";
import { isInterviewProductEnabled, settingsOrganizationsPath } from "@/lib/product-access";

export default function NewOrgPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <NewOrgForm />
    </Suspense>
  );
}

function NewOrgForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { t } = useAppLocale();
  const utils = trpc.useUtils();
  const { user, loading: authLoading } = useAuth();
  const { currentOrg } = useOrg();
  const coachingOnly =
    searchParams.get("platform") === "coaching" ||
    !isInterviewProductEnabled(currentOrg);

  const [name, setName] = useState("");
  const [credits, setCredits] = useState(0);
  const [startDate, setStartDate] = useState<Date>();
  const [expireDate, setExpireDate] = useState<Date>();
  const [coachingEnabled, setCoachingEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  const createMutation = trpc.organization.create.useMutation({
    onSuccess: () => {
      utils.organization.list.invalidate();
    },
    onError: (err) => {
      toast({
        title: t("teamManagement.error"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleCreate = async () => {
    setLoading(true);
    try {
      await createMutation.mutateAsync({
        name,
        credits,
        startDate: startDate ? startDate.toISOString() : null,
        expireDate: expireDate ? expireDate.toISOString() : null,
        coachingEnabled: coachingOnly ? true : coachingEnabled,
        platform: coachingOnly ? "coaching" : "interview",
      });
      toast({ title: t("org.new.createdSuccess") });
      router.push(
        settingsOrganizationsPath({
          coachingChrome: coachingOnly,
          interviewEnabled: coachingOnly ? false : true,
        }),
      );
    } catch {
      // mutation error already handled by onError
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="border-0 shadow-lg bg-background">
      <CardHeader>
        <CardTitle>{coachingOnly ? t("org.new.coachingOnlyTitle") : t("org.new.title")}</CardTitle>
        <CardDescription>
          {coachingOnly ? t("org.new.coachingOnlyDescription") : t("org.new.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="orgName">
            {t("org.new.orgName")}
          </Label>
          <Input
            id="orgName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("org.new.placeholder")}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="orgCredits">{t("org.new.credits")}</Label>
          <Input
            id="orgCredits"
            type="number"
            min={0}
            value={credits}
            onChange={(e) => setCredits(parseInt(e.target.value) || 0)}
          />
          <p className="text-xs text-muted-foreground">
            {coachingOnly ? t("org.new.coachingOnlyHint") : t("org.new.creditsHint")}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("org.new.startDate")}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !startDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "PP") : <span>dd/mm/yyyy</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={startDate} onSelect={setStartDate} />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>{t("org.new.expireDate")}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !expireDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {expireDate ? format(expireDate, "PP") : <span>dd/mm/yyyy</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={expireDate} onSelect={setExpireDate} />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {!coachingOnly && (
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5 pr-4">
            <Label htmlFor="orgCoaching">{t("org.new.coachingEnabled")}</Label>
            <p className="text-xs text-muted-foreground">{t("org.new.coachingEnabledHint")}</p>
          </div>
          <Switch
            id="orgCoaching"
            checked={coachingEnabled}
            onCheckedChange={setCoachingEnabled}
          />
        </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button
            variant="outline"
            onClick={() =>
              router.push(
                settingsOrganizationsPath({
                  coachingChrome: coachingOnly,
                  interviewEnabled: coachingOnly ? false : true,
                }),
              )
            }
            disabled={loading}
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleCreate}
            disabled={loading || !name.trim()}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("org.new.title")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
