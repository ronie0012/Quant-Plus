import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2, Lock, Mail, ShieldCheck, User } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { hostedAuthConfig, signInHosted, signUpHosted } from "@/lib/workspace-session";
import { cn } from "@/lib/utils";
import { EmailVerificationForm } from "@/components/app/EmailVerificationForm";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Quant Plus" },
      {
        name: "description",
        content:
          "Sign in to the Quant Plus terminal for your portfolio, market overview, sentiment and AI market intelligence.",
      },
      { property: "og:title", content: "Sign in — Quant Plus" },
      {
        property: "og:description",
        content: "Access the Quant Plus market and portfolio terminal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup";

const HOSTED_UNAVAILABLE =
  "Hosted sign-in is not enabled in this local build. Open the local workspace instead; hosted accounts arrive with the InsForge migration.";

const proofPoints = [
  "Portfolio, market and sentiment in one terminal",
  "Quant signals with transparent reasoning",
  "AI market intelligence, always cited",
];

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading: sessionLoading } = useSession();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "email" | "google">(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState("");

  useEffect(() => {
    if (session) void navigate({ to: "/app/dashboard", replace: true });
  }, [session, navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("email");
    if (!hostedAuthConfig()) {
      // This build serves the single local profile; hosted accounts are disabled.
      setError(HOSTED_UNAVAILABLE);
      setBusy(null);
      return;
    }
    try {
      if (mode === "signup") {
        const created = await signUpHosted(email, password, name || email.split("@")[0]!);
        if (!created) setConfirmSent(true);
        else void navigate({ to: "/app/dashboard", replace: true });
      } else {
        await signInHosted(email, password);
        void navigate({ to: "/app/dashboard", replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleGoogle() {
    setError(null);
    setError(HOSTED_UNAVAILABLE);
    setBusy(null);
  }

  return (
    <div className="relative min-h-screen bg-background lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* brand column */}
      <aside className="relative hidden overflow-hidden border-r border-border bg-surface lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 grid-lines opacity-[0.45]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 -left-24 h-[420px] w-[420px] rounded-full opacity-45 blur-[120px]"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--color-primary) 40%, transparent), transparent 70%)",
          }}
        />
        <Link to="/" className="relative flex items-center gap-2.5">
          <span className="relative flex h-4 w-4 items-center justify-center">
            <span className="absolute inset-0 border border-primary/70" aria-hidden="true" />
            <span className="h-1 w-1 bg-primary" />
          </span>
          <span className="font-mono text-[13px] tracking-[0.2em] uppercase">
            Quant<span className="text-primary-soft">+</span>
          </span>
        </Link>

        <div className="relative max-w-md">
          <p className="label-tech flex items-center gap-3">
            <span className="h-px w-8 bg-border-strong" aria-hidden="true" />
            The terminal
          </p>
          <h1 className="mt-7 text-[clamp(2.2rem,3.4vw,3.2rem)] leading-[1.02] tracking-[-0.03em]">
            Your money and the market,
            <span className="block text-muted-foreground">on one screen.</span>
          </h1>
          <ul className="mt-9 space-y-3">
            {proofPoints.map((p) => (
              <li key={p} className="flex items-start gap-3 text-sm text-muted-foreground">
                <span className="mt-2 h-1 w-1 shrink-0 bg-primary" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase text-subtle">
          <ShieldCheck className="h-3.5 w-3.5 text-primary-soft" />
          Paper trading · not investment advice
        </div>
      </aside>

      {/* form column */}
      <main className="relative flex min-h-screen items-center justify-center px-5 py-16 sm:px-10">
        <div className="w-full max-w-[420px]">
          <Link to="/" className="mb-10 flex items-center gap-2.5 lg:hidden">
            <span className="h-4 w-4 border border-primary/70" aria-hidden="true" />
            <span className="font-mono text-[13px] tracking-[0.2em] uppercase">
              Quant<span className="text-primary-soft">+</span>
            </span>
          </Link>

          <div className="flex border border-border">
            {(["signin", "signup"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setConfirmSent(false);
                }}
                aria-pressed={mode === m}
                className={cn(
                  "relative flex-1 px-4 py-3 font-mono text-[10px] tracking-[0.18em] uppercase transition-colors duration-300",
                  mode === m
                    ? "bg-panel text-foreground"
                    : "text-subtle hover:text-muted-foreground",
                )}
              >
                {m === "signin" ? "Log in" : "Create account"}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-x-0 bottom-0 h-px origin-left bg-primary transition-transform duration-300",
                    mode === m ? "scale-x-100" : "scale-x-0",
                  )}
                />
              </button>
            ))}
          </div>

          <h2 className="mt-9 text-2xl tracking-tight">
            {mode === "signin" ? "Welcome back." : "Open your terminal."}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {mode === "signin"
              ? "Sign in to view your portfolio and the market overview."
              : "Your paper book starts empty: add virtual funds, then place your first simulated trade."}
          </p>

          {confirmSent ? (
            <div className="mt-8 border border-border bg-panel p-6">
              <p className="label-tech">Check your email</p>
              <EmailVerificationForm
                email={email}
                onEmailChange={setEmail}
                onVerified={() => {
                  setConfirmSent(false);
                  setMode("signin");
                  setPassword("");
                  setVerificationMessage("Email verified. Sign in to continue.");
                }}
                onBack={() => {
                  setConfirmSent(false);
                  setMode("signin");
                }}
              />
            </div>
          ) : (
            <>
              <form onSubmit={handleEmail} className="mt-8 space-y-3">
                {verificationMessage && (
                  <p role="status" className="text-sm text-positive">
                    {verificationMessage}
                  </p>
                )}
                {mode === "signup" && (
                  <Field
                    icon={<User className="h-3.5 w-3.5" />}
                    label="Name"
                    value={name}
                    onChange={setName}
                    type="text"
                    placeholder="Ronit Ashani"
                    autoComplete="name"
                  />
                )}
                <Field
                  icon={<Mail className="h-3.5 w-3.5" />}
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  type="email"
                  placeholder="you@firm.com"
                  autoComplete="email"
                  required
                />
                <Field
                  icon={<Lock className="h-3.5 w-3.5" />}
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  type="password"
                  placeholder="••••••••"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                />

                {error && (
                  <p
                    role="alert"
                    className="border border-negative/40 bg-negative/5 px-3 py-2.5 text-xs text-negative"
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy !== null || sessionLoading}
                  className="group mt-2 flex w-full items-center justify-center gap-2.5 border border-primary/60 bg-primary px-6 py-3.5 font-mono text-[11px] tracking-[0.18em] uppercase text-primary-foreground transition-all duration-500 hover:border-primary-soft hover:bg-primary-soft disabled:opacity-60"
                >
                  {busy === "email" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      {mode === "signin" ? "Enter terminal" : "Create account"}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-500 group-hover:translate-x-1" />
                    </>
                  )}
                </button>
              </form>

              <div className="my-6 flex items-center gap-4">
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
                <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-subtle">
                  or
                </span>
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
              </div>

              <button
                type="button"
                onClick={handleGoogle}
                disabled={busy !== null}
                className="flex w-full items-center justify-center gap-3 border border-border-strong px-6 py-3.5 font-mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground transition-colors duration-500 hover:border-foreground/30 hover:text-foreground disabled:opacity-60"
              >
                {busy === "google" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <GoogleMark />
                    Continue with Google
                  </>
                )}
              </button>
            </>
          )}

          <p className="mt-10 font-mono text-[10px] leading-relaxed tracking-[0.14em] uppercase text-subtle">
            Virtual funds only · Quant Plus does not provide investment advice
          </p>
        </div>
      </main>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
  onChange,
  type,
  placeholder,
  autoComplete,
  required,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  placeholder: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="label-tech">{label}</span>
      <span className="mt-2 flex items-center gap-3 border border-border bg-panel px-3.5 py-3 transition-colors duration-300 focus-within:border-primary/60">
        <span className="text-subtle">{icon}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-subtle"
        />
      </span>
    </label>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8H1.3v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z"
      />
    </svg>
  );
}
