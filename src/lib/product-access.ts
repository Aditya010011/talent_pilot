/** Product flags on an organization. Missing `interviewEnabled` means Interview stays on. */

export function isInterviewProductEnabled(
  org?: { interviewEnabled?: boolean | null } | null,
): boolean {
  return org?.interviewEnabled !== false;
}

export function isCoachingProductEnabled(
  org?: { coachingEnabled?: boolean | null } | null,
): boolean {
  return org?.coachingEnabled === true;
}

export function isCoachingChromePath(pathname: string | null | undefined): boolean {
  return !!pathname?.startsWith("/coaching");
}

export function productHomePath(
  org?: { interviewEnabled?: boolean | null; coachingEnabled?: boolean | null } | null,
): string {
  if (isInterviewProductEnabled(org)) return "/dashboard";
  if (isCoachingProductEnabled(org)) return "/coaching/dashboard";
  return "/dashboard";
}

/**
 * Where Interview chrome should send a non-admin user whose current org has
 * Interview disabled. Returns null when the user should stay put (already on
 * the right page, or neither product is on — stay on the dashboard, never /login).
 */
export function interviewChromeRedirect(
  org: { interviewEnabled?: boolean | null; coachingEnabled?: boolean | null } | null | undefined,
  pathname: string,
  search: string = "",
): string | null {
  if (isInterviewProductEnabled(org)) return null;
  if (!isCoachingProductEnabled(org)) return null;
  const dest = remapInterviewPathToCoaching(pathname, search);
  const current = `${pathname}${search}`;
  return dest === current ? null : dest;
}

/**
 * Where Coaching chrome should send a non-admin user whose current org has
 * Coaching disabled. Never returns /login — authenticated members land on
 * Interview dashboard (or stay if already there).
 */
export function coachingChromeRedirect(
  org: { interviewEnabled?: boolean | null; coachingEnabled?: boolean | null } | null | undefined,
  pathname: string,
): string | null {
  if (isCoachingProductEnabled(org)) return null;
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return null;
  return "/dashboard";
}

export function settingsOrganizationsPath(opts: {
  coachingChrome?: boolean;
  interviewEnabled?: boolean | null;
}): string {
  if (opts.coachingChrome || opts.interviewEnabled === false) {
    return "/coaching/settings/organizations";
  }
  return "/settings/organizations";
}

export function newOrgPath(opts: {
  coachingChrome?: boolean;
  interviewEnabled?: boolean | null;
}): string {
  if (opts.coachingChrome || opts.interviewEnabled === false) {
    return "/org/new?platform=coaching";
  }
  return "/org/new";
}

export function orgMembersPath(
  organizationId?: string | null,
  opts?: { coachingChrome?: boolean; interviewEnabled?: boolean | null },
): string {
  const coaching = !!opts?.coachingChrome || opts?.interviewEnabled === false;
  const base = coaching ? "/coaching/org/settings/members" : "/org/settings/members";
  if (organizationId) {
    return `${base}?organizationId=${encodeURIComponent(organizationId)}`;
  }
  return base;
}

export function remapInterviewPathToCoaching(
  pathname: string,
  search: string = "",
): string {
  if (pathname.startsWith("/org/settings")) {
    return `/coaching${pathname}${search}`;
  }
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    if (pathname.startsWith("/settings/credits")) {
      return "/coaching/settings/organizations";
    }
    return `/coaching${pathname}${search}`;
  }
  if (pathname === "/organizations" || pathname.startsWith("/organizations/")) {
    return "/coaching/settings/organizations";
  }
  return "/coaching/dashboard";
}

/**
 * For VIEWER accounts we need a stable "landing" org that allows the UI
 * (dashboard chrome + list pages) without bouncing to /login.
 *
 * Preference order:
 * 1) org with Interview enabled
 * 2) org with Coaching enabled
 * 3) any org (first)
 */
export function resolveViewerLandingOrgId(orgs: Array<{ id: string; interviewEnabled?: boolean | null; coachingEnabled?: boolean | null }>): string | null {
  const withInterview = orgs.find((o) => isInterviewProductEnabled(o));
  if (withInterview) return withInterview.id;
  const withCoaching = orgs.find((o) => isCoachingProductEnabled(o));
  if (withCoaching) return withCoaching.id;
  return orgs[0]?.id ?? null;
}
