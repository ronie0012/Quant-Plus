import { useEffect, useState } from "react";
import { BrandMark, BrandWordmark } from "@/components/brand/BrandMark";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, User } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import {
  hostedAuthConfig,
  hostedAuthEnabled,
  sendResetPasswordEmail,
  exchangeResetPasswordToken,
  resetHostedPassword,
  signInHosted,
  signUpHostedResult,
} from "@/lib/workspace-session";
import { cn } from "@/lib/utils";
import { EmailVerificationForm } from "@/components/app/EmailVerificationForm";
import { safeWorkspaceReturn } from "@/lib/workspace-return";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search["redirect"] === "string"
      ? { redirect: safeWorkspaceReturn(search["redirect"]) }
      : {},
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

type Mode = "signin" | "signup" | "reset";
type VerificationMethod = "code" | "link";

const PENDING_VERIFICATION_KEY = "qp-pending-auth-verification";

function readPendingVerification(): { email: string; method: VerificationMethod } | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const pending = JSON.parse(sessionStorage.getItem(PENDING_VERIFICATION_KEY) ?? "null") as {
      email?: unknown;
      method?: unknown;
    } | null;
    return pending && typeof pending.email === "string"
      ? { email: pending.email, method: pending.method === "link" ? "link" : "code" }
      : null;
  } catch {
    return null;
  }
}

const HOSTED_UNAVAILABLE =
  "Hosted sign-in is not enabled in this local build. Open the local workspace instead; hosted accounts arrive with the InsForge migration.";

const proofPoints = [
  "Portfolio, market and sentiment in one terminal",
  "Quant signals with transparent reasoning",
  "AI market intelligence, always cited",
];

function AuthPage() {
  const navigate = useNavigate();
  const redirect = safeWorkspaceReturn(Route.useSearch().redirect);
  const { session, loading: sessionLoading } = useSession();
  const pendingVerification = readPendingVerification();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(pendingVerification?.email ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "email">(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(pendingVerification != null);
  const [verificationMethod, setVerificationMethod] = useState<VerificationMethod>(
    pendingVerification?.method ?? "code",
  );
  const [verificationMessage, setVerificationMessage] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetToken, setResetToken] = useState("");

  useEffect(() => {
    if (session) void navigate({ to: redirect, replace: true });
  }, [session, navigate, redirect]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("email");
    if (!hostedAuthEnabled()) {
      // This build serves the single local profile; hosted accounts are disabled.
      setError(HOSTED_UNAVAILABLE);
      setBusy(null);
      return;
    }
    try {
      if (mode === "reset") {
        if (!resetSent) {
          await sendResetPasswordEmail(email);
          setResetSent(true);
          setVerificationMessage("If that account exists, a reset code is on its way.");
        } else if (!resetToken) {
          setResetToken(await exchangeResetPasswordToken(email, password));
          setPassword("");
          setVerificationMessage("Code accepted. Choose a new password.");
        } else {
          await resetHostedPassword(resetToken, password);
          setMode("signin");
          setResetSent(false);
          setResetToken("");
          setPassword("");
          setVerificationMessage("Password updated. Sign in with your new password.");
        }
      } else if (mode === "signup") {
        if (!hostedAuthConfig()) {
          setError("Hosted authentication is misconfigured; contact the workspace administrator.");
          return;
        }
        const result = await signUpHostedResult(email, password, name || email.split("@")[0]!);
        if (!result.session) {
          const method = result.verifyEmailMethod ?? "code";
          setVerificationMethod(method);
          setConfirmSent(true);
          try {
            sessionStorage.setItem(PENDING_VERIFICATION_KEY, JSON.stringify({ email, method }));
          } catch {
            /* verification remains available without persistence */
          }
        } else {
          void navigate({ to: redirect, replace: true });
        }
      } else {
        await signInHosted(email, password);
        void navigate({ to: redirect, replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
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
          <BrandMark className="h-7 w-7" />
          <BrandWordmark className="text-[16px]" />
        </Link>

        <div className="relative max-w-md">
          <p className="label-tech flex items-center gap-3">
            <span className="h-px w-8 bg-border-strong" aria-hidden="true" />
            The terminal
          </p>
          <p className="mt-7 text-[clamp(2.2rem,3.4vw,3.2rem)] leading-[1.02] tracking-[-0.03em]">
            Your money and the market,
            <span className="block text-muted-foreground">on one screen.</span>
          </p>
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
      <main
        id="main-content"
        tabIndex={-1}
        className="relative flex min-h-dvh items-center justify-center px-5 py-16 outline-none sm:px-10"
      >
        <div className="w-full max-w-[420px]">
          <Link to="/" className="mb-10 flex items-center gap-2.5 lg:hidden">
            <BrandMark className="h-7 w-7" />
            <BrandWordmark className="text-[16px]" />
          </Link>

          <div className="flex border border-border">
            {(["signin", "signup"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setConfirmSent(false);
                }}
                aria-pressed={mode === m}
                className={cn(
                  "relative flex-1 px-4 py-3 text-[13px] font-medium transition-colors duration-300",
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

          <h1 className="mt-9 text-2xl tracking-tight">
            {mode === "signin"
              ? "Welcome back."
              : mode === "reset"
                ? "Recover your terminal."
                : "Open your terminal."}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {mode === "signin"
              ? "Sign in to view your portfolio and the market overview."
              : mode === "reset"
                ? "Request a one-time code, then choose a new password."
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
                  try {
                    sessionStorage.removeItem(PENDING_VERIFICATION_KEY);
                  } catch {
                    /* storage may be disabled */
                  }
                }}
                onBack={() => {
                  setConfirmSent(false);
                  setMode("signin");
                  try {
                    sessionStorage.removeItem(PENDING_VERIFICATION_KEY);
                  } catch {
                    /* storage may be disabled */
                  }
                }}
                method={verificationMethod}
              />
            </div>
          ) : (
            <>
              <form onSubmit={handleEmail} className="mt-8" aria-busy={busy !== null}>
                <fieldset disabled={busy !== null} className="space-y-3">
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
                      placeholder="Your name"
                      autoComplete="name"
                    />
                  )}
                  {mode === "reset" && resetSent && !resetToken && (
                    <p className="text-xs text-muted-foreground">
                      Enter the six-digit code from your reset email.
                    </p>
                  )}
                  <Field
                    icon={<Mail className="h-3.5 w-3.5" />}
                    label="Email"
                    value={email}
                    onChange={setEmail}
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                  <Field
                    icon={<Lock className="h-3.5 w-3.5" />}
                    label={mode === "reset" && resetSent && !resetToken ? "Reset code" : "Password"}
                    value={password}
                    onChange={setPassword}
                    type={mode === "reset" && resetSent && !resetToken ? "text" : "password"}
                    placeholder={
                      mode === "reset" && resetSent && !resetToken ? "123456" : "••••••••"
                    }
                    autoComplete={
                      mode === "reset" && resetSent && !resetToken
                        ? "one-time-code"
                        : mode === "signin"
                          ? "current-password"
                          : "new-password"
                    }
                    required={mode !== "reset" || resetSent}
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
                    className="group mt-2 flex w-full items-center justify-center gap-2.5 rounded-md bg-primary-action px-6 py-3 text-[14px] font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary disabled:opacity-60"
                  >
                    {busy === "email" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        {mode === "signin"
                          ? "Enter terminal"
                          : mode === "reset"
                            ? !resetSent
                              ? "Send reset code"
                              : !resetToken
                                ? "Verify reset code"
                                : "Update password"
                            : "Create account"}
                        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-500 group-hover:translate-x-1" />
                      </>
                    )}
                  </button>
                </fieldset>
              </form>
              {mode === "signin" && (
                <button
                  type="button"
                  className="mt-4 text-xs text-primary-soft underline-offset-4 hover:underline"
                  onClick={() => {
                    setMode("reset");
                    setError(null);
                    setPassword("");
                    setResetSent(false);
                    setResetToken("");
                  }}
                >
                  Forgot password?
                </button>
              )}
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
  const [showPassword, setShowPassword] = useState(false);
  return (
    <label className="block">
      <span className="label-tech">{label}</span>
      <span className="mt-2 flex items-center gap-3 border border-border bg-panel px-3.5 py-3 transition-colors duration-300 focus-within:border-primary/60">
        <span className="text-subtle">{icon}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={type === "password" && showPassword ? "text" : type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-subtle"
        />
        {type === "password" && (
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-subtle hover:text-foreground"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        )}
      </span>
    </label>
  );
}
