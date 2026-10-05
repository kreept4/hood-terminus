"use client";

import { useQuery } from "@tanstack/react-query";
import type { VerifyReport } from "@/lib/verify/types";

/**
 * One Verify report per token, shared by every component that shows it.
 *
 * The panel on the token page and the badge in the trade panel ask for the
 * same key, so a token is simulated once per minute however many places show
 * the result.
 */
export function useVerify(token: string | undefined) {
  return useQuery({
    queryKey: ["verify", token?.toLowerCase()],
    enabled: Boolean(token),
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<VerifyReport> => {
      const res = await fetch(`/api/verify/${token}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Verify could not run.");
      }
      return (await res.json()) as VerifyReport;
    },
  });
}
