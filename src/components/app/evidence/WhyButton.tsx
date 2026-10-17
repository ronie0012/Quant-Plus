import { useState, type ReactNode } from "react";
import { CircleHelp, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/app/cards";
import { claimBranches, knowabilityOf, type EvidenceClaim } from "@/lib/quant/evidence";
import { useRegisterClaim } from "@/hooks/use-evidence";
import { useResearchItems, useSaveResearchItem } from "@/hooks/use-workspace-prefs";
import { cn } from "@/lib/utils";

/**
 * Global "Why am I seeing this?" action. Opens the claim's evidence graph and
 * answers the provenance questions directly from recorded fields; anything not
 * recorded is said to be missing rather than inferred.
 */
export function WhyButton({
  claim,
  decisionAt,
  className,
}: {
  claim: EvidenceClaim;
  decisionAt?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  useRegisterClaim(claim);
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        title="Why am I seeing this?"
        aria-label={`Why am I seeing this? ${claim.label}`}
        className={cn(
          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-subtle transition-colors hover:text-primary-soft focus-visible:text-primary-soft",
          className,
        )}
      >
        <CircleHelp className="h-3 w-3" />
      </button>
      {open && (
        <EvidenceDialog
          claim={claim}
          decisionAt={decisionAt ?? null}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** A labelled value with its "Why am I seeing this?" control attached. */
export function Explained({
  claim,
  children,
  decisionAt,
}: {
  claim: EvidenceClaim;
  children: ReactNode;
  decisionAt?: string | null;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <WhyButton claim={claim} decisionAt={decisionAt ?? null} />
    </span>
  );
}

export function EvidenceDialog({
  claim,
  decisionAt,
  onClose,
}: {
  claim: EvidenceClaim;
  decisionAt: string | null;
  onClose: () => void;
}) {
  const branches = claimBranches(claim);
  const known = knowabilityOf(claim, decisionAt);
  const comments = useResearchItems("COMMENT");
  const save = useSaveResearchItem();
  const [comment, setComment] = useState("");
  const thread = (comments.data ?? []).filter((item) => item.ref === claim.id);
  const answers: [string, string][] = [
    [
      "Where did this come from?",
      [
        claim.source ? `Source: ${claim.source.name}.` : "No source document is recorded.",
        claim.observation ? `Observed from ${claim.observation.provider}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    ],
    ["Was it knowable when the decision was made?", known.text],
    [
      "Which source contradicted it?",
      claim.contradictions?.length
        ? claim.contradictions.map((c) => `${c.source}: ${c.statement}`).join(" · ")
        : "No contradicting source is recorded.",
    ],
    [
      "What formula produced this?",
      claim.calculation
        ? `${claim.calculation.formula}${claim.calculation.inputs.length ? ` — ${claim.calculation.inputs.map((i) => `${i.name} = ${i.value}`).join(", ")}` : ""}`
        : "No formula: this is a direct observation or statement.",
    ],
    [
      "Was this available before or after the trade?",
      claim.decision
        ? `${known.status === "BEFORE" ? "Before" : known.status === "AFTER" ? "After" : "Unknown"}: ${known.text}`
        : "No trade is linked to this claim.",
    ],
    [
      "Did this factor help historically?",
      claim.history ?? "No historical evaluation of this factor has been recorded.",
    ],
  ];
  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {claim.label}
            <span className="font-mono text-primary-soft">{claim.value}</span>
          </DialogTitle>
          <DialogDescription>{claim.statement}</DialogDescription>
        </DialogHeader>
        <section aria-label="Evidence graph" className="mt-2">
          <p className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
            Evidence graph
          </p>
          <ol className="mt-2 border-l border-border-strong pl-4">
            <li className="relative pb-2 text-[13px]">
              <span
                className="absolute top-1.5 -left-[21px] h-2 w-2 bg-primary"
                aria-hidden="true"
              />
              <span className="font-medium text-[11px] uppercase tracking-[0.06em] text-primary-soft">
                Claim
              </span>
              <span className="block">{claim.statement}</span>
            </li>
            {branches.map((branch) => (
              <li key={branch.kind} className="relative py-1.5 text-[12.5px]">
                <span
                  className={cn(
                    "absolute top-3 -left-[20px] h-1.5 w-1.5",
                    branch.missing ? "bg-border-strong" : "bg-positive",
                  )}
                  aria-hidden="true"
                />
                <span className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                  ├─ {branch.kind}
                </span>
                <span className={cn("block", branch.missing && "text-subtle")}>{branch.label}</span>
                {branch.detail && (
                  <span className="block break-all text-[11px] text-subtle">{branch.detail}</span>
                )}
              </li>
            ))}
          </ol>
        </section>
        <section aria-label="Questions" className="mt-3 space-y-3">
          {answers.map(([question, answer]) => (
            <div key={question} className="border border-border bg-background/40 p-3">
              <p className="text-[12px] text-muted-foreground">{question}</p>
              <p className="mt-1 text-[13px]">{answer}</p>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Pill
              tone={
                known.status === "BEFORE"
                  ? "positive"
                  : known.status === "AFTER"
                    ? "negative"
                    : "neutral"
              }
            >
              {known.status === "BEFORE"
                ? "Knowable at decision"
                : known.status === "AFTER"
                  ? "Hindsight"
                  : "Timing unknown"}
            </Pill>
            {claim.model_version && <Pill tone="primary">{claim.model_version}</Pill>}
          </div>
        </section>
        <section aria-label="Comments" className="mt-3 border-t border-border pt-3">
          <p className="flex items-center gap-2 font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
            <MessageSquare className="h-3 w-3" /> Comments on this claim ({thread.length})
          </p>
          <ul className="mt-2 space-y-2">
            {thread.map((item) => (
              <li key={item.id} className="border border-border p-2 text-[12.5px]">
                {String(item.body["text"] ?? item.title)}
                <span className="mt-1 block font-mono text-[11px] text-subtle">
                  {new Date(item.created_at).toLocaleString("en-IN")}
                </span>
              </li>
            ))}
          </ul>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const text = comment.trim();
              if (!text) return;
              void save
                .mutateAsync({
                  kind: "COMMENT",
                  title: text.slice(0, 120),
                  ref: claim.id,
                  body: { text, claim: claim.label },
                })
                .then(() => setComment(""))
                .catch(() => toast.error("Comment could not be saved"));
            }}
          >
            <label htmlFor={`comment-${claim.id}`} className="sr-only">
              Comment
            </label>
            <input
              id={`comment-${claim.id}`}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Add a note or challenge to this claim"
              className="h-9 min-w-0 flex-1 border border-border bg-background px-2 text-sm outline-none"
            />
            <Button type="submit" size="sm" disabled={!comment.trim() || save.isPending}>
              <Send /> Add
            </Button>
          </form>
        </section>
      </DialogContent>
    </Dialog>
  );
}
