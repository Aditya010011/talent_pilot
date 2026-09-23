"use client";

import { useAppLocale, getAppLocaleLabel } from "@/components/app-locale-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APP_LOCALE_CODES, type AppLocale } from "@/lib/languages";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useAppLocale();

  return (
    <Select
      value={locale}
      onValueChange={(value) => setLocale(value as AppLocale)}
    >
      <SelectTrigger className={compact ? "h-8 w-[180px] text-xs" : "w-[220px]"}>
        <SelectValue placeholder={t("common.language")} />
      </SelectTrigger>
      <SelectContent className="max-h-[320px]">
        {APP_LOCALE_CODES.map((code) => (
          <SelectItem key={code} value={code}>
            {getAppLocaleLabel(code)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
