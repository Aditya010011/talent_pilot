"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useOrg, type OrgInfo } from "@/components/org-provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

function OrgSection({ org, isCurrent }: { org: OrgInfo; isCurrent: boolean }) {
  const { t } = useAppLocale();

  return (
    <Card className="cursor-default transition-colors hover:bg-muted/50">
      <CardHeader className="flex flex-row items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <CardTitle className="text-xl">{org.name}</CardTitle>
          {isCurrent && (
            <Badge variant="secondary" className="text-xs">
              {t("settings.orgs.current") || "Current"}
            </Badge>
          )}
          {org.interviewEnabled === false && (
            <Badge variant="outline" className="text-xs">
              Coaching
            </Badge>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}

export default function CoachingOrganizationsSettingsPage() {
  const { t } = useAppLocale();
  const { orgs, currentOrg } = useOrg();

  // Scoped list: ACCOUNT_ADMIN-only (and scoped by org_member relationship via `useOrg()`).
  const visibleOrgs = orgs.filter((o) => o.role === "ACCOUNT_ADMIN");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{t("settings.orgs.title")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("settings.orgs.subtitle")}
        </p>
      </div>

      {visibleOrgs.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          {t("settings.orgs.noOrgs") || "No organizations found."}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleOrgs.map((org) => (
            <OrgSection
              key={org.id}
              org={org}
              isCurrent={currentOrg?.id === org.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
