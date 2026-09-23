/**
 * Resolve a Simli face id from an interview payload or request body.
 * Portrait URLs (avatarImageUrl) are not face ids.
 */
export function resolveSimliFaceId(requested?: unknown): string | undefined {
  if (typeof requested !== "string") return undefined;
  const faceId = requested.trim();
  if (!faceId || faceId.includes("://")) return undefined;
  return faceId;
}

export function interviewSimliFaceId(
  interview: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!interview) return undefined;
  return resolveSimliFaceId(interview.simliFaceId ?? interview.simli_face_id);
}
