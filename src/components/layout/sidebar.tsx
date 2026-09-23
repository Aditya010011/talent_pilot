"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useAuth } from "@/components/auth-provider";
import { useOrg } from "@/components/org-provider";
import { useProject } from "@/components/project-provider";
import { InluwaLogo } from "@/components/ui/inluwa-logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useNewInterview } from "@/components/interview/new-interview-provider";
import { NewTrainingProvider, useNewTraining } from "@/components/interview/new-training-provider";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import {
  isCoachingChromePath,
  isCoachingProductEnabled,
  isInterviewProductEnabled,
} from "@/lib/product-access";
import { cn } from "@/lib/utils";
import {
    Brain,
    ChevronUp,
    FolderKanban,
    HelpCircle,
    LayoutDashboard,
    Loader2,
    LogOut,
    MessageSquare,
    Monitor,
    Moon,
    Palette,
    PanelLeftClose,
    PanelLeftOpen,
    PlayCircle,
    Plus,
    Settings,
    Sun,
    Users
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Header } from "./header";

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useAppLocale();

  const options = [
    { value: "light", icon: Sun, label: t("common.light") },
    { value: "dark", icon: Moon, label: t("common.dark") },
    { value: "system", icon: Monitor, label: t("common.system") },
  ] as const;

  return (
    <div className="flex items-center justify-between px-2 py-1.5 text-sm">
      <span className="flex items-center gap-2">
        <Palette className="h-4 w-4" />
        {t("sidebar.theme")}
      </span>
      <div className="flex items-center gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setTheme(opt.value);
            }}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              theme === opt.value
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <opt.icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

function SidebarLink({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
  suffix,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
  collapsed: boolean;
  suffix?: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const navigating = isPending && !active;

  return (
    <Link
      href={href}
      onClick={(e) => {
        if (active) return;
        e.preventDefault();
        startTransition(() => {
          router.push(href);
        });
      }}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {navigating ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      ) : (
        <Icon className="h-4 w-4 shrink-0" />
      )}
      {!collapsed &&
        (suffix ? (
          <>
            <span className="flex-1">{label}</span>
            {suffix}
          </>
        ) : (
          label
        ))}
    </Link>
  );
}

export function Sidebar({
  collapsed,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const { openNewInterview } = useNewInterview();
  const { openNewTraining } = useNewTraining();
  const { t, locale } = useAppLocale();
  const { currentOrg, orgs } = useOrg();
  const { currentProject } = useProject();
  const isSystemAdmin = currentOrg?.role === "SYSTEM_ADMIN";
  const isViewer = currentOrg?.role === "VIEWER";
  const isGlobalAdmin = orgs.some((o) => o.role === "SYSTEM_ADMIN") || isSystemAdmin;
  const interviewOn = isInterviewProductEnabled(currentOrg);
  const coachingOn = isCoachingProductEnabled(currentOrg);

  const isCoachingMode = isCoachingChromePath(pathname);
  const hasAccountAdminMembership = orgs.some((o) => o.role === "ACCOUNT_ADMIN");
  const hasSystemAdminMembership = orgs.some((o) => o.role === "SYSTEM_ADMIN");
  const canSeeCoachingProjectSettings =
    isCoachingMode && hasAccountAdminMembership && !hasSystemAdminMembership;

  const projectNavigation = [
    { name: t("sidebar.dashboard"), href: "/dashboard", icon: LayoutDashboard },
    { name: t("sidebar.interviews"), href: "/interviews", icon: MessageSquare },
    { name: t("sidebar.sessions"), href: "/candidates", icon: PlayCircle },
    { name: t("sidebar.questions"), href: "/questions", icon: HelpCircle },
  ];

  const coachingNavigation = [
    { name: "Dashboard", href: "/coaching/dashboard", icon: LayoutDashboard },
    { name: "Trainings", href: "/coaching/trainings", icon: Brain },
    { name: "Candidates", href: "/coaching/candidates", icon: Users },
  ];

  const displayName = profile?.name || user?.email?.split("@")[0] || "User";
  const initials =
    displayName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "U";

  const isOrgLevelPage =
    pathname.startsWith("/organizations") ||
    (pathname.startsWith("/org/") && !pathname.startsWith("/org/settings"));

  const isSettingsActive =
    pathname.startsWith("/settings") ||
    pathname.startsWith("/coaching/settings") ||
    pathname.startsWith("/coaching/org/");
  const settingsHref = isCoachingMode
    ? canSeeCoachingProjectSettings
      ? "/coaching/settings/organizations"
      : "/coaching/dashboard"
    : !interviewOn
      ? "/coaching/dashboard"
      : "/settings";

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-background/60 backdrop-blur-xl transition-all duration-200",
        collapsed ? "w-16" : "w-52",
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b px-4">
        <Link href={isCoachingMode ? "/coaching/dashboard" : "/"} className="flex items-center gap-2 outline-none">
          <InluwaLogo size={40} className="shrink-0" />
        </Link>
      </div>

      {isOrgLevelPage ? (
        <>
          {/* Org-level: no project nav links */}
          <div className="flex-1" />
        </>
      ) : isCoachingMode ? (
        <>
          {/* New Training button */}
          {!isViewer && (
            <div className="p-3">
              <Button
                className={cn(
                  "w-full gap-2 bg-[#1b2a4a] hover:bg-[#15233e] dark:bg-[#152442] dark:hover:bg-[#1d325a] text-white border-0 shadow-sm",
                  collapsed ? "justify-center" : "justify-start",
                )}
                size={collapsed ? "icon" : "default"}
                onClick={() => openNewTraining(currentProject?.id)}
              >
                <Plus className="h-4 w-4" />
                {!collapsed && "New Training"}
              </Button>
            </div>
          )}

          {/* Coaching Navigation */}
          <nav className="flex-1 space-y-1 px-3">
            {coachingNavigation.map((item) => (
              <SidebarLink
                key={item.name}
                href={item.href}
                icon={item.icon}
                label={item.name}
                active={pathname.startsWith(item.href)}
                collapsed={collapsed}
              />
            ))}
          </nav>

          <div className="space-y-1 px-3 pb-2">
            {/* Project Settings (coaching) — only for ACCOUNT_ADMIN. */}
            {canSeeCoachingProjectSettings && (
              <SidebarLink
                href="/coaching/settings/organizations"
                icon={Settings}
                label={t("sidebar.projectSettings")}
                active={isSettingsActive}
                collapsed={collapsed}
              />
            )}
            {/* Switch back to Interview — hidden for coaching-only tenants. */}
            {(interviewOn || isGlobalAdmin) && (
            <Button
              className={cn(
                "w-full gap-2 text-white border-0 shadow-sm",
                collapsed ? "justify-center px-0" : "justify-start",
              )}
              size={collapsed ? "icon" : "default"}
              style={{ backgroundColor: "hsl(265, 85%, 55%)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "hsl(265, 85%, 48%)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "hsl(265, 85%, 55%)";
              }}
              onClick={() => router.push("/dashboard")}
              title="Interview"
            >
              <MessageSquare className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">Interview</span>}
            </Button>
            )}
          </div>
        </>
      ) : (
        <>
          {/* New Interview */}
          {!isViewer && (
            <div className="p-3">
              <Button
                className={cn(
                  "w-full gap-2",
                  collapsed ? "justify-center" : "justify-start",
                )}
                size={collapsed ? "icon" : "default"}
                onClick={() => openNewInterview(currentProject?.id)}
              >
                <Plus className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{t("sidebar.newInterview")}</span>}
              </Button>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3">
            {projectNavigation.map((item) => (
              <SidebarLink
                key={item.name}
                href={item.href}
                icon={item.icon}
                label={item.name}
                active={pathname.startsWith(item.href)}
                collapsed={collapsed}
              />
            ))}
          </nav>

          {/* Bottom section: Settings + Mode toggle */}
          <div className="space-y-1 px-3 pb-2">
            <SidebarLink
              href="/settings"
              icon={Settings}
              label={t("sidebar.projectSettings")}
              active={isSettingsActive}
              collapsed={collapsed}
            />
            {/* Switch to Coaching Mode — org flag, or SYSTEM_ADMIN creating coaching-only tenants */}
            {(coachingOn || isGlobalAdmin) && (
            <Button
              className={cn(
                "w-full gap-2 bg-[#1b2a4a] hover:bg-[#15233e] dark:bg-[#152442] dark:hover:bg-[#1d325a] text-white border-0 shadow-sm",
                collapsed ? "justify-center px-0" : "justify-start",
              )}
              size={collapsed ? "icon" : "default"}
              onClick={() => router.push("/coaching/dashboard")}
              onMouseEnter={() => router.prefetch("/coaching/dashboard")}
              title="Coaching"
            >
              <Brain className="h-4 w-4 shrink-0 text-blue-300" />
              {!collapsed && <span className="truncate">Coaching</span>}
            </Button>
            )}
          </div>
        </>
      )}

      {/* User profile */}
      <div className="border-t">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted outline-none",
                collapsed && "justify-center px-0",
              )}
            >
              <Avatar className="h-8 w-8 shrink-0 rounded-md">
                <AvatarImage src={profile?.avatar ?? undefined} />
                <AvatarFallback className="text-xs rounded-md">
                  {user?.email?.[0]?.toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex flex-1 flex-col text-left text-xs overflow-hidden">
                  <span className="font-semibold text-foreground truncate">
                    {profile?.name ?? user?.email?.split("@")[0]}
                  </span>
                  <span className="text-muted-foreground truncate">
                    {user?.email}
                  </span>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {(!isCoachingMode || canSeeCoachingProjectSettings) && (
              <DropdownMenuItem asChild>
                <Link href={settingsHref} className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  {t("sidebar.accountSettings")}
                </Link>
              </DropdownMenuItem>
            )}
            <div className="px-2 py-2">
              <LanguageSwitcher compact />
            </div>
            <ThemeToggle />
            <DropdownMenuItem
              className="flex items-center gap-2 text-destructive"
              disabled={signingOut}
              onSelect={async (e) => {
                e.preventDefault();
                setSigningOut(true);
                const supabase = createClient();
                try {
                  await supabase.auth.signOut();
                } catch {
                  // Session may have expired; clear local state instead
                  await supabase.auth
                    .signOut({ scope: "local" })
                    .catch(() => {});
                }
                window.location.href = "/login";
              }}
            >
              {signingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              {signingOut ? t("sidebar.signingOut") : t("sidebar.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}

export function SidebarToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { t } = useAppLocale();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-transparent"
      aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
    >
      {collapsed ? (
        <PanelLeftOpen className="h-4 w-4" />
      ) : (
        <PanelLeftClose className="h-4 w-4" />
      )}
    </Button>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const isCoachingMode = pathname?.startsWith("/coaching");

  return (
    <NewTrainingProvider>
      <div
        className="dashboard-shell flex h-screen overflow-hidden bg-background text-foreground transition-colors duration-300"
        data-coaching-mode={isCoachingMode ? "true" : undefined}
      >
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header
            sidebarToggle={
              <SidebarToggle
                collapsed={collapsed}
                onToggle={() => setCollapsed(!collapsed)}
              />
            }
          />
          <main className="flex-1 overflow-y-auto p-6 code-scrollbar">
            {children}
          </main>
        </div>
      </div>
    </NewTrainingProvider>
  );
}
