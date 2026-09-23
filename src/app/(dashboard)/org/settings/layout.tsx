"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Users } from "lucide-react";
import { isCoachingChromePath, orgMembersPath } from "@/lib/product-access";

const TRANSLATIONS: Record<string, { general: string; members: string }> = {
  ar: { general: "عام", members: "الأعضاء" },
  bg: { general: "Общи", members: "Членове" },
  cs: { general: "Obecné", members: "Členové" },
  da: { general: "Generelt", members: "Medlemmer" },
  de: { general: "Allgemein", members: "Mitglieder" },
  el: { general: "Γενικά", members: "Μέλη" },
  en: { general: "General", members: "Members" },
  es: { general: "General", members: "Miembros" },
  fi: { general: "Yleiset", members: "Jäsenet" },
  fil: { general: "Pangkalahatan", members: "Mga Miyembro" },
  fr: { general: "Général", members: "Membres" },
  hi: { general: "सामान्य", members: "सदस्य" },
  hr: { general: "Opće", members: "Članovi" },
  hu: { general: "Általános", members: "Tagok" },
  id: { general: "Umum", members: "Anggota" },
  it: { general: "Generale", members: "Membri" },
  ja: { general: "一般", members: "メンバー" },
  ko: { general: "일반", members: "멤버" },
  ms: { general: "Umum", members: "Ahli" },
  nb: { general: "Generelt", members: "Medlemmer" },
  nl: { general: "Algemeen", members: "Leden" },
  pl: { general: "Ogólne", members: "Członkowie" },
  pt: { general: "Geral", members: "Membros" },
  "pt-BR": { general: "Geral", members: "Membros" },
  ro: { general: "General", members: "Membri" },
  ru: { general: "Общие", members: "Участники" },
  sk: { general: "Všeobecné", members: "Členovia" },
  sv: { general: "Allmänt", members: "Medlemmar" },
  ta: { general: "பொதுவானவை", members: "உறுப்பினர்கள்" },
  th: { general: "ทั่วไป", members: "สมาชิก" },
  tr: { general: "Genel", members: "Üyeler" },
  uk: { general: "Загальні", members: "Члени" },
  vi: { general: "Chung", members: "Thành viên" },
  yue: { general: "一般", members: "成員" },
  zh: { general: "通用", members: "成员" }
};

export default function OrgSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { locale } = useAppLocale();
  const tNav = TRANSLATIONS[locale] || TRANSLATIONS.en;
  const organizationId = searchParams.get("organizationId");
  const coachingChrome = isCoachingChromePath(pathname);
  const membersHref = orgMembersPath(organizationId, { coachingChrome });
  const orgSettingsNav: {
    name: string;
    href: string;
    icon: any;
    exact?: boolean;
  }[] = [
    {
      name: tNav.members,
      href: membersHref,
      icon: Users,
    },
  ];

  return (
    <div className="flex gap-8">
      <nav className="w-48 shrink-0 space-y-1">
        {orgSettingsNav.map((item) => {
          const isActive = item.exact
            ? pathname === item.href.split("?")[0]
            : pathname.startsWith(item.href.split("?")[0]);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.name}</span>
            </Link>
          );
        })}
      </nav>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
