import { useState } from "react";
import { Card, CardHead } from "@/components/app/cards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmailVerificationForm } from "./EmailVerificationForm";

const PENDING_KEY = "qp-pending-account-verification";
function readPending(): { email: string; method: "code" | "link" } | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null") as {
      email?: unknown;
      method?: unknown;
    } | null;
    return value && typeof value.email === "string"
      ? { email: value.email, method: value.method === "link" ? "link" : "code" }
      : null;
  } catch {
    return null;
  }
}

/** Establish identity while the existing local portfolio remains active. */
export function HostedAccountSetup({ initialName }: { initialName: string }) {
  const [mode, setMode] = useState<"sign-up" | "sign-in">("sign-up");
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(() => readPending()?.email ?? "");
  const [verification, setVerification] = useState(() => readPending());
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function checkPortfolio() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/book-check", { credentials: "same-origin" });
      const data = (await response.json()) as {
        error?: string;
        cash_paise: number;
        holdings: number;
        orders: number;
        fills: number;
      };
      if (!response.ok) throw new Error(data.error || "Portfolio check failed");
      setMessage(
        `Imported portfolio verified through your account: ₹${(data.cash_paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} cash, ${data.holdings} holdings, ${data.orders} orders, ${data.fills} fills. The local workspace remains active until cutover.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Portfolio check is unavailable");
    } finally {
      setBusy(false);
    }
  }
  function beginVerification(method: "code" | "link" = "code") {
    const pending = { email, method };
    setVerification(pending);
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch {
      /* verification remains available without persistence */
    }
    setPassword("");
  }
  function finishVerification(verified: boolean) {
    setVerification(null);
    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* storage may be disabled */
    }
    setMode("sign-in");
    setPassword("");
    setMessage(
      verified
        ? "Email verified. Sign in to connect your account; your local portfolio is preserved."
        : "Sign in after verifying your email.",
    );
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = (await response.json()) as {
        error?: string;
        requireEmailVerification?: boolean;
        verifyEmailMethod?: "code" | "link";
        user?: { emailVerified?: boolean };
      };
      if (!response.ok) throw new Error(data.error || "Account setup failed");
      setPassword("");
      if (data.requireEmailVerification) {
        beginVerification(data.verifyEmailMethod ?? "code");
      } else {
        setMessage(
          data.user?.emailVerified
            ? "Your verified account is ready for the portfolio transfer. Your local workspace remains active until that transfer is validated."
            : "Account created. Verify its email before transferring your portfolio.",
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Account setup is unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHead title="Account setup" meta="Keep your portfolio" />
      {verification ? (
        <EmailVerificationForm
          email={email}
          onEmailChange={setEmail}
          method={verification.method}
          onVerified={() => finishVerification(true)}
          onBack={() => finishVerification(false)}
        />
      ) : (
        <form className="space-y-4 p-5" onSubmit={(event) => void submit(event)}>
          <p className="text-[12px] leading-relaxed text-subtle">
            Create or connect your account before moving this workspace. Your wallet, orders and
            history stay in the local workspace until the transfer is validated.
          </p>
          <fieldset disabled={busy} className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={mode === "sign-up" ? "default" : "outline"}
                onClick={() => setMode("sign-up")}
              >
                Create account
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "sign-in" ? "default" : "outline"}
                onClick={() => setMode("sign-in")}
              >
                Connect account
              </Button>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={() => beginVerification()}>
              Enter verification code
            </Button>
            {mode === "sign-up" && (
              <label className="block text-sm">
                Name
                <Input
                  className="mt-2"
                  autoComplete="name"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            )}
            <label className="block text-sm">
              Account email
              <Input
                className="mt-2"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="block text-sm">
              Password
              <Input
                className="mt-2"
                type="password"
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                required
                maxLength={1024}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <Button type="submit">
              {busy
                ? "Connecting…"
                : mode === "sign-up"
                  ? "Register account"
                  : "Sign in to connect"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void checkPortfolio()}>
              Check imported portfolio
            </Button>
          </fieldset>
          {message && (
            <p role="status" className="text-[12px] text-positive">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="text-[12px] text-negative">
              {error}
            </p>
          )}
        </form>
      )}
    </Card>
  );
}
