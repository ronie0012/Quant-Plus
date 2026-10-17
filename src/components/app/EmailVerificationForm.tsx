import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EmailVerificationForm({
  email,
  onEmailChange,
  onVerified,
  onBack,
  method = "code",
}: {
  email: string;
  onEmailChange: (email: string) => void;
  onVerified: () => void;
  onBack: () => void;
  method?: "code" | "link";
}) {
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function perform(resend: boolean) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/auth/${resend ? "resend-verification" : "verify-email"}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resend ? { email } : { email, otp }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Verification failed");
      setOtp("");
      if (resend)
        setMessage(
          "A new verification email was requested. Check your inbox and use the latest code or link.",
        );
      else onVerified();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verification is unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="space-y-4 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void perform(false);
      }}
    >
      <p className="text-sm">
        {method === "code"
          ? "Enter the six-digit OTP from your verification email."
          : "Open the verification link in your email, then return to sign in."}
      </p>
      <fieldset disabled={busy} className="space-y-4">
        <label className="block text-sm">
          Verification email
          <Input
            className="mt-2"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
          />
        </label>
        {method === "code" && (
          <>
            <label className="block text-sm">
              Verification code
              <Input
                className="mt-2"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </label>
            <Button type="submit">{busy ? "Verifying…" : "Verify email"}</Button>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!email}
            onClick={() => void perform(true)}
          >
            Resend verification
          </Button>
          <Button type="button" variant="ghost" onClick={onBack}>
            Back to sign in
          </Button>
        </div>
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
  );
}
