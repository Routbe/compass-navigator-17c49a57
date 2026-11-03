import { useTranslation } from "react-i18next";
import { useId, useMemo, useState } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface PasswordRules {
  length: boolean;
  case: boolean;
  digitOrSymbol: boolean;
}

export function scorePassword(value: string) {
  const rules: PasswordRules = {
    length: value.length >= 8,
    case: /[a-z]/.test(value) && /[A-Z]/.test(value),
    digitOrSymbol: /[0-9]/.test(value) || /[^A-Za-z0-9]/.test(value),
  };
  const met = Object.values(rules).filter(Boolean).length;
  const strong = met === 3 && value.length >= 8;
  const level = value.length === 0 ? 0 : strong ? 3 : met >= 2 ? 2 : 1;
  return { rules, level };
}

/** True once every checklist rule is satisfied — use to gate sign-up/change-password submits. */
export function isPasswordCompliant(value: string) {
  const { rules } = scorePassword(value);
  return Object.values(rules).every(Boolean);
}

const LEVEL_META = [
  { label: "", bar: "" },
  { label: "auth.password.weak", bar: "bg-destructive" },
  { label: "auth.password.medium", bar: "bg-amber-500" },
  { label: "auth.password.strong", bar: "bg-emerald-500" },
] as const;

const CHECKS: { key: keyof PasswordRules; label: string; hint: string }[] = [
  { key: "length", label: "auth.password.length", hint: "auth.password.length" },
  {
    key: "case",
    label: "auth.password.case",
    hint: "auth.password.case",
  },
  {
    key: "digitOrSymbol",
    label: "auth.password.symbol",
    hint: "auth.password.symbol",
  },
];

/** Password input with show/hide toggle, strength meter and requirement checklist. */
export function PasswordField({
  value,
  onChange,
  label,
  required,
  minLength,
  showMeter = true,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  required?: boolean;
  minLength?: number;
  showMeter?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const { t } = useTranslation();
  const id = useId();
  const { rules, level } = useMemo(() => scorePassword(value), [value]);
  const unmet = useMemo(() => CHECKS.filter((c) => !rules[c.key]), [rules]);
  const hint =
    value.length === 0
      ? ""
      : unmet.length
        ? unmet.map((c) => t(c.hint)).join(" · ")
        : t("auth.password.met");

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-sm">
        {label ?? t("auth.password.label")}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 rounded-lg pr-10 focus-visible:ring-2 focus-visible:ring-ring"
          required={required}
          minLength={minLength}
          autoComplete="new-password"
          aria-describedby={showMeter ? `${id}-hint` : undefined}
        />
        <button
          type="button"
          data-testid="password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t("auth.password.hide") : t("auth.password.show")}
          aria-pressed={visible}
          className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      </div>

      {showMeter ? (
        <div data-testid="password-strength" data-level={level} className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 gap-1" aria-hidden>
              {[1, 2, 3].map((seg) => (
                <span
                  key={seg}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors",
                    level >= seg ? LEVEL_META[level].bar : "bg-border",
                  )}
                />
              ))}
            </div>
            <span className="min-w-[3.5rem] font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {LEVEL_META[level].label ? t(LEVEL_META[level].label) : ""}
            </span>
          </div>
          <p
            id={`${id}-hint`}
            data-testid="password-hint"
            aria-live="polite"
            className={cn(
              "text-[11px] transition-colors",
              unmet.length === 0 && value.length > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground",
            )}
          >
            {hint}
          </p>
          <ul className="space-y-1">
            {CHECKS.map((c) => {
              const ok = rules[c.key];
              return (
                <li
                  key={c.key}
                  className={cn(
                    "flex items-center gap-1.5 text-[11px] transition-colors",
                    ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                  )}
                >
                  {ok ? (
                    <Check className="size-3 shrink-0" aria-hidden />
                  ) : (
                    <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                  )}
                  {t(c.label)}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
