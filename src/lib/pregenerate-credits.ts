import {
  formatCreditBalance,
  getPregenerateInitialCreditCost,
  normalizeCreditAmount,
} from "@/lib/interview-credits";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * First full pregen when creating a non-interactive interview (question clips only).
 * Uses the configured Non-interactive rate (default 5 credits / 15 minutes).
 * Prefer `getPregenerateInitialCreditCost(durationMinutes, rates)` at call sites.
 */
export const PREGENERATE_INITIAL_CREDIT_COST = 5;

/** Regenerating a single question clip after edit. Unchanged at 1 credit. */
export const PREGENERATE_QUESTION_CREDIT_COST = 1;

export {
  formatCreditBalance,
  getPregenerateInitialCreditCost,
  normalizeCreditAmount,
};

const MEMBER_CREDIT_ROLES = ["ACCOUNT_ADMIN", "EDITOR", "VIEWER"] as const;

export class InsufficientCreditsError extends Error {
  constructor(required: number, available: number) {
    super(
      `Not enough credits. This action requires ${required} credit${required > 1 ? "s" : ""}. You have ${available}.`,
    );
    this.name = "InsufficientCreditsError";
  }
}

const CREDIT_PRECISION_FACTOR = 10;

function toCreditUnits(value: number): number {
  return Math.round(normalizeCreditAmount(value) * CREDIT_PRECISION_FACTOR);
}

function fromCreditUnits(units: number): number {
  return normalizeCreditAmount(units / CREDIT_PRECISION_FACTOR);
}

async function writeUserCredits(userId: string, credits: number) {
  const { data: authData, error } = await supabaseAdmin.auth.admin.getUserById(
    userId,
  );
  if (error || !authData.user) return;
  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...authData.user.user_metadata,
      credits: normalizeCreditAmount(credits),
    },
  });
}

async function syncOrgCreditsToMembers(
  organizationId: string,
  credits: number,
  extraUserId?: string | null,
) {
  const { data: members } = await supabaseAdmin
    .from("organization_members")
    .select("userId")
    .eq("workspaceId", organizationId)
    .in("role", [...MEMBER_CREDIT_ROLES]);

  const userIds = new Set((members ?? []).map((m) => m.userId));
  if (extraUserId) userIds.add(extraUserId);

  for (const userId of userIds) {
    await writeUserCredits(userId, credits);
  }
}

export async function getInterviewOwnerCredits(
  ownerUserId: string,
): Promise<number> {
  const { data: owner, error } = await supabaseAdmin.auth.admin.getUserById(
    ownerUserId,
  );
  if (error || !owner.user) {
    throw new Error("Failed to verify interview owner credits.");
  }
  return normalizeCreditAmount(Number(owner.user.user_metadata?.credits ?? 0));
}

async function getOrganizationCredits(organizationId: string): Promise<number> {
  const { data: org, error } = await supabaseAdmin
    .from("organizations")
    .select("credits")
    .eq("id", organizationId)
    .single();
  if (error || !org) {
    throw new Error("Failed to verify organization credits.");
  }
  return normalizeCreditAmount(Number(org.credits ?? 0));
}

async function setOrganizationCredits(
  organizationId: string,
  credits: number,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("organizations")
    .update({ credits: normalizeCreditAmount(credits) })
    .eq("id", organizationId);
  if (error) {
    throw new Error("Failed to update organization credits.");
  }
}

/**
 * Prefer the org pool. If it is empty or below `amount`, fall back to owner
 * metadata (legacy Team Management / header balance) so spend can proceed.
 */
function resolveSpendableCredits(
  orgCredits: number,
  ownerCredits: number,
  amount: number,
): number {
  if (amount > 0 && orgCredits >= amount) return orgCredits;
  if (amount <= 0 && orgCredits > 0) return orgCredits;
  return Math.max(orgCredits, ownerCredits);
}

/** Available credits for an interview start: max(org pool, owner metadata). */
export async function getAvailableInterviewCredits(
  ownerUserId: string,
  organizationId?: string | null,
): Promise<number> {
  const ownerCredits = await getInterviewOwnerCredits(ownerUserId);
  if (!organizationId) return ownerCredits;
  const orgCredits = await getOrganizationCredits(organizationId);
  return Math.max(orgCredits, ownerCredits);
}

/** Deduct from the organization credit pool and re-sync to members. */
export async function deductOrganizationCredits(
  organizationId: string,
  amount: number,
  ownerUserId?: string | null,
): Promise<number> {
  const orgCredits = await getOrganizationCredits(organizationId);
  const ownerCredits = ownerUserId
    ? await getInterviewOwnerCredits(ownerUserId)
    : 0;
  const current = resolveSpendableCredits(orgCredits, ownerCredits, amount);

  if (current !== orgCredits) {
    await setOrganizationCredits(organizationId, current);
  }

  const amountUnits = toCreditUnits(amount);
  if (amountUnits <= 0) {
    return current;
  }

  const currentUnits = toCreditUnits(current);
  if (currentUnits < amountUnits) {
    throw new InsufficientCreditsError(normalizeCreditAmount(amount), current);
  }

  const remaining = fromCreditUnits(currentUnits - amountUnits);
  await setOrganizationCredits(organizationId, remaining);
  await syncOrgCreditsToMembers(organizationId, remaining, ownerUserId);
  return remaining;
}

/**
 * Deduct credits for interview/coaching spend.
 * Prefers the org pool when organizationId is known (shared across members);
 * if that pool is 0, copies owner user_metadata credits onto the org first.
 * Remaining balance is always written back to organizations.credits.
 */
export async function deductInterviewOwnerCredits(
  ownerUserId: string,
  amount: number,
  organizationId?: string | null,
): Promise<number> {
  if (organizationId) {
    return deductOrganizationCredits(organizationId, amount, ownerUserId);
  }

  const amountUnits = toCreditUnits(amount);
  if (amountUnits <= 0) return await getInterviewOwnerCredits(ownerUserId);

  const { data: owner, error } = await supabaseAdmin.auth.admin.getUserById(
    ownerUserId,
  );
  if (error || !owner.user) {
    throw new Error("Failed to verify interview owner credits.");
  }

  const current = normalizeCreditAmount(Number(owner.user.user_metadata?.credits ?? 0));
  const currentUnits = toCreditUnits(current);
  if (currentUnits < amountUnits) {
    throw new InsufficientCreditsError(normalizeCreditAmount(amount), current);
  }

  const remaining = fromCreditUnits(currentUnits - amountUnits);
  await supabaseAdmin.auth.admin.updateUserById(ownerUserId, {
    user_metadata: { ...owner.user.user_metadata, credits: remaining },
  });
  return remaining;
}
