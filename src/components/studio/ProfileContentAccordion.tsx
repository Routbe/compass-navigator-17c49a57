import { useTranslation } from "react-i18next";
import { type Dispatch, type ReactNode, type SetStateAction, useState } from "react";
import { Plus, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ProfileLinksManager } from "@/components/dashboard/editor/ProfileLinksManager";
import { AddComponentModal, type WidgetId } from "@/components/studio/AddComponentModal";
import { scheduledBlocks, type ProfileBlock } from "@/lib/profile";
import { StudioSectionIcon } from "./StudioSectionIcon";
import { ProfileImportCard } from "./ProfileImportCard";
import { Switch } from "@/components/ui/switch";

interface Props {
  cardEffects: boolean;
  onCardEffectsChange: (value: boolean) => void;
  blocks: ProfileBlock[];
  onBlocksChange: Dispatch<SetStateAction<ProfileBlock[]>>;
  openBlock: string | null;
  onOpenBlockChange: (id: string | null) => void;
  onOpenAddDrawer: () => void;
  /** Voegt een blok van dit type toe en opent het meteen. */
  onAddKind: (kind: string, value?: string) => void;
  /** Extra secties (referrals, QR, badges …) onder de linklijst. */
  children?: ReactNode;
  /** Profielhandle voor bio-verificatie in de kluis. */
  handle?: string;
  /** Zet een profielwidget aan vanuit de catalogus. */
  onWidget?: (id: WidgetId) => void;
  /** Import: take over name/subtitle from a restored export. */
  onImportMeta?: (meta: { displayName: string | null; tagline: string | null }) => void;
}

/**
 * 🔗 Links & Inhoudscomponenten.
 *
 * Bundelt de sleepbare linklijst, de rijke componentbibliotheek en alle
 * bijhorende secties. Elke wijziging is meteen zichtbaar in de live preview.
 */
export function ProfileContentAccordion({
  cardEffects,
  onCardEffectsChange,
  blocks,
  onBlocksChange,
  openBlock,
  onOpenBlockChange,
  onOpenAddDrawer,
  onAddKind,
  children,
  handle,
  onWidget,
  onImportMeta,
}: Props) {
  const { t } = useTranslation();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const live = scheduledBlocks(blocks).length;

  return (
    <AccordionItem
      value="components_list"
      className="rounded-2xl border border-border bg-card px-4 sm:px-5"
    >
      <AccordionTrigger className="hover:no-underline">
        <span className="flex flex-1 items-center justify-between gap-3 pr-2">
          <span className="flex min-w-0 items-center gap-2 text-base font-medium"><StudioSectionIcon kind="content" />{t("studio.content.title").replace(/^\p{Extended_Pictographic}\s*/u, "")}</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            {t("studio.content.visible", { count: live })}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 pb-5">
        <button
          type="button"
          onClick={() => setLibraryOpen(true)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-medium transition-colors hover:bg-muted"
        >
          <Plus className="h-4 w-4" aria-hidden /> {t("studio.content.add")} </button>
        <AddComponentModal
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          onAdd={onAddKind}
          handle={handle}
          onWidget={onWidget}
        />
        <Button variant="ghost" className="w-full justify-start gap-2" onClick={() => {
          const grid = blocks.find((block) => block.kind === "social_grid");
          if (grid) onOpenBlockChange(grid.id);
          else onAddKind("social_grid");
        }}>
          <LayoutGrid className="h-4 w-4" /> {t("studio.grid.heading")}
        </Button>

        <ProfileLinksManager
          blocks={blocks}
          onBlocksChange={onBlocksChange}
          openBlock={openBlock}
          onOpenBlockChange={onOpenBlockChange}
          onOpenAddDrawer={onOpenAddDrawer}
        />
        <ProfileImportCard blocks={blocks} onBlocksChange={onBlocksChange} onImportMeta={onImportMeta} />
        <details className="space-y-3 border-t border-border pt-4">
          <summary className="cursor-pointer text-sm font-medium">{t("studio.content.cardSettings")}</summary>
          <div className="flex items-start justify-between gap-4 pt-3">
            <div className="min-w-0"><p className="text-sm font-medium">{t("studio.effects.title")}</p><p className="text-sm text-muted-foreground">{t("studio.effects.help")}</p></div>
            <Switch aria-label={t("studio.effects.title")} checked={cardEffects} onCheckedChange={onCardEffectsChange} />
          </div>
        </details>
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}
