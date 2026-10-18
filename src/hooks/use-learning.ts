/**
 * Learning layer state: Investor DNA, concept mastery, the company simulation
 * result and the trading licence. Everything is stored on the user's own
 * preferences row; licence evidence is read from existing plans, replays and
 * paper trades, never entered by hand.
 */
import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { upsertRow } from "@/lib/workspace-api";
import { useAccount } from "@/hooks/use-dashboard-data";
import { useBehaviorState } from "@/hooks/use-trade-guard";
import {
  useJournal,
  useRiskLimits,
  useSaveRiskLimits,
  useTradingPreferences,
  type LearningState,
} from "@/hooks/use-trading-product";
import { useResearchItems } from "@/hooks/use-workspace-prefs";
import { roundTrips } from "@/lib/quant/behavior";
import {
  revealedProfile,
  statedProfile,
  type Answers,
  type RiskLevel,
} from "@/lib/learn/investor-dna";
import {
  currentLevel,
  licenceStages,
  suggestedLimits,
  type LicenceEvidence,
  type SuggestedLimits,
} from "@/lib/learn/licence";
import { updateMastery, masteryOf, type ConceptId } from "@/lib/learn/concepts";

function useSavePreferenceKey<K extends "investor_profile" | "learning">(key: K) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (value: unknown) => {
      await upsertRow("trading_preferences", { [key]: value });
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["trading-preferences"] }),
  });
}

export function useInvestorDna() {
  const preferences = useTradingPreferences();
  const account = useAccount();
  const behavior = useBehaviorState();
  const save = useSavePreferenceKey("investor_profile");
  const profile = preferences.data?.investor_profile ?? null;
  const answers = useMemo(() => (profile?.answers ?? {}) as Answers, [profile?.answers]);
  const stated = useMemo(() => statedProfile(answers), [answers]);
  const funds = Number(account.data?.total_funds ?? 0);
  const revealed = useMemo(
    () => revealedProfile(roundTrips(behavior.orders), funds),
    [behavior.orders, funds],
  );
  return {
    profile,
    answers,
    stated,
    revealed,
    complete: Boolean(profile?.completed_at) && stated.complete,
    practice: (profile?.completed_at ? stated.practice : null) as RiskLevel | null,
    loading: preferences.isLoading,
    save: (next: Answers) =>
      save.mutateAsync({ answers: next, completed_at: new Date().toISOString() }),
    saving: save.isPending,
    saveError: save.error,
  };
}

export function useLearning() {
  const preferences = useTradingPreferences();
  const save = useSavePreferenceKey("learning");
  const learning: LearningState = preferences.data?.learning ?? {};
  const mastery = learning.mastery ?? {};
  return {
    learning,
    mastery,
    loading: preferences.isLoading,
    recordCheck: (concept: ConceptId, correct: boolean) =>
      save.mutateAsync({
        ...learning,
        mastery: { ...mastery, [concept]: updateMastery(masteryOf(mastery, concept), correct) },
        checks_answered: (learning.checks_answered ?? 0) + 1,
      }),
    completeCompany: (result: { name: string; multiple: number; ownership_pct: number }) =>
      save.mutateAsync({
        ...learning,
        company_completed_at: new Date().toISOString(),
        company_result: result,
      }),
    saving: save.isPending,
  };
}

type ReplayBody = {
  summary?: {
    return_pct?: number;
    buy_and_hold_pct?: number;
    max_drawdown_pct?: number;
    finished?: boolean;
  };
};

export function useLicence() {
  const dna = useInvestorDna();
  const { learning } = useLearning();
  const replays = useResearchItems("REPLAY_RESULT");
  const journal = useJournal();
  const behavior = useBehaviorState();
  const account = useAccount();
  const limits = useRiskLimits();
  const saveLimits = useSaveRiskLimits();
  const funds = Number(account.data?.total_funds ?? 0);

  const evidence: LicenceEvidence = useMemo(() => {
    const entries = journal.data ?? [];
    const planByOrder = new Map(
      entries.filter((e) => e.order_id && e.plan).map((e) => [e.order_id!, e.plan!]),
    );
    const trips = roundTrips(behavior.orders);
    return {
      profile_complete: dna.complete,
      company_completed: Boolean(learning.company_completed_at),
      replays: (replays.data ?? []).map((item) => {
        const s = (item.body as ReplayBody).summary ?? {};
        return {
          return_pct: s.return_pct ?? 0,
          buy_and_hold_pct: s.buy_and_hold_pct ?? 0,
          max_drawdown_pct: s.max_drawdown_pct ?? 0,
          finished: Boolean(s.finished),
        };
      }),
      plans: entries
        .filter((e) => e.plan)
        .map((e) => ({
          has_stop: e.plan!.stop != null,
          planned_loss_pct:
            e.plan!.max_acceptable_loss != null && funds > 0
              ? (e.plan!.max_acceptable_loss / funds) * 100
              : null,
          decision: e.plan!.decision,
        })),
      planned_trips: trips.flatMap((trip) => {
        const plan = planByOrder.get(trip.entry_order_id);
        return plan?.max_acceptable_loss != null
          ? [{ loss: Math.max(0, -trip.pnl), max_acceptable_loss: plan.max_acceptable_loss }]
          : [];
      }),
    };
  }, [
    dna.complete,
    learning.company_completed_at,
    replays.data,
    journal.data,
    behavior.orders,
    funds,
  ]);

  const stages = useMemo(() => licenceStages(evidence), [evidence]);
  const level = currentLevel(stages);
  const suggested = suggestedLimits(level, dna.practice, funds);
  const applied =
    suggested != null &&
    limits.data != null &&
    limits.data.max_order_value === suggested.max_order_value &&
    limits.data.max_position_pct === suggested.max_position_pct &&
    limits.data.daily_loss_limit === suggested.daily_loss_limit;

  return {
    stages,
    level,
    next: stages[level + 1] ?? null,
    suggested,
    applied,
    currentLimits: limits.data ?? null,
    loading: journal.isLoading || replays.isLoading || behavior.loading || dna.loading,
    apply: (values: SuggestedLimits) =>
      saveLimits.mutateAsync({
        ...values,
        trading_paused: limits.data?.trading_paused ?? false,
      }),
    applying: saveLimits.isPending,
    applyError: saveLimits.error,
  };
}
