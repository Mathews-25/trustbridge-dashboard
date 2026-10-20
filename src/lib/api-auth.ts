import "server-only";

import { getServerSession, type Session } from "next-auth";

import { authOptions } from "@/lib/auth";

/**
 * Return the current session only when the user is a maintainer, otherwise
 * `null`. Shared by every maintainer-only API route.
 */
export async function requireMaintainerSession(): Promise<Session | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isMaintainer) {
    return null;
  }
  return session;
}

/**
 * Extract the maintainer org identifier from a session that has already been
 * validated by `requireMaintainerSession`. Falls back to "default" so that
 * callers can safely use this value in Prisma queries without null-checking.
 *
 * Usage:
 *   const session = await requireMaintainerSession();
 *   if (!session) return forbidden();
 *   const orgId = getMaintainerOrgId(session);
 */
export function getMaintainerOrgId(session: Session): string {
  return session.user?.maintainerOrgId ?? "default";
}
