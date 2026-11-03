import { StudioSectionIcon } from "@/components/studio/StudioSectionIcon";
import { useMemo, useState } from "react";
import { STICKER_CATEGORIES } from "@/lib/sticker-library";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Plus, Trash2 } from "lucide-react";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LAYER_PRESETS,
  MAX_BACKGROUNDS,
  MAX_DECORATIONS,
  SECTION_LABEL,
  applyPreset,
  isEmptyLayers,
  normalizeDesignLayers,
  serializeDesignLayers,
  type BackgroundLayer,
  type BlockShadow,
  type BlockStyle,
  type Decoration,
  type DesignLayers,
} from "@/lib/design-layers";
import type { ProfileBlock } from "@/lib/profile";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (next: string) => void;
  blocks: ProfileBlock[];
};

const uid = () => Math.random().toString(36).slice(2, 10);

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent" />
      {label}
    </label>
  );
}

function Range({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={1} onValueChange={(v) => onChange(v[0] ?? value)} />
    </div>
  );
}

function RowTools({ visible, onToggle, onUp, onDown, onDelete }: { visible: boolean; onToggle: () => void; onUp: () => void; onDown: () => void; onDelete?: () => void }) {
  return (
    <div className="flex items-center gap-0.5">
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onToggle} aria-label={visible ? "Verbergen" : "Tonen"}>
        {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onUp} aria-label="Omhoog">
        <ArrowUp className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onDown} aria-label="Omlaag">
        <ArrowDown className="h-3.5 w-3.5" />
      </Button>
      {onDelete && (
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete} aria-label="Verwijderen">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

/** Layered Design Studio: presets, layer manager, backgrounds, per-block styles and decorations. */
export function LayerStudioAccordion({ value, onChange, blocks }: Props) {
  const layers = useMemo(() => normalizeDesignLayers(value || "{}"), [value]);
  const set = (next: DesignLayers) => {
    const n = normalizeDesignLayers(next);
    onChange(isEmptyLayers(n) ? "" : serializeDesignLayers(n));
  };
  const [openBg, setOpenBg] = useState<string | null>(null);
  const [openDec, setOpenDec] = useState<string | null>(null);
  const [blockId, setBlockId] = useState<string>("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const styleable = blocks.filter((b) => b.kind !== "spacer" && b.kind !== "text");
  const blockStyle: BlockStyle = layers.blockStyles[blockId] ?? { bg: null, text: null, radius: null, shadow: "none" };
  const setBlockStyle = (patch: Partial<BlockStyle>) =>
    set({ ...layers, blockStyles: { ...layers.blockStyles, [blockId]: { ...blockStyle, ...patch } } });

  const setBg = (i: number, patch: Partial<BackgroundLayer>) =>
    set({ ...layers, backgrounds: layers.backgrounds.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const setDec = (i: number, patch: Partial<Decoration>) =>
    set({ ...layers, decorations: layers.decorations.map((d, j) => (j === i ? { ...d, ...patch } : d)) });

  return (
    <AccordionItem value="layers" className="rounded-2xl border border-border bg-card px-4">
      <AccordionTrigger className="text-sm font-medium">
        <span className="flex items-center gap-2"><StudioSectionIcon kind="layers" /> Lagen-studio</span>
      </AccordionTrigger>
      <AccordionContent className="space-y-6 pb-5">
        {/* Presets */}
        <section className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Presets</p>
          <div className="flex flex-wrap gap-2">
            {LAYER_PRESETS.map((p) => (
              <Button key={p.id} type="button" size="sm" variant="outline" onClick={() => set(applyPreset(layers, p.id))}>
                {p.label}
              </Button>
            ))}
          </div>
        </section>

        {/* Layer manager */}
        <section className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Volgorde & zichtbaarheid</p>
          <ul className="space-y-1">
            {layers.sections.map((s, i) => (
              <li
                key={s.id}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIdx !== null) set({ ...layers, sections: move(layers.sections, dragIdx, i) });
                  setDragIdx(null);
                }}
                className={cn("flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-sm", !s.visible && "opacity-60")}
              >
                <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" aria-hidden />
                <span className="flex-1">{SECTION_LABEL[s.id]}</span>
                <RowTools
                  visible={s.visible}
                  onToggle={() => set({ ...layers, sections: layers.sections.map((x, j) => (j === i ? { ...x, visible: !x.visible } : x)) })}
                  onUp={() => set({ ...layers, sections: move(layers.sections, i, i - 1) })}
                  onDown={() => set({ ...layers, sections: move(layers.sections, i, i + 1) })}
                />
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Sleep of gebruik de pijlen. Effecten en decoraties gaan enkel aan of uit.</p>
        </section>

        {/* Backgrounds */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Achtergrondlagen</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={layers.backgrounds.length >= MAX_BACKGROUNDS}
              onClick={() => {
                const id = uid();
                setOpenBg(id);
                set({ ...layers, backgrounds: [...layers.backgrounds, { id, kind: "gradient", visible: true, opacity: 100, color: "#f5efe6", color2: "#c084fc", angle: 135, pattern: "dots", imageUrl: "", blur: 0 }] });
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Laag
            </Button>
          </div>
          {layers.backgrounds.length === 0 && <p className="text-xs text-muted-foreground">Geen lagen — het thema bepaalt de achtergrond.</p>}
          {layers.backgrounds.map((b, i) => (
            <div key={b.id} className="rounded-lg border border-border bg-background p-2">
              <div className="flex items-center gap-2">
                <button type="button" className="flex-1 text-left text-sm" onClick={() => setOpenBg(openBg === b.id ? null : b.id)}>
                  {i + 1}. {{ color: "Kleur", gradient: "Verloop", pattern: "Patroon", photo: "Foto" }[b.kind]}
                </button>
                <RowTools
                  visible={b.visible}
                  onToggle={() => setBg(i, { visible: !b.visible })}
                  onUp={() => set({ ...layers, backgrounds: move(layers.backgrounds, i, i - 1) })}
                  onDown={() => set({ ...layers, backgrounds: move(layers.backgrounds, i, i + 1) })}
                  onDelete={() => set({ ...layers, backgrounds: layers.backgrounds.filter((_, j) => j !== i) })}
                />
              </div>
              {openBg === b.id && (
                <div className="mt-3 space-y-3">
                  <Select value={b.kind} onValueChange={(v) => setBg(i, { kind: v as BackgroundLayer["kind"] })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="color">Kleur</SelectItem>
                      <SelectItem value="gradient">Verloop</SelectItem>
                      <SelectItem value="pattern">Patroon</SelectItem>
                      <SelectItem value="photo">Foto</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-3">
                    {(b.kind === "color" || b.kind === "gradient") && <ColorField label="Kleur" value={b.color} onChange={(v) => setBg(i, { color: v })} />}
                    {(b.kind === "gradient" || b.kind === "pattern") && <ColorField label={b.kind === "pattern" ? "Inkt" : "Tweede kleur"} value={b.color2} onChange={(v) => setBg(i, { color2: v })} />}
                  </div>
                  {b.kind === "gradient" && <Range label="Hoek" value={b.angle} min={0} max={360} onChange={(v) => setBg(i, { angle: v })} />}
                  {b.kind === "pattern" && (
                    <Select value={b.pattern} onValueChange={(v) => setBg(i, { pattern: v as BackgroundLayer["pattern"] })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dots">Stippen</SelectItem>
                        <SelectItem value="grid">Raster</SelectItem>
                        <SelectItem value="diagonal">Diagonaal</SelectItem>
                        <SelectItem value="waves">Golven</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {b.kind === "photo" && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">Foto-adres (https)</Label>
                        <Input className="h-8 text-xs" placeholder="https://…/foto.jpg" value={b.imageUrl} onChange={(e) => setBg(i, { imageUrl: e.target.value })} />
                      </div>
                      <Range label="Vervaging" value={b.blur} min={0} max={20} onChange={(v) => setBg(i, { blur: v })} />
                    </>
                  )}
                  <Range label="Dekking" value={b.opacity} min={0} max={100} onChange={(v) => setBg(i, { opacity: v })} />
                </div>
              )}
            </div>
          ))}
          {layers.backgrounds.length > 1 && <p className="text-xs text-muted-foreground">Laag 1 ligt onderaan, de laatste bovenaan.</p>}
        </section>

        {/* Per-block styling */}
        <section className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stijl per blok</p>
          {styleable.length === 0 ? (
            <p className="text-xs text-muted-foreground">Voeg eerst links toe.</p>
          ) : (
            <>
              <Select value={blockId} onValueChange={setBlockId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Kies een blok" /></SelectTrigger>
                <SelectContent>
                  {styleable.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.label || b.value || b.kind}
                      {layers.blockStyles[b.id] ? " •" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {blockId && (
                <div className="space-y-3 rounded-lg border border-border bg-background p-3">
                  <div className="flex flex-wrap gap-3">
                    <ColorField label="Vlak" value={blockStyle.bg ?? "#ffffff"} onChange={(v) => setBlockStyle({ bg: v })} />
                    <ColorField label="Tekst" value={blockStyle.text ?? "#111111"} onChange={(v) => setBlockStyle({ text: v })} />
                  </div>
                  <Range label="Afronding" value={blockStyle.radius ?? 12} min={0} max={32} onChange={(v) => setBlockStyle({ radius: v })} />
                  <Select value={blockStyle.shadow} onValueChange={(v) => setBlockStyle({ shadow: v as BlockShadow })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Geen schaduw</SelectItem>
                      <SelectItem value="soft">Zacht</SelectItem>
                      <SelectItem value="hard">Hard (retro)</SelectItem>
                      <SelectItem value="glow">Gloed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const rest = { ...layers.blockStyles };
                      delete rest[blockId];
                      set({ ...layers, blockStyles: rest });
                    }}
                  >
                    Terug naar themastijl
                  </Button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Decorations */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Decoraties</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={layers.decorations.length >= MAX_DECORATIONS}
              onClick={() => {
                const id = uid();
                setOpenDec(id);
                set({ ...layers, decorations: [...layers.decorations, { id, kind: "emoji", visible: true, emoji: "✨", color: "#f59e0b", x: 50, y: 10, size: 40, rotation: 0, opacity: 100 }] });
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Decoratie
            </Button>
          </div>
          {layers.decorations.map((d, i) => (
            <div key={d.id} className="rounded-lg border border-border bg-background p-2">
              <div className="flex items-center gap-2">
                <button type="button" className="flex-1 text-left text-sm" onClick={() => setOpenDec(openDec === d.id ? null : d.id)}>
                  {d.kind === "emoji" ? d.emoji : { circle: "Cirkel", square: "Vierkant", star: "Ster", blob: "Vlek" }[d.kind]}
                </button>
                <RowTools
                  visible={d.visible}
                  onToggle={() => setDec(i, { visible: !d.visible })}
                  onUp={() => set({ ...layers, decorations: move(layers.decorations, i, i - 1) })}
                  onDown={() => set({ ...layers, decorations: move(layers.decorations, i, i + 1) })}
                  onDelete={() => set({ ...layers, decorations: layers.decorations.filter((_, j) => j !== i) })}
                />
              </div>
              {openDec === d.id && (
                <div className="mt-3 space-y-3">
                  <div className="flex gap-2">
                    <Select value={d.kind} onValueChange={(v) => setDec(i, { kind: v as Decoration["kind"] })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="emoji">Sticker (emoji)</SelectItem>
                        <SelectItem value="circle">Cirkel</SelectItem>
                        <SelectItem value="square">Vierkant</SelectItem>
                        <SelectItem value="star">Ster</SelectItem>
                        <SelectItem value="blob">Vlek</SelectItem>
                      </SelectContent>
                    </Select>
                    {d.kind === "emoji" ? (
                      <Input className="h-8 w-20 text-center" maxLength={8} value={d.emoji} onChange={(e) => setDec(i, { emoji: e.target.value })} aria-label="Emoji" />
                    ) : (
                      <ColorField label="Kleur" value={d.color} onChange={(v) => setDec(i, { color: v })} />
                    )}
                  </div>
                  <div>
                    {d.kind === "emoji" ? <StickerPicker onPick={(emoji) => setDec(i, { emoji })} /> : null}
                  </div>
                  <Range label="Horizontaal (%)" value={d.x} min={0} max={100} onChange={(v) => setDec(i, { x: v })} />
                  <Range label="Verticaal (%)" value={d.y} min={0} max={100} onChange={(v) => setDec(i, { y: v })} />
                  <Range label="Grootte" value={d.size} min={12} max={200} onChange={(v) => setDec(i, { size: v })} />
                  <Range label="Draaiing" value={d.rotation} min={-180} max={180} onChange={(v) => setDec(i, { rotation: v })} />
                  <Range label="Dekking" value={d.opacity} min={0} max={100} onChange={(v) => setDec(i, { opacity: v })} />
                </div>
              )}
            </div>
          ))}
        </section>

        {value && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>
            Alle lagen wissen
          </Button>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function StickerPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [cat, setCat] = useState(STICKER_CATEGORIES[0]!.id);
  const current = STICKER_CATEGORIES.find((c) => c.id === cat) ?? STICKER_CATEGORIES[0]!;
  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <div className="flex flex-wrap gap-1">
        {STICKER_CATEGORIES.map((c) => (
          <Button key={c.id} type="button" size="sm" variant={c.id === cat ? "default" : "ghost"} className="h-7 px-2 text-xs" onClick={() => setCat(c.id)}>
            {c.label}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-1">
        {current.stickers.map((s) => (
          <button key={s} type="button" className="rounded p-1 text-lg hover:bg-muted" onClick={() => onPick(s)} aria-label={`Sticker ${s}`}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
