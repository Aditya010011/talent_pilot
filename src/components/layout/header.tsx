"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { trpc } from "@/lib/trpc/client";
import { ChevronDown, Plus, Settings, Coins } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React from "react";
import { useOrg } from "@/components/org-provider";
import { useProject } from "@/components/project-provider";
import { formatCreditBalance } from "@/lib/interview-credits";
import {
  isCoachingChromePath,
  isInterviewProductEnabled,
  newOrgPath,
  orgMembersPath,
  settingsOrganizationsPath,
} from "@/lib/product-access";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function isDynamicSegment(segment: string): boolean {
  return /^c[a-z0-9]{20,}$/i.test(segment) || /^[a-f0-9-]{20,}$/i.test(segment);
}

function InterviewBreadcrumbLabel({ id }: { id: string }) {
  const interview = trpc.interview.getById.useQuery({ id }, { retry: false });
  if (interview.data?.title) {
    return <>{interview.data.title}</>;
  }
  return <>{id.slice(0, 8)}...</>;
}

function OrgSwitcher() {
  const { orgs, currentOrg, setCurrentOrg } = useOrg();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useAppLocale();
  const coachingChrome = isCoachingChromePath(pathname);
  const interviewOn = isInterviewProductEnabled(currentOrg);

  if (!currentOrg) return null;

  // Allow switching if they are a member of multiple organizations (regardless of role)
  const canSwitch = orgs.length > 1;

  if (!canSwitch) {
    const isSystemAdmin = currentOrg.role === "SYSTEM_ADMIN";
    const href = isSystemAdmin
      ? settingsOrganizationsPath({ coachingChrome, interviewEnabled: interviewOn ? true : false })
      : orgMembersPath(currentOrg.id, { coachingChrome, interviewEnabled: interviewOn ? true : false });
    return (
      <Link
        href={href}
        className="flex items-center gap-1 rounded-md px-1.5 py-1 text-sm font-medium transition-colors hover:bg-muted"
      >
        <span className="truncate max-w-[160px]">{currentOrg.name}</span>
      </Link>
    );
  }

  const handleSwitch = (orgId: string) => {
    if (orgId !== currentOrg.id) {
      setCurrentOrg(orgId);
      router.refresh();
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-muted outline-none">
          <span className="truncate max-w-[160px]">{currentOrg.name}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          {t("header.orgList")}
        </div>
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => handleSwitch(org.id)}
            className="flex items-center justify-between"
          >
            <span className="truncate">{org.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={newOrgPath({ coachingChrome, interviewEnabled: interviewOn ? true : false })} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            {t("header.newOrganization")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectSwitcher() {
  const { currentProject } = useProject();
  const { currentOrg } = useOrg();

  if (!currentProject || !currentOrg) return null;

  return (
    <>
      <span className="mx-1 text-muted-foreground/50 text-sm">/</span>
      <span className="px-1.5 py-1 text-sm font-medium text-foreground">
        {currentProject.name}
      </span>
    </>
  );
}

function CreditBalanceBadge() {
  const { currentOrg } = useOrg();
  const organizationId = currentOrg?.id;
  const balanceQuery = trpc.organization.getBalance.useQuery(
    { organizationId: organizationId ?? "" },
    {
      enabled: !!organizationId,
      staleTime: 5_000,
      refetchOnWindowFocus: true,
    },
  );

  if (!organizationId) return null;

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 text-sm font-semibold rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
      <Coins className="h-4 w-4" />
      <span>
        {balanceQuery.isLoading
          ? "…"
          : formatCreditBalance(balanceQuery.data?.credits ?? 0)}
      </span>
    </div>
  );
}

export function Header({ sidebarToggle }: { sidebarToggle?: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useAppLocale();
  const SEGMENT_LABELS: Record<string, string> = {
    dashboard: t("header.dashboard"),
    interviews: t("header.interviews"),
    new: t("header.newInterview"),
    edit: t("header.content"),
    results: t("header.results"),
    settings: t("header.settings"),
    sessions: t("header.sessions"),
    workspaces: t("header.workspaces"),
    projects: t("header.projects"),
    members: t("header.members"),
    org: t("header.organizations"),
    organization: t("header.organization"),
    organizations: t("header.organizations"),
    candidates: t("header.sessions"),
    questions: t("header.questions"),
    account: t("header.accountSettings"),
    usage: t("header.usage"),
    coaching: "Coaching",
    trainings: "Trainings",
  };
  const ORG_SEGMENT_LABELS: Record<string, string> = {
    settings: t("header.organizationSettings"),
    members: t("header.members"),
    new: t("header.newOrganization"),
  };

  const segments = pathname.split("/").filter(Boolean);

  // Org-level pages: /organizations, /org/settings, /org/members, /org/new, /usage
  const isOrgLevelPage =
    segments[0] === "organizations" ||
    segments[0] === "org" ||
    segments[0] === "usage";

  const breadcrumbs: { label: React.ReactNode; href: string }[] = [];

  if (isOrgLevelPage) {
    // For org-level pages, always start with "Organizations"
    if (segments[0] === "org") {
      breadcrumbs.push({
        label: t("header.organizations"),
        href: "/organizations",
      });
      for (let i = 1; i < segments.length; i++) {
        const segment = segments[i];
        const href = "/" + segments.slice(0, i + 1).join("/");
        breadcrumbs.push({
          label:
            ORG_SEGMENT_LABELS[segment] ?? SEGMENT_LABELS[segment] ?? segment,
          href,
        });
      }
    } else if (segments[0] === "usage") {
      breadcrumbs.push({
        label: SEGMENT_LABELS[segments[0]] ?? segments[0],
        href: `/${segments[0]}`,
      });
    } else {
      // /organizations itself
      breadcrumbs.push({
        label: t("header.organizations"),
        href: "/organizations",
      });
    }
  } else {
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const href = "/" + segments.slice(0, i + 1).join("/");

      // Skip "edit" from breadcrumbs when followed by a sub-tab (settings/sessions)
      if (segment === "edit" && i < segments.length - 1) {
        continue;
      }

      if (isDynamicSegment(segment)) {
        const prevSegment = segments[i - 1];
        if (prevSegment === "interviews") {
          breadcrumbs.push({
            label: <InterviewBreadcrumbLabel id={segment} />,
            href: href + "/edit",
          });
        } else {
          breadcrumbs.push({ label: segment.slice(0, 8) + "...", href });
        }
      } else {
        breadcrumbs.push({
          label: SEGMENT_LABELS[segment] ?? segment,
          href,
        });
      }
    }
  }

  return (
    <header className="flex h-14 items-center border-b bg-background/60 backdrop-blur-xl px-4 sticky top-0 z-50">
      <div className="flex items-center gap-1">
        {sidebarToggle}

        {!isOrgLevelPage ? (
          <>
            <OrgSwitcher />
            <ProjectSwitcher />
          </>
        ) : segments[0] === "usage" ? (
          <OrgSwitcher />
        ) : null}

        {breadcrumbs.length > 0 && (
          <nav className="flex items-center text-sm">
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={i}>
                {(i > 0 ||
                  !isOrgLevelPage ||
                  segments[0] === "usage") && (
                  <span className="mx-1 text-muted-foreground/50 text-sm">
                    /
                  </span>
                )}
                {i < breadcrumbs.length - 1 ? (
                  <Link
                    href={crumb.href}
                    className="px-1.5 text-foreground hover:text-foreground/80 transition-colors truncate max-w-[160px]"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="px-1.5 text-foreground truncate max-w-[200px]">
                    {crumb.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}
      </div>
      <div className="ml-auto relative flex items-center gap-3" style={{ zIndex: 10002 }}>
        <CreditBalanceBadge />
      </div>
    </header>
  );
}
