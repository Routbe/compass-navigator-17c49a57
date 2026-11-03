import { useState } from "react";
import {
  Menu,
  QrCode,
  Layers,
  Link2,
  Globe,
  PanelsTopLeft,
  BookOpen,
  Palette,
  CalendarDays,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Link } from "@/lib/router-compat";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const itemClass =
  "flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground hover:bg-muted/60 transition-colors";

// Directe routing naar de werkende tools — de informatieve SEO-landingspagina's
// (/qr-code-generator, /product/*) blijven via sitemap en footer bereikbaar.
const TOOLS = [
  { to: "/qr", label: "menu.generator.label", hint: "menu.generator.hint", icon: QrCode },
  { to: "/studio", label: "menu.studio.label", hint: "menu.studio.hint", icon: Palette },
  { to: "/agenda", label: "menu.agenda.label", hint: "menu.agenda.hint", icon: CalendarDays },
  { to: "/batch", label: "menu.batch.label", hint: "menu.batch.hint", icon: Layers },
  {
    to: "/dashboard/routes",
    label: "menu.links.label",
    hint: "menu.links.hint",
    icon: Link2,
  },
] as const;

const INFRASTRUCTURE = [
  { to: "/product/custom-domains", label: "menu.domains.label", hint: "menu.domains.hint", icon: Globe },
  { to: "/console", label: "menu.api.label", hint: "menu.api.hint", icon: PanelsTopLeft },
  { to: "/self-hosting", label: "menu.docs.label", hint: "menu.docs.hint", icon: BookOpen },
] as const;

interface NavItem {
  to: string;
  label: string;
  hint: string;
  icon: LucideIcon;
}

function Section({ title, items, onNavigate }: { title: string; items: readonly NavItem[]; onNavigate: () => void }) {
  const { t } = useI18n();
  return (
    <nav className="border-t border-border pt-3">
      <p className="eyebrow px-3 pb-1 pt-1">{title}</p>
      {items.map(({ to, label, hint, icon: Icon }) => (
        <Link key={to} to={to} className={itemClass} onClick={onNavigate}>
          <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            {t(label)}
            <span className="block truncate text-xs text-muted-foreground">{t(hint)}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}

/** Platform tools & infrastructure only — account links live in the profile popover. */
export function MobileMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={t("menu.open")}
        className={
          className ??
          "h-10 w-10 shrink-0 rounded-xl border border-border flex items-center justify-center transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        }
      >
        <Menu className="h-5 w-5" strokeWidth={1.8} />
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-[86vw] max-w-xs flex-col overflow-y-auto bg-background"
      >
        <SheetHeader>
          <SheetTitle className="text-left font-display text-xl">{t("menu.platform")}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
          <Section title={t("menu.tools")} items={TOOLS} onNavigate={() => setOpen(false)} />
          <Section title={t("menu.infrastructure")} items={INFRASTRUCTURE} onNavigate={() => setOpen(false)} />

          <div
            className="mt-auto flex items-center gap-2 border-t border-border pt-4"
          >
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
