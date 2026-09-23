"use client";

import type { AntiCheatingViolation } from "@/hooks/use-anti-cheating";
import { useAntiCheating } from "@/hooks/use-anti-cheating";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc/client";
import { AlertTriangle } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface AntiCheatingGuardProps {
  enabled: boolean;
  sessionId?: string;
}

import { useAppLocale } from "@/components/app-locale-provider";

export function AntiCheatingGuard({ enabled, sessionId }: AntiCheatingGuardProps) {
  const { t } = useAppLocale();
  const { toast } = useToast();
  const [warningOpen, setWarningOpen] = useState(false);
  const [departureCount, setDepartureCount] = useState(0);
  const lastDepartureTs = useRef(0);
  const lastPasteToast = useRef(0);

  const reportMutation = trpc.session.reportAntiCheatingViolation.useMutation();

  const persistViolation = useCallback(
    (violation: AntiCheatingViolation) => {
      if (!sessionId) return;
      reportMutation.mutate({
        sessionId,
        violation: {
          type: violation.type,
          timestamp: violation.timestamp,
          detail: violation.detail,
        },
      });
    },
    [sessionId, reportMutation],
  );

  const recordDeparture = useCallback(() => {
    const now = Date.now();
    if (now - lastDepartureTs.current < 500) return;
    lastDepartureTs.current = now;
    setDepartureCount((prev) => prev + 1);
    setWarningOpen(true);
  }, []);

  const handleViolation = useCallback(
    (violation: AntiCheatingViolation) => {
      persistViolation(violation);

      switch (violation.type) {
        case "page_departure":
          recordDeparture();
          break;

        case "paste": {
          const now = Date.now();
          if (now - lastPasteToast.current < 3000) return;
          lastPasteToast.current = now;
          toast({
            title: t("antiCheating.pasteTitle"),
            description: t("antiCheating.pasteDesc"),
          });
          break;
        }

        case "multi_screen":
          toast({
            title: t("antiCheating.multiScreenTitle"),
            description: t("antiCheating.multiScreenDesc"),
          });
          break;
      }
    },
    [toast, t, recordDeparture, persistViolation],
  );

  useAntiCheating({ enabled, onViolation: handleViolation });

  if (!enabled || !warningOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
      {/* Backdrop — visual only, does NOT swallow touches */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm pointer-events-auto" onClick={() => setWarningOpen(false)} />
      <div className="relative mx-4 w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-white shadow-xl dark:bg-gray-900/95 dark:border-white/5 pointer-events-auto">
        {/* Top accent bar — red */}
        <div className="h-1 w-full bg-red-600 dark:bg-red-500" />

        <div className="p-6">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-500" />
            </div>

            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t("antiCheating.departureTitle")}
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              {t("antiCheating.departureDesc")}
            </p>

            <div className="mt-4 w-full rounded-lg bg-gray-50 p-3 dark:bg-white/5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">{t("common.status") || "Status"}</span>
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  {departureCount >= 3 ? t("antiCheating.maxDepartures") || "Max warnings reached" : "Recorded"}
                </span>
              </div>
            </div>

            <button
              onClick={() => setWarningOpen(false)}
              className="mt-5 w-full rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 active:bg-red-800 dark:bg-red-600 dark:hover:bg-red-700 dark:active:bg-red-800"
            >
              {t("antiCheating.understand")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
