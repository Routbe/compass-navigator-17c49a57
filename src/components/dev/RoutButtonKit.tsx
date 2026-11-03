import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/CodeBlock";
import { routButtonSnippet, type RoutButtonTheme } from "@/lib/oauth/button-kit";

/** Renders the exact snippet markup as a non-submitting preview. */
function previewHtml(mode: "login" | "connect", theme: RoutButtonTheme) {
  return routButtonSnippet(mode, theme)
    .replace(/<!--[\s\S]*?-->/, "")
    .replace(/<form[^>]*>/, "<div>").replace("</form>", "</div>")
    .replace('type="submit"', 'type="button" tabindex="-1"');
}

export function RoutButtonKit() {
  const [mode, setMode] = useState<"login" | "connect">("login");
  const [theme, setTheme] = useState<RoutButtonTheme>("dark");
  return <section className="space-y-4" aria-labelledby="rout-button-kit">
    <h2 id="rout-button-kit" className="font-display text-2xl">Officiële ROUT-knoppen</h2>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Knopvariant">
      <Button variant={mode === "login" ? "secondary" : "ghost"} aria-pressed={mode === "login"} onClick={() => setMode("login")}>Login met ROUT</Button>
      <Button variant={mode === "connect" ? "secondary" : "ghost"} aria-pressed={mode === "connect"} onClick={() => setMode("connect")}>Connect ROUT</Button>
    </div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Knopkleur">
      <Button variant={theme === "dark" ? "secondary" : "ghost"} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>Zwart</Button>
      <Button variant={theme === "light" ? "secondary" : "ghost"} aria-pressed={theme === "light"} onClick={() => setTheme("light")}>Wit</Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2" aria-label="Voorbeeld van de officiële ROUT-knoppen">
      {(["dark", "light"] as const).map((t) => (
        <div key={t} className={`flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-border p-6 ${t === "dark" ? "bg-card" : "bg-muted"}`}>
          <div aria-hidden dangerouslySetInnerHTML={{ __html: previewHtml(mode, t) }} />
          <span className="text-xs text-muted-foreground">{t === "dark" ? "Zwart — voor lichte achtergronden" : "Wit — voor donkere of gekleurde achtergronden"}</span>
        </div>
      ))}
    </div>
    <p className="text-sm text-muted-foreground">{mode === "login" ? "Login maakt een sessie in jouw app na de bevestigde ROUT-terugkeer." : "Connect koppelt ROUT aan een al ingelogd account in jouw app; het vervangt geen account of sessie."}</p>
    <p className="text-sm text-muted-foreground">De code is de knop, niet de volledige login. Maak eerst de aangegeven handler en een exact geregistreerd terugkeeradres. Start nooit automatisch bij het openen van een pagina. Google en andere aanmeldmethodes hebben hun eigen implementatie nodig.</p>
    <CodeBlock
      code={routButtonSnippet(mode, theme)}
      language="html"
      collapsible
      title={`Toon code — ${theme === "dark" ? "zwarte" : "witte"} knop (HTML)`}
      copyLabel="Kopieer code"
      copiedLabel="Gekopieerd!"
    />
  </section>;
}