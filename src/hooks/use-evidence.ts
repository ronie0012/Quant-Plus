import { useEffect, useSyncExternalStore } from "react";
import {
  claimSnapshot,
  registerClaim,
  subscribeClaims,
  type EvidenceClaim,
} from "@/lib/quant/evidence";

const empty: EvidenceClaim[] = [];

/** Every claim currently registered by mounted "Why am I seeing this?" controls. */
export function useEvidenceClaims() {
  return useSyncExternalStore(subscribeClaims, claimSnapshot, () => empty);
}

export function useRegisterClaim(claim: EvidenceClaim) {
  const key = JSON.stringify(claim);
  useEffect(() => {
    registerClaim(JSON.parse(key) as EvidenceClaim);
  }, [key]);
}
