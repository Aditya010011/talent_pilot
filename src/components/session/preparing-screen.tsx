"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { Loader2 } from "lucide-react";
import { InluwaLogo } from "@/components/ui/inluwa-logo";

export function PreparingScreen({ text }: { text?: string }) {
  const { t } = useAppLocale();
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="sticky top-0 z-50 flex h-14 items-center border-b bg-card px-6">
        <InluwaLogo size={40} className="shrink-0" />
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-lg font-medium">{text || t("onboarding.preparing")}</p>
        <p className="text-sm text-muted-foreground">
          {t("onboarding.moment")}
        </p>
      </div>
    </div>
  );
}
