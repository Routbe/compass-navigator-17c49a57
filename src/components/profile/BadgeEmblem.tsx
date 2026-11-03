import { Award, Handshake, Shield, Sparkles } from "lucide-react";

type Kind = "crest" | "emblem" | "award" | "partner";
const ICONS = { crest: Shield, emblem: Sparkles, award: Award, partner: Handshake } as const;

/** Heraldisch schildpad (viewBox 0 0 100 100) voor wapenschilden zonder eigen afbeelding. */
const SHIELD_PATH = "M50 4 L92 16 V48 C92 74 74 90 50 97 C26 90 8 74 8 48 V16 Z";

/** Eén weergave voor badges: eigen afbeelding, of een getekend schild/embleem in de accentkleur. */
export function BadgeEmblem({
  badge,
  size = 40,
}: {
  badge: { name: string; imageUrl: string | null; kind?: Kind; accentColor?: string | null };
  size?: number;
}) {
  const kind = badge.kind ?? "crest";
  if (badge.imageUrl) {
    return (
      <img
        src={badge.imageUrl}
        alt={badge.name}
        width={size}
        height={size}
        loading="lazy"
        className="object-contain"
        style={{ width: size, height: size, background: "transparent" }}
      />
    );
  }
  const color = badge.accentColor ?? "var(--primary)";
  if (kind === "crest") {
    const initial = badge.name.trim().charAt(0).toUpperCase() || "?";
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={badge.name}>
        <path d={SHIELD_PATH} fill={color} stroke="currentColor" strokeOpacity={0.25} strokeWidth={3} />
        <path d="M50 12 L84 22 V48 C84 69 70 82 50 88" fill="none" stroke="var(--background)" strokeOpacity={0.35} strokeWidth={3} />
        <text x="50" y="62" textAnchor="middle" fontSize="38" fontWeight={700} fill="var(--background)" fontFamily="serif">
          {initial}
        </text>
      </svg>
    );
  }
  const Icon = ICONS[kind];
  return (
    <span
      role="img"
      aria-label={badge.name}
      className="grid place-items-center rounded-full"
      style={{ width: size, height: size, background: color, color: "var(--background)" }}
    >
      <Icon className="h-1/2 w-1/2" aria-hidden />
    </span>
  );
}
