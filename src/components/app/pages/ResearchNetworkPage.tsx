import { useMemo, useRef, useState } from "react";
import { Download, Lock, Plus, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHead, EmptyState, Pill } from "@/components/app/cards";
import { MetricStrip, PageIntro } from "@/components/app/pages/workspace";
import { nifty50 } from "@/data/nifty50";
import { useSession } from "@/hooks/use-session";
import { useHistories } from "@/hooks/use-quant-data";
import { useJournal } from "@/hooks/use-trading-product";
import {
  useDeleteResearchItem,
  useResearchItems,
  useSaveResearchItem,
  type ResearchItem,
  type ResearchStatus,
} from "@/hooks/use-workspace-prefs";
import { cn } from "@/lib/utils";

type MemoBody = {
  symbol: string;
  direction: "UP" | "DOWN" | "NONE";
  horizon_sessions: number;
  data_cutoff: string;
  maturity_date: string;
  thesis: string;
  evidence: string[];
  assumptions: string[];
  falsifiers: string[];
  imported?: { sha256: string; imported_at: string } | null;
};

const blank = (): MemoBody => ({
  symbol: "RELIANCE",
  direction: "UP",
  horizon_sessions: 20,
  data_cutoff: new Date().toISOString(),
  maturity_date: new Date(Date.now() + 20 * 1.45 * 86_400_000).toISOString(),
  thesis: "",
  evidence: [],
  assumptions: [],
  falsifiers: [],
  imported: null,
});

const lines = (v: string) =>
  v
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

const STATUS_TONE: Record<
  ResearchStatus,
  "neutral" | "primary" | "positive" | "negative" | "warning"
> = {
  DRAFT: "neutral",
  IN_REVIEW: "primary",
  APPROVED: "positive",
  REJECTED: "negative",
  ARCHIVED: "neutral",
  SHADOW: "warning",
};

/**
 * Reproducible research: versioned investment memos with a data cutoff,
 * evidence bundle, assumptions, falsifiers, horizon and maturity date; a
 * review workflow; hash-verified bundles; and a leaderboard scored on
 * matured outcomes rather than raw returns.
 */
export function ResearchNetworkPage() {
  const { session } = useSession();
  const memos = useResearchItems("MEMO");
  const strategies = useResearchItems("STRATEGY");
  const replays = useResearchItems("REPLAY_RESULT");
  const comments = useResearchItems("COMMENT");
  const { data: journal } = useJournal();
  const save = useSaveResearchItem();
  const remove = useDeleteResearchItem();
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState<MemoBody>(blank);
  const [text, setText] = useState({ evidence: "", assumptions: "", falsifiers: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const active = memos.data?.find((m) => m.id === selected) ?? null;
  const locked = active?.status === "APPROVED" || Boolean(body.imported);
  const symbols = useMemo(
    () => [
      ...new Set(
        (memos.data ?? [])
          .map((m) => String((m.body as Partial<MemoBody>).symbol ?? ""))
          .filter(Boolean),
      ),
    ],
    [memos.data],
  );
  const histories = useHistories(symbols, "1Y");

  function load(item: ResearchItem) {
    const b = { ...blank(), ...(item.body as Partial<MemoBody>) };
    setSelected(item.id);
    setTitle(item.title);
    setBody(b);
    setText({
      evidence: b.evidence.join("\n"),
      assumptions: b.assumptions.join("\n"),
      falsifiers: b.falsifiers.join("\n"),
    });
  }
  function reset() {
    setSelected(null);
    setTitle("");
    setBody(blank());
    setText({ evidence: "", assumptions: "", falsifiers: "" });
  }
  const composed = (): MemoBody => ({
    ...body,
    evidence: lines(text.evidence),
    assumptions: lines(text.assumptions),
    falsifiers: lines(text.falsifiers),
    maturity_date: new Date(
      Date.parse(body.data_cutoff) + body.horizon_sessions * 1.45 * 86_400_000,
    ).toISOString(),
  });
  const reviewProblems = (b: MemoBody) =>
    [
      !b.thesis.trim() && "a thesis",
      !b.evidence.length && "an evidence bundle",
      !b.falsifiers.length && "at least one falsifier",
      !b.assumptions.length && "stated assumptions",
    ].filter(Boolean) as string[];

  async function persist(status?: ResearchStatus) {
    const next = composed();
    if (status && status !== "DRAFT" && status !== "REJECTED" && reviewProblems(next).length) {
      toast.error(`Before review, add ${reviewProblems(next).join(", ")}.`);
      return;
    }
    try {
      const saved = await save.mutateAsync({
        ...(active ? { id: active.id } : { kind: "MEMO" as const }),
        title: title.trim() || `${next.symbol} memo`,
        ref: next.symbol,
        body: next,
        ...(status ? { status } : {}),
      });
      if (saved) setSelected(saved.id);
      toast.success(
        status ? `Memo ${status.toLowerCase().replace("_", " ")}` : "Memo saved as a new version",
      );
    } catch {
      toast.error("Memo could not be saved");
    }
  }

  async function exportBundle(item: ResearchItem) {
    const payload = {
      kind: "quant-plus-research-bundle",
      version: 1,
      memo: {
        title: item.title,
        status: item.status,
        version: item.version,
        body: item.body,
        history: item.history,
        created_at: item.created_at,
        updated_at: item.updated_at,
      },
    };
    const hash = await sha256(canonical(payload));
    const blob = new Blob([JSON.stringify({ ...payload, sha256: hash }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `research-${item.id.slice(0, 8)}-v${item.version}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importBundle(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as {
        sha256?: string;
        kind?: string;
        memo?: { title: string; body: MemoBody };
      };
      const { sha256: claimed, ...rest } = parsed;
      if (parsed.kind !== "quant-plus-research-bundle" || !parsed.memo || !claimed)
        throw new Error("Not a Quant Plus research bundle");
      const actual = await sha256(canonical(rest));
      if (actual !== claimed)
        throw new Error("Bundle hash does not match its contents; it was modified after export.");
      await save.mutateAsync({
        kind: "MEMO",
        title: `${parsed.memo.title} (imported)`.slice(0, 300),
        ref: parsed.memo.body.symbol ?? null,
        status: "ARCHIVED",
        body: {
          ...parsed.memo.body,
          imported: { sha256: actual, imported_at: new Date().toISOString() },
        },
      });
      toast.success("Bundle verified and imported read-only");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bundle could not be imported");
    }
  }

  // Leaderboard: matured memo forecasts, scored on direction after the horizon.
  const board = useMemo(() => {
    const rows = (memos.data ?? []).map((m) => {
      const b = { ...blank(), ...(m.body as Partial<MemoBody>) };
      const bars = histories.bars[b.symbol];
      if (b.direction === "NONE" || !bars?.length)
        return {
          m,
          b,
          status: "No forecast or prices" as string,
          ret: null as number | null,
          correct: null as boolean | null,
        };
      const start = bars.findIndex((x) => x.time * 1000 >= Date.parse(b.data_cutoff));
      if (start < 0 || start + b.horizon_sessions >= bars.length)
        return {
          m,
          b,
          status: `Matures ${new Date(b.maturity_date).toLocaleDateString("en-IN")}`,
          ret: null,
          correct: null,
        };
      const ret = bars[start + b.horizon_sessions]!.close / bars[start]!.close - 1;
      return { m, b, status: "Matured", ret, correct: b.direction === "UP" ? ret > 0 : ret < 0 };
    });
    const matured = rows.filter((r) => r.correct != null);
    return {
      rows,
      matured,
      accuracy: matured.length ? matured.filter((r) => r.correct).length / matured.length : null,
    };
  }, [memos.data, histories.bars]);

  const hosted = session?.mode === "hosted";
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Research network"
        title="Research network"
        body="Every memo records its data cutoff, evidence bundle, assumptions, falsifiers, forecast horizon and maturity date, and keeps every revision. Bundles export with a SHA-256 hash so anyone can verify they were not edited. The leaderboard counts matured forecasts, not raw returns."
        action={
          <span className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload /> Import bundle
            </Button>
            <Button size="sm" onClick={reset}>
              <Plus /> New memo
            </Button>
          </span>
        }
      >
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && void importBundle(e.target.files[0])}
        />
        <MetricStrip
          items={[
            { label: "Memos", value: memos.data?.length ?? 0 },
            {
              label: "Approved",
              value: (memos.data ?? []).filter((m) => m.status === "APPROVED").length,
              tone: "positive",
            },
            {
              label: "Matured forecast accuracy",
              value: board.accuracy == null ? "—" : `${Math.round(board.accuracy * 100)}%`,
              note: `${board.matured.length} matured`,
            },
            { label: "Claim comments", value: comments.data?.length ?? 0 },
          ]}
        />
      </PageIntro>

      <div className="grid items-start gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <Card>
          <CardHead title="Memos" meta="Newest first" />
          {memos.data?.length ? (
            <ul className="divide-y divide-border">
              {memos.data.map((m) => (
                <li key={m.id}>
                  <Button
                    variant="ghost"
                    onClick={() => load(m)}
                    className={cn(
                      "h-auto w-full justify-between rounded-none p-4 text-left",
                      selected === m.id && "bg-primary/10",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px]">{m.title}</span>
                      <span className="mt-1 block font-mono text-[11px] text-subtle">
                        v{m.version} · {new Date(m.updated_at).toLocaleString("en-IN")}
                      </span>
                    </span>
                    <Pill tone={STATUS_TONE[m.status]}>{m.status.replace("_", " ")}</Pill>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No memos yet"
              hint="Write a memo with falsifiers, or import a verified bundle."
            />
          )}
        </Card>
        <Card glow>
          <CardHead
            title={active ? `Memo v${active.version}` : "New memo"}
            meta={
              locked
                ? body.imported
                  ? `Imported read-only · sha256 ${body.imported.sha256.slice(0, 12)}…`
                  : "Approved memos are locked; changes need a new memo"
                : "Every save keeps the previous version"
            }
            action={
              active && (
                <span className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Export bundle"
                    title="Export reproducible bundle"
                    onClick={() => void exportBundle(active)}
                  >
                    <Download />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      window.confirm("Delete this memo and its history?") &&
                      void remove.mutateAsync(active.id).then(reset)
                    }
                  >
                    Delete
                  </Button>
                </span>
              )
            }
          />
          <fieldset disabled={locked} className="grid gap-4 p-5">
            <label className="text-xs text-subtle">
              Title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 h-9 w-full border border-border bg-background px-2 text-sm text-foreground"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="text-xs text-subtle">
                Symbol
                <select
                  value={body.symbol}
                  onChange={(e) => setBody({ ...body, symbol: e.target.value })}
                  className="mt-1 h-9 w-full border border-border bg-background px-2 text-sm text-foreground"
                >
                  {nifty50.map((s) => (
                    <option key={s.symbol}>{s.symbol}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-subtle">
                Forecast
                <select
                  value={body.direction}
                  onChange={(e) =>
                    setBody({ ...body, direction: e.target.value as MemoBody["direction"] })
                  }
                  className="mt-1 h-9 w-full border border-border bg-background px-2 text-sm text-foreground"
                >
                  <option value="UP">Up</option>
                  <option value="DOWN">Down</option>
                  <option value="NONE">No directional forecast</option>
                </select>
              </label>
              <label className="text-xs text-subtle">
                Horizon (sessions)
                <input
                  type="number"
                  min={1}
                  max={250}
                  value={body.horizon_sessions}
                  onChange={(e) =>
                    setBody({
                      ...body,
                      horizon_sessions: Math.min(
                        250,
                        Math.max(1, Math.floor(Number(e.target.value)) || 1),
                      ),
                    })
                  }
                  className="mt-1 h-9 w-full border border-border bg-background px-2 font-mono text-sm text-foreground"
                />
              </label>
              <div className="text-xs text-subtle">
                Data cutoff
                <p className="mt-2 font-mono text-[11px] text-foreground">
                  {new Date(body.data_cutoff).toLocaleString("en-IN")}
                </p>
                {!active && (
                  <button
                    type="button"
                    className="text-[10px] text-primary-soft underline"
                    onClick={() => setBody({ ...body, data_cutoff: new Date().toISOString() })}
                  >
                    Reset to now
                  </button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-subtle">
              Maturity: {new Date(composed().maturity_date).toLocaleDateString("en-IN")} (≈{" "}
              {body.horizon_sessions} sessions after the cutoff)
            </p>
            <label className="text-xs text-subtle">
              Thesis
              <textarea
                value={body.thesis}
                onChange={(e) => setBody({ ...body, thesis: e.target.value })}
                className="mt-1 min-h-20 w-full border border-border bg-background p-2 text-sm text-foreground"
              />
            </label>
            {(
              [
                ["evidence", "Evidence bundle (one item per line, with source)"],
                ["assumptions", "Assumptions"],
                ["falsifiers", "Falsifiers: what would prove this wrong"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-xs text-subtle">
                {label}
                <textarea
                  value={text[key]}
                  onChange={(e) => setText({ ...text, [key]: e.target.value })}
                  className="mt-1 min-h-16 w-full border border-border bg-background p-2 text-sm text-foreground"
                />
              </label>
            ))}
            {!locked &&
              (journal ?? []).some(
                (j) => j.symbol === body.symbol && j.plan?.evidence_items.length,
              ) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const plan = (journal ?? []).find(
                      (j) => j.symbol === body.symbol && j.plan?.evidence_items.length,
                    );
                    const extra = (plan?.plan?.evidence_items ?? []).map(
                      (e) =>
                        `${e.claim} — ${e.source}${e.published_at ? ` (published ${e.published_at.slice(0, 10)})` : ""}`,
                    );
                    setText({ ...text, evidence: [...lines(text.evidence), ...extra].join("\n") });
                  }}
                >
                  Import evidence from your {body.symbol} decision plan
                </Button>
              )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void persist()} disabled={save.isPending}>
                <Save /> Save version
              </Button>
              {(!active || active.status === "DRAFT" || active.status === "REJECTED") && (
                <Button type="button" variant="outline" onClick={() => void persist("IN_REVIEW")}>
                  Submit for review
                </Button>
              )}
              {active?.status === "IN_REVIEW" && (
                <>
                  <Button type="button" variant="outline" onClick={() => void persist("APPROVED")}>
                    Approve
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void persist("REJECTED")}>
                    Reject
                  </Button>
                </>
              )}
            </div>
            {active?.status === "IN_REVIEW" && (
              <p className="text-[11px] text-subtle">
                In a single-user workspace you review your own memo; multi-reviewer approval needs
                hosted team mode.
              </p>
            )}
          </fieldset>
          {active && active.history.length > 0 && (
            <details className="border-t border-border px-5 py-3 text-[12px]">
              <summary className="cursor-pointer text-subtle">
                Revision history ({active.history.length} earlier versions)
              </summary>
              <ol className="mt-2 space-y-1.5">
                {[...active.history].reverse().map((h) => (
                  <li key={`${h.version}-${h.updated_at}`} className="font-mono text-[11px]">
                    v{h.version} · {h.status} · {new Date(h.updated_at).toLocaleString("en-IN")} ·{" "}
                    {h.title}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHead
            title="Leaderboard"
            meta="Matured forecasts and strategy verdicts, not raw returns"
          />
          <div className="overflow-x-auto" role="region" aria-label="Research results" tabIndex={0}>
            <table className="w-full min-w-[520px] text-left text-[12px]">
              <thead className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                <tr>
                  <th className="px-4 py-2">Memo</th>
                  <th className="px-4 py-2">Forecast</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {board.rows.map(({ m, b, status, ret, correct }) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-4 py-2">{m.title}</td>
                    <td className="px-4 py-2 font-mono">
                      {b.symbol} {b.direction} · {b.horizon_sessions}s
                    </td>
                    <td className="px-4 py-2 text-subtle">{status}</td>
                    <td className="px-4 py-2">
                      {correct == null ? (
                        "—"
                      ) : (
                        <Pill
                          tone={correct ? "positive" : "negative"}
                        >{`${correct ? "Right" : "Wrong"} ${((ret ?? 0) * 100).toFixed(2)}%`}</Pill>
                      )}
                    </td>
                  </tr>
                ))}
                {(strategies.data ?? []).map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-2">{s.title.slice(0, 60)}</td>
                    <td className="px-4 py-2 font-mono">Strategy v{s.version}</td>
                    <td className="px-4 py-2 text-subtle">{s.status}</td>
                    <td className="px-4 py-2">
                      {String((s.body as { result?: { verdict?: string } }).result?.verdict ?? "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-[11px] text-subtle">
            {replays.data?.length ?? 0} saved replay results are available to attach as evidence.
          </p>
        </Card>
        <Card>
          <CardHead
            title="Team collaboration"
            meta={hosted ? "Hosted session" : "Local single-user workspace"}
          />
          <ul className="divide-y divide-border">
            {[
              "Shared research workspaces",
              "Team watchlists",
              "Role-based access",
              "Multi-reviewer approval",
              "Shared decision journals",
              "Read-only public research links",
            ].map((feature) => (
              <li
                key={feature}
                className="flex items-center justify-between gap-3 px-5 py-2.5 text-[12.5px]"
              >
                <span className="flex items-center gap-2">
                  <Lock className="h-3 w-3 text-subtle" /> {feature}
                </span>
                <Pill>Gated</Pill>
              </li>
            ))}
          </ul>
          <p className="px-5 py-3 text-[11px] text-subtle">
            These need multi-user tables, row-level security and a validated hosted mode on
            InsForge, which is still being migrated (see INSFORGE_MIGRATION.md). Until then, share
            research as verified bundles.
          </p>
        </Card>
      </div>
    </div>
  );
}
