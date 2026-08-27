import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * What went wrong, not a finished sentence — see PublicQueryPage for the same
 * shape. `raw` is the API's own wording; the other two name a key in this
 * page's own catalogue so a language switch after the error still shows it
 * in the language on screen.
 */
type Failure = { key: "auth.sendFailed" | "auth.invalidCode" } | { raw: string };

/**
 * Where to go after signing in. Only a path inside our own app: an absolute URL
 * here would turn the sign-in into an open redirect, where an attacker mails
 * `?next=https://evil.example` and the victim lands there having just proved
 * they control their inbox.
 *
 * The `//` check is not paranoia — `//evil.example` is a URL with a host per
 * the spec and slips past a naive `startsWith("/")`.
 */
function safeNext(next: string | null): string {
  if (!next) return "/app";
  if (next.startsWith("//")) return "/app";
  if (!next.startsWith("/app")) return "/app";
  return next;
}

export function LoginForm() {
  // `common`, not `chat`: /login is reached before signing in, and `chat` is
  // the whole signed-in app's catalogue.
  const { t } = useTranslation("common");
  const [searchParams] = useSearchParams();
  const nextParam = searchParams.get("next");

  // Prefilled from the link in the notification email, which was addressed to
  // this person: putting it in that URL tells them nothing they did not know.
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [step, setStep] = useState<"email" | "code">("email");
  const [code, setCode] = useState(Array(CODE_LENGTH).fill(""));
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();
  const sendCode = useAuthStore((s) => s.sendCode);
  const verifyCode = useAuthStore((s) => s.verifyCode);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSendCode = async (e?: FormEvent) => {
    e?.preventDefault();
    setFailure(null);
    setLoading(true);
    try {
      await sendCode(email);
      setStep("code");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: unknown) {
      const apiErr = err as { error?: { message?: string } } | undefined;
      setFailure(apiErr?.error?.message ? { raw: apiErr.error.message } : { key: "auth.sendFailed" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (fullCode: string) => {
    setFailure(null);
    setLoading(true);
    try {
      await verifyCode(email, fullCode);
      navigate(safeNext(nextParam), { replace: true });
    } catch (err: unknown) {
      const apiErr = err as { error?: { message?: string } } | undefined;
      setFailure(apiErr?.error?.message ? { raw: apiErr.error.message } : { key: "auth.invalidCode" });
      setCode(Array(CODE_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleDigitChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;

    const next = [...code];
    next[index] = value;
    setCode(next);

    if (value && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (value && index === CODE_LENGTH - 1) {
      const fullCode = next.join("");
      if (fullCode.length === CODE_LENGTH) {
        handleVerify(fullCode);
      }
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    const next = Array(CODE_LENGTH).fill("");
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setCode(next);
    if (pasted.length === CODE_LENGTH) {
      handleVerify(pasted);
    } else {
      inputRefs.current[pasted.length]?.focus();
    }
  };

  const handleResend = () => {
    if (cooldown > 0) return;
    setCode(Array(CODE_LENGTH).fill(""));
    handleSendCode();
  };

  const errorMessage = failure ? ("raw" in failure ? failure.raw : t(failure.key)) : null;

  if (step === "code") {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-950">
          <svg className="h-6 w-6 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-100">{t("auth.checkEmail")}</h3>
        <p className="mt-2 text-sm text-gray-400">
          {/* Unescaped interpolation into <Trans> — see InvitationCard.tsx for
              why that needs care. Safe here, but not because this is merely
              what the person typed: `email` is seeded above from `?email=` in
              the URL (a mailed link), which is attacker-supplied. What
              actually keeps `<`, `>` and `"` out is that this render is only
              reached at step "code", which requires a prior successful submit
              through <Input type="email" required> below plus the server's
              own validation. Relax that field to type="text", or add a
              username sign-in path, and this needs the same
              shouldUnescape/escapeValue:true treatment. */}
          <Trans t={t} i18nKey="auth.codeSentTo" values={{ email }} components={{ email: <strong /> }} />
        </p>

        <div className="mt-6 flex justify-center gap-2" onPaste={handlePaste}>
          {code.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              autoFocus={i === 0}
              disabled={loading}
              className="h-12 w-10 rounded-lg border border-surface-border bg-surface-secondary text-center text-xl font-bold text-gray-100 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:opacity-50"
            />
          ))}
        </div>

        {errorMessage && <p className="mt-3 text-sm text-red-400">{errorMessage}</p>}

        <div className="mt-6">
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || loading}
            className="text-sm text-brand-400 hover:text-brand-300 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            {cooldown > 0 ? t("auth.resendCodeIn", { seconds: cooldown }) : t("auth.resendCode")}
          </button>
        </div>

        <button
          type="button"
          onClick={() => { setStep("email"); setFailure(null); setCode(Array(CODE_LENGTH).fill("")); }}
          className="mt-2 text-sm text-gray-500 hover:text-gray-400"
        >
          {t("auth.useAnotherEmail")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSendCode} className="space-y-4">
      <Input
        id="email"
        type="email"
        label={t("auth.emailLabel")}
        placeholder={t("auth.emailPlaceholder")}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errorMessage ?? undefined}
        required
      />
      <Button type="submit" className="w-full" loading={loading}>
        {t("auth.sendCode")}
      </Button>
    </form>
  );
}
