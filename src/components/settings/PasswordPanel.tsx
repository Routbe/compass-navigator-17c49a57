import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordField, isPasswordCompliant } from "@/components/PasswordField";
import { getPasswordState, requestSecurityCode, setAccountPassword } from "@/lib/account-security.functions";

export const PASSWORD_STATE_KEY = ["password-state"];

/**
 * Password: change with the current one, or — never set / forgotten — with a
 * 6-digit code sent to the account's e-mail.
 */
export function PasswordPanel() {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const state = useQuery({ queryKey: PASSWORD_STATE_KEY, queryFn: useServerFn(getPasswordState) });
  const askCode = useServerFn(requestSecurityCode);
  const save = useServerFn(setAccountPassword);
  const has = state.data?.hasPassword ?? false;

  const [useCode, setUseCode] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const codeMode = !has || useCode;

  const sendCode = async () => {
    setBusy(true);
    try {
      const r = await askCode({ data: { purpose: "password" } });
      if (r.ok) {
        setSentTo(r.sentTo);
        toast.success(t("auth.settings.password.sent", { email: r.sentTo }));
      } else toast.error(r.reason === "rate_limited" ? t("auth.settings.password.rateLimited") : t("auth.settings.password.noEmail"));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (next !== confirm) return toast.error(t("auth.settings.password.mismatch"));
    setBusy(true);
    try {
      const r = await save({ data: { newPassword: next, ...(codeMode ? { code } : { currentPassword: current }) } });
      if (!r.ok) {
        return toast.error(r.reason === "bad_code" ? t("auth.settings.password.invalidCode") : r.reason === "bad_password" ? t("auth.settings.password.invalidCurrent") : t("auth.settings.password.failed"));
      }
      toast.success(has ? t("auth.settings.password.changed") : t("auth.settings.password.set"));
      setCurrent(""); setNext(""); setConfirm(""); setCode(""); setSentTo(null); setUseCode(false);
      await qc.invalidateQueries({ queryKey: PASSWORD_STATE_KEY });
    } catch {
      toast.error(t("auth.settings.password.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <KeyRound className="h-4 w-4" /> {t("auth.password.label")}
      </h2>
      {state.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {has
              ? t("auth.settings.password.hasPassword")
              : t("auth.settings.password.noPassword")}
          </p>

          {codeMode ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={sendCode} disabled={busy} className="h-11">
                {sentTo ? t("auth.settings.password.resend") : t("auth.settings.password.send")}
              </Button>
              {sentTo && (
                <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} maxLength={6}
                  inputMode="numeric" autoComplete="one-time-code" placeholder="123456" aria-label={t("auth.settings.password.code")}
                  className="h-11 w-36 rounded-xl text-center font-mono tracking-[0.3em]" />
              )}
            </div>
          ) : (
            <Input value={current} type="password" placeholder={t("auth.settings.password.current")} maxLength={128}
              autoComplete="current-password" onChange={(e) => setCurrent(e.target.value)} className="h-11 rounded-xl" />
          )}

          <PasswordField label={has ? t("auth.settings.password.new") : t("auth.settings.password.password")} value={next} onChange={setNext} />
          <Input value={confirm} type="password" placeholder={t("auth.settings.password.confirm")} maxLength={128}
            autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} className="h-11 rounded-xl" />

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={submit}
              disabled={busy || !isPasswordCompliant(next) || (codeMode ? code.length !== 6 : !current)}
              className="h-11">
              {has ? t("auth.settings.password.change") : t("auth.settings.password.create")}
            </Button>
            {has && (
              <button type="button" onClick={() => setUseCode((v) => !v)}
                className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                {useCode ? t("auth.settings.password.know") : t("auth.settings.password.forgot")}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
