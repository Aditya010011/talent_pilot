"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Building2, KeyRound, Settings, Users, FileText, BrainCircuit, Coins } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { trpc } from "@/lib/trpc/client";

const TRANSLATIONS: Record<string, { general: string; members: string; apiKeys: string; organizations: string }> = {
  ar: { general: "عام", members: "الأعضاء", apiKeys: "مفاتيح API", organizations: "المؤسسات" },
  bg: { general: "Общи", members: "Членове", apiKeys: "API ключове", organizations: "Организации" },
  cs: { general: "Obecné", members: "Členové", apiKeys: "API klíče", organizations: "Organizace" },
  da: { general: "Generelt", members: "Medlemmer", apiKeys: "API-nøgler", organizations: "Organisationer" },
  de: { general: "Allgemein", members: "Mitglieder", apiKeys: "API-Schlüssel", organizations: "Organisationen" },
  el: { general: "Γενικά", members: "Μέλη", apiKeys: "Κλειδιά API", organizations: "Οργανισμοί" },
  en: { general: "General", members: "Members", apiKeys: "API Keys", organizations: "Organizations" },
  es: { general: "General", members: "Miembros", apiKeys: "Claves API", organizations: "Organizaciones" },
  fi: { general: "Yleiset", members: "Jäsenet", apiKeys: "API-avaimet", organizations: "Organisaatiot" },
  fil: { general: "Pangkalahatan", members: "Mga Miyembro", apiKeys: "Mga API Key", organizations: "Mga Organisasyon" },
  fr: { general: "Général", members: "Membres", apiKeys: "Clés API", organizations: "Organisations" },
  hi: { general: "सामान्य", members: "सदस्य", apiKeys: "API कुंजी", organizations: "संगठन" },
  hr: { general: "Opće", members: "Članovi", apiKeys: "API ključevi", organizations: "Organizacije" },
  hu: { general: "Általános", members: "Tagok", apiKeys: "API kulcsok", organizations: "Szervezetek" },
  id: { general: "Umum", members: "Anggota", apiKeys: "Kunci API", organizations: "Organisasi" },
  it: { general: "Generale", members: "Membri", apiKeys: "Chiavi API", organizations: "Organizzazioni" },
  ja: { general: "一般", members: "メンバー", apiKeys: "APIキー", organizations: "組織" },
  ko: { general: "일반", members: "멤버", apiKeys: "API 키", organizations: "조직" },
  ms: { general: "Umum", members: "Ahli", apiKeys: "Kunci API", organizations: "Organisasi" },
  nb: { general: "Generelt", members: "Medlemmer", apiKeys: "API-nøkler", organizations: "Organisasjoner" },
  nl: { general: "Algemeen", members: "Leden", apiKeys: "API-sleutels", organizations: "Organisaties" },
  pl: { general: "Ogólne", members: "Członkowie", apiKeys: "Klucze API", organizations: "Organizacje" },
  pt: { general: "Geral", members: "Membros", apiKeys: "Chaves API", organizations: "Organizações" },
  "pt-BR": { general: "Geral", members: "Membros", apiKeys: "Chaves API", organizations: "Organizações" },
  ro: { general: "General", members: "Membri", apiKeys: "Chei API", organizations: "Organizații" },
  ru: { general: "Общие", members: "Участники", apiKeys: "API ключи", organizations: "Организации" },
  sk: { general: "Všeobecné", members: "Členovia", apiKeys: "API kľúče", organizations: "Organizácie" },
  sv: { general: "Allmänt", members: "Medlemmar", apiKeys: "API-nycklar", organizations: "Organisationer" },
  ta: { general: "பொதுவானவை", members: "உறுப்பினர்கள்", apiKeys: "API விசைகள்", organizations: "அமைப்புகள்" },
  th: { general: "ทั่วไป", members: "สมาชิก", apiKeys: "คีย์ API", organizations: "องค์กร" },
  tr: { general: "Genel", members: "Üyeler", apiKeys: "API Anahtarları", organizations: "Organizasyonlar" },
  uk: { general: "Загальні", members: "Члени", apiKeys: "API ключі", organizations: "Організації" },
  vi: { general: "Chung", members: "Thành viên", apiKeys: "Khóa API", organizations: "Tổ chức" },
  yue: { general: "一般", members: "成員", apiKeys: "API金鑰", organizations: "組織" },
  zh: { general: "通用", members: "成员", apiKeys: "API 密钥", organizations: "组织" },
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { locale } = useAppLocale();
  const tNav = TRANSLATIONS[locale] || TRANSLATIONS.en;
  const { user } = useAuth();
  const { data: isSystemAdmin = false } = trpc.user.isSystemAdmin.useQuery(undefined, {
    enabled: !!user,
  });

  const settingsNav: {
    name: string;
    href: string;
    icon: any;
    exact?: boolean;
    external?: boolean;
  }[] = [
    {
      name: tNav.apiKeys,
      href: "/settings/api-keys",
      icon: KeyRound,
    },
    {
      name: tNav.organizations,
      href: "/settings/organizations",
      icon: Building2,
    },
  ];

  if (isSystemAdmin) {
    settingsNav.push({
      name: "Job Templates",
      href: "/settings/templates",
      icon: FileText,
    });
    settingsNav.push({
      name: "Model",
      href: "/settings/model",
      icon: BrainCircuit,
    });
    settingsNav.push({
      name: "Credit Rates",
      href: "/settings/credits",
      icon: Coins,
    });
  }

  return (
    <div className="flex gap-8">
      <nav className="w-48 shrink-0 space-y-1">
        {settingsNav.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                item.external
                  ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                  : isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.name}</span>
              {item.external && (
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
