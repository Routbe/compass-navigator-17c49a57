/**
 * Machine-readable zone for the back of the ROUT Card, in the ICAO 9303 TD1
 * layout (3 lines x 30 characters) with 7-3-1 check digits. Public data only:
 * the card number and handle — never a name, birth date or account id.
 */
const LINE = 30;

function mrzChars(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "<");
}

function pad(s: string, n: number): string {
  return (s + "<".repeat(n)).slice(0, n);
}

export function mrzCheckDigit(field: string): number {
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < field.length; i++) {
    const c = field[i]!;
    const v = c === "<" ? 0 : /[0-9]/.test(c) ? Number(c) : c.charCodeAt(0) - 55;
    sum += v * w[i % 3]!;
  }
  return sum % 10;
}

export function cardMrz(p: { sovereignId: string; handle: string; space: "root" | "alias" }): [string, string, string] {
  const doc = pad(mrzChars(p.sovereignId).replace(/</g, ""), 9);
  const l1 = pad(`I<RTB${doc}${mrzCheckDigit(doc)}`, LINE);
  const kind = p.space === "alias" ? "ALIAS" : "ROOT";
  const l2body = pad(`${kind}<<SOVEREIGN<PROFILE`, LINE - 1);
  const l2 = l2body + mrzCheckDigit(l1.slice(5, 30) + l2body);
  const l3 = pad(`ROUT<<${mrzChars(p.handle)}`, LINE);
  return [l1, l2, l3];
}
