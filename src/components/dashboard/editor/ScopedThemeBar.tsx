import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { CustomizeButton } from "@/components/dashboard/DesignTabEditor";
import { StudioChip } from "@/components/studio/StudioChip";
import type { ProfileDisplayPrefs } from "@/lib/profile-display";
import {
  applyScopedPatch,
  glassSurfaceStyle,
  hasUniqueStyle,
  resetScope,
  resolveComponentDesign,
  resolveScopedTokens,
  type GlassBorder,
  type GlassStyle,
  type GlassTargets,
  type ScopeOverride,
  type ThemeScope,
  BUTTON_SHAPE_PRESETS,
  OVERRIDE_BUTTON_VARIANTS,
  OVERRIDE_BUTTON_RADII,
} from "@/lib/theme-engine";
import { BUTTON_EFFECTS, BUTTON_RADII, BUTTON_SIZES, BUTTON_VARIANTS, FONT_PAIRINGS } from "@/lib/profile-design";

type SetPref = <K extends keyof ProfileDisplayPrefs>(key: K, value: ProfileDisplayPrefs[K]) => void;

/** Kort label voor gsm, lang label vanaf tablet. */
export const SCOPES: { id: ThemeScope; short: string; label: string }[] = [
  { id: "all", short: "🌐 Alles", label: "🌐 Alle elementen" },
  { id: "links", short: "🔗 Links", label: "🔗 Links" },
  { id: "socials", short: "📱 Socials", label: "📱 Socials" },
  { id: "booking", short: "📅 Boeken", label: "📅 Boekingen" },
  { id: "board", short: "💬 Prikbord", label: "💬 Prikbord" },
  { id: "presence", short: "🎵 Status", label: "🎵 Live-status" },
  { id: "questions", short: "❓ Vragen", label: "❓ Anonieme vragen" },
  { id: "answers", short: "💡 Antwoorden", label: "💡 Q&A-antwoorden" },
];

/** Profiel-scopes: vragen en antwoorden zijn één venster, dus één keuze. */
export const PROFILE_SCOPES: readonly ThemeScope[] = ["all", "links", "socials", "booking", "board", "presence", "questions"];

const GLASS_TYPES: { id: Exclude<GlassStyle, "solid">; label: string }[] = [
  { id: "frosted-light", label: "Frosted licht" },
  { id: "frosted-dark", label: "Rookglas" },
  { id: "obsidian", label: "Liquid Obsidian" },
  { id: "prism", label: "Prism Edge" },
];

const BORDERS: { id: GlassBorder; label: string }[] = [
  { id: "subtle", label: "Subtiel" },
  { id: "bright", label: "Helder" },
  { id: "off", label: "Uit" },
];

type ShapePreset = { id: string; label: string; buttonVariant: ScopeOverride["buttonVariant"]; buttonRadius: ScopeOverride["buttonRadius"]; glassStyle: GlassStyle };
/** Knopvorm-presets, met en zonder glas. */
export const SHAPE_PRESETS: ShapePreset[] = [
  ...BUTTON_SHAPE_PRESETS.map((p) => ({ ...p, glassStyle: (p.id === "glass" ? "frosted-light" : "solid") as GlassStyle })),
  { id: "smoke-pill", label: "Rookglas Pill", buttonVariant: "fill", buttonRadius: "pill", glassStyle: "frosted-dark" },
  { id: "obsidian", label: "Obsidian", buttonVariant: "fill", buttonRadius: "xl", glassStyle: "obsidian" },
  { id: "prism", label: "Prism", buttonVariant: "outline", buttonRadius: "rounded", glassStyle: "prism" },
];

const glassTargetOf = (scope: ThemeScope): (keyof GlassTargets)[] =>
  scope === "all" ? ["links", "presence", "board", "booking"]
    : scope === "links" || scope === "socials" ? ["links"]
    : scope === "booking" ? ["booking"]
    : scope === "presence" ? ["presence"]
    : ["board"];

/** Native select met compacte overlay: op 360px duwt hij de titel nooit weg. */
export function ThemeScopeSelect({ scope, onChange, allowedScopes }: { scope: ThemeScope; onChange: (s: ThemeScope) => void; allowedScopes?: readonly ThemeScope[] }) {
  const list = SCOPES.filter((s) => (allowedScopes ?? PROFILE_SCOPES).includes(s.id));
  const cur = list.find((s) => s.id === scope) ?? list[0];
  return (
    <label className="relative inline-flex h-9 max-w-[8.5rem] shrink-0 items-center gap-1 rounded-full border border-border bg-background px-3 text-xs font-medium focus-within:ring-2 focus-within:ring-ring sm:max-w-none">
      <span className="truncate sm:hidden">{cur?.short}</span>
      <span className="hidden truncate sm:inline">{cur?.label}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <select aria-label="Stijl toepassen op" value={scope} onChange={(e) => onChange(e.target.value as ThemeScope)} className="absolute inset-0 cursor-pointer opacity-0">
        {list.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
    </label>
  );
}

export function ScopedThemeBar({ prefs, setPref, scope = "all", showTypography = true }: { prefs: ProfileDisplayPrefs; setPref: SetPref; scope?: ThemeScope; showTypography?: boolean }) {
  const tokens = resolveScopedTokens(prefs, prefs.themeOverrides, scope);
  const unique = hasUniqueStyle(prefs, prefs.themeOverrides, scope);
  const design = resolveComponentDesign(prefs, prefs.themeOverrides, scope);
  const custom = prefs.buttonsCustom;
  const glassOn = tokens.glassStyle !== "solid";

  const patch = (p: ScopeOverride) => {
    if (p.glassStyle && p.glassStyle !== "solid") {
      const next = { ...prefs.glassTargets };
      for (const k of glassTargetOf(scope)) next[k] = true;
      setPref("glassTargets", next);
    }
    if (scope === "all") {
      const next = applyScopedPatch(prefs, prefs.themeOverrides, scope, p);
      (Object.keys(p) as (keyof ScopeOverride)[]).forEach((k) => setPref(k, (next.global as Record<string, unknown>)[k] as never));
      if ("fontPairing" in p) setPref("typographyCustom", true);
      return;
    }
    let next = applyScopedPatch(prefs, prefs.themeOverrides, scope, p);
    // Eén anoniem vragenvenster: vragen en antwoorden krijgen samen dezelfde stijl.
    if (scope === "questions") next = applyScopedPatch(prefs, next.overrides, "answers", p);
    setPref("themeOverrides", next.overrides);
  };
  const reset = () => {
    let o = resetScope(prefs.themeOverrides, scope as Exclude<ThemeScope, "all">);
    if (scope === "questions") o = resetScope(o, "answers");
    setPref("themeOverrides", o);
  };

  const variants = BUTTON_VARIANTS.filter((v) => (OVERRIDE_BUTTON_VARIANTS as readonly string[]).includes(v.id));
  const radii = BUTTON_RADII.filter((r) => (OVERRIDE_BUTTON_RADII as readonly string[]).includes(r.id));
  const sample = glassSurfaceStyle(tokens, scope === "all" ? "links" : (scope as Exclude<ThemeScope, "all">), { links: true, presence: true, board: true, booking: true });

  return (
    <section className="space-y-4">
      {scope !== "all" && (
        <div className="flex flex-wrap items-center gap-2">
          {unique ? (
            <>
              <span className="text-xs font-medium text-primary">● Unieke stijl</span>
              <Button type="button" size="sm" variant="outline" onClick={reset}>Herstel naar standaard</Button>
            </>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Volgt standaard</span>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <p className="input-label">Knopvorm</p>
          <CustomizeButton open={custom} onToggle={() => setPref("buttonsCustom", !custom)} label="Knopvorm aanpassen" controls="button-advanced" />
        </div>
        {!custom && (
          <div className="flex flex-wrap gap-1.5">
            {SHAPE_PRESETS.map((sp) => (
              <StudioChip
                key={sp.id}
                active={design.buttonVariant === sp.buttonVariant && design.buttonRadius === sp.buttonRadius && tokens.glassStyle === sp.glassStyle}
                onClick={() => patch({ buttonVariant: sp.buttonVariant, buttonRadius: sp.buttonRadius, glassStyle: sp.glassStyle })}
              >
                {sp.label}{sp.glassStyle !== "solid" && <span aria-hidden className="text-[10px] opacity-70">◇</span>}
              </StudioChip>
            ))}
          </div>
        )}
      </div>

      {custom && (
        <div id="button-advanced" className="space-y-4 rounded-2xl border border-border p-3 sm:p-4">
          <Group label="Knopstijl">
            {variants.map((v) => <StudioChip key={v.id} active={design.buttonVariant === v.id} onClick={() => patch({ buttonVariant: v.id as ScopeOverride["buttonVariant"] })}>{v.label}</StudioChip>)}
          </Group>
          <Group label="Hoekafronding">
            {radii.map((r) => <StudioChip key={r.id} active={design.buttonRadius === r.id} onClick={() => patch({ buttonRadius: r.id as ScopeOverride["buttonRadius"] })}>{r.label}</StudioChip>)}
          </Group>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs">
              <span className="input-label block">Knopkleur</span>
              <input type="color" className="h-9 w-full rounded-md border border-border bg-background" value={design.buttonColor ?? "#000000"} onChange={(e) => patch({ buttonColor: e.target.value })} />
            </label>
            <div className="space-y-1 text-xs">
              <label className="flex items-center justify-between gap-2">
                <span className="input-label block">Knoprand</span>
                <Switch
                  checked={Boolean(design.buttonBorderColor)}
                  onCheckedChange={(on) => patch({ buttonBorderColor: on ? (design.buttonColor ?? "#000000") : null })}
                  aria-label="Knoprand aan of uit"
                />
              </label>
              {design.buttonBorderColor ? (
                <input type="color" aria-label="Knoprandkleur" className="h-9 w-full rounded-md border border-border bg-background" value={design.buttonBorderColor} onChange={(e) => patch({ buttonBorderColor: e.target.value })} />
              ) : (
                <p className="text-[11px] text-muted-foreground">Uit: de knopstijl bepaalt de rand.</p>
              )}
            </div>
          </div>
          {scope === "all" && <>
            <Group label="Linkweergave">
              {([["bar", "Lijn met naam"], ["icon", "Alleen icoon"]] as const).map(([id, label]) => <StudioChip key={id} active={prefs.buttonShape === id} onClick={() => setPref("buttonShape", id)}>{label}</StudioChip>)}
            </Group>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs"><span className="input-label">Knopgrootte</span><Select value={prefs.buttonSize} onValueChange={(value) => setPref("buttonSize", value as ProfileDisplayPrefs["buttonSize"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BUTTON_SIZES.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></label>
              <label className="space-y-1 text-xs"><span className="input-label">Beweging</span><Select value={prefs.buttonEffect} onValueChange={(value) => setPref("buttonEffect", value as ProfileDisplayPrefs["buttonEffect"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BUTTON_EFFECTS.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></label>
            </div>
          </>}

          <div className="space-y-3 border-t border-border pt-3">
            <label className="flex items-center justify-between gap-3 text-sm font-medium">
              Glaseffect
              <Switch checked={glassOn} onCheckedChange={(v) => patch({ glassStyle: v ? "frosted-light" : "solid" })} />
            </label>
            {glassOn && <>
              <Group label="Soort glas">
                {GLASS_TYPES.map((g) => <StudioChip key={g.id} active={tokens.glassStyle === g.id} onClick={() => patch({ glassStyle: g.id })}>{g.label}</StudioChip>)}
              </Group>
              <div className="rounded-xl bg-[linear-gradient(135deg,var(--primary),var(--accent))] p-4">
                <div className="rounded-xl px-4 py-3 text-center text-sm font-medium text-primary-foreground" style={sample ?? undefined}>Voorbeeld</div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><p className="input-label">Transparantie ({tokens.glassOpacity}%)</p><Slider min={5} max={50} step={1} value={[tokens.glassOpacity]} onValueChange={([v]) => patch({ glassOpacity: v ?? tokens.glassOpacity })} /></div>
                <div className="space-y-2"><p className="input-label">Vervaging ({tokens.glassBlur}px)</p><Slider min={4} max={32} step={1} value={[tokens.glassBlur]} onValueChange={([v]) => patch({ glassBlur: v ?? tokens.glassBlur })} /></div>
              </div>
              <Group label="Rand">
                {BORDERS.map((b) => <StudioChip key={b.id} active={tokens.glassBorder === b.id} onClick={() => patch({ glassBorder: b.id })}>{b.label}</StudioChip>)}
              </Group>
            </>}
          </div>
        </div>
      )}

      {showTypography && (
        <div className="space-y-3">
          <Group label="Typografie">
            {FONT_PAIRINGS.map((f) => <StudioChip key={f.id} active={design.fontPairing === f.id} onClick={() => patch({ fontPairing: f.id as ScopeOverride["fontPairing"] })}>{f.label}</StudioChip>)}
          </Group>
          <div className="flex items-end gap-2 text-xs">
            <label className="flex-1 space-y-1">
              <span className="input-label block">Knoptekstkleur</span>
              <input type="color" className="h-9 w-full rounded-md border border-border bg-background" value={design.buttonTextColor ?? "#ffffff"} onChange={(e) => patch({ buttonTextColor: e.target.value })} />
            </label>
            {design.buttonTextColor && (
              <Button type="button" size="sm" variant="ghost" onClick={() => patch({ buttonTextColor: null })}>Automatisch</Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="input-label">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
