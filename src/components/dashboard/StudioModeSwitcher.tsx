import { BadgeCheck, HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

type Mode = "profile" | "tip";

/** Only offer switching when both editable destinations are available. */
export function StudioModeSwitcher({ mode, onChange, handle, enabled = true }: { mode: Mode; onChange: (m: Mode) => void; handle: string; enabled?: boolean }) {
  const { t } = useI18n();
  if (!enabled && mode === "profile") return null;
  const destinations = [
    { id: "profile" as const, Icon: BadgeCheck },
    { id: "tip" as const, Icon: HeartHandshake },
  ];
  return (
    <div role="tablist" aria-label="Studio" data-tour="studio-mode" className="mb-3 flex flex-wrap gap-1 bg-transparent">
      {destinations.map(({ id, Icon }) => (
        <Button key={id} variant="ghost" type="button" role="tab" aria-selected={mode === id} disabled={id === "tip" && !enabled} onClick={() => onChange(id)} className={`min-h-12 h-auto min-w-0 flex-1 justify-start gap-2 whitespace-normal rounded-lg border-0 px-3 py-2 text-left shadow-none ${mode === id ? "bg-foreground text-background hover:bg-foreground hover:text-background" : "bg-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}>
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{t(id === "profile" ? "studio.mode.profile" : "studio.mode.tip")}</span>
            <span className="block truncate font-mono text-[11px] opacity-70">rout.be/{handle}{id === "tip" ? "/tip" : ""}</span>
          </span>
        </Button>
      ))}
    </div>
  );
}
