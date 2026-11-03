import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LockKeyhole, ShieldCheck, RefreshCw, Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { getLedgerKeys, listEncryptedLedger, saveLedgerKeys } from "@/lib/ledger/ledger.functions";
import { getDisclosureAudit } from "@/lib/security/audit-verifier.functions";
import type { LedgerKeys, PrivateEnvelope } from "@/lib/ledger/crypto";
import type { LedgerPublicKey } from "@/lib/ledger/ledger.functions";

type KeyRow = { key_id: string; encrypted_ledger_private_key: (PrivateEnvelope & { credentialId?: string })[]; retired_at: string | null };
type LogRow = { id: string; key_id: string; encrypted_payload: string; created_at: string };
export function EncryptedLedgerPanel() {
  const fetchKeys = useServerFn(getLedgerKeys), list = useServerFn(listEncryptedLedger), save = useServerFn(saveLedgerKeys), audit = useServerFn(getDisclosureAudit);
  const [keys, setKeys] = useState<KeyRow[]>([]), [pending, setPending] = useState<LedgerKeys | null>(null);
  const [prfCredential, setPrfCredential] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(""), [acknowledged, setAcknowledged] = useState(false), [usePrf, setUsePrf] = useState(false);
  const [rows, setRows] = useState<LogRow[]>([]), [decoded, setDecoded] = useState<Record<string, string>>({});
  const [clientKey, setClientKey] = useState<{ id: string; key: CryptoKey } | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState<Awaited<ReturnType<typeof getDisclosureAudit>> | null>(null);
  const active = keys.find((k) => !k.retired_at);
  async function refresh() {
    const [k, logs, verified] = await Promise.all([fetchKeys(), list({ data: {} }), audit()]);
    setKeys(k as unknown as KeyRow[]); setRows(logs as unknown as LogRow[]); setIntegrity(verified);
    return logs as unknown as LogRow[];
  }
  useEffect(() => { void refresh().catch(() => setError("Logboek niet beschikbaar. De nieuwe beveiligingsmigraties moeten actief zijn.")); }, []);
  async function run(task: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await task(); } catch (e) { setError(e instanceof Error ? e.message : "Logboek niet beschikbaar."); } finally { setBusy(false); }
  }
  async function prepare() {
    const { generateLedgerKeys } = await import("@/lib/ledger/crypto");
    let prf: Uint8Array | undefined;
    setPrfCredential(null);
    if (usePrf) {
      const result = await (await import("@/lib/ledger/prf")).ledgerPrf();
      if (!result) throw new Error("Deze passkey ondersteunt geen PRF. Kies herstelcode of een geschikte passkey.");
      prf = result.output; setPrfCredential(result.credentialId);
    }
    setPending(await generateLedgerKeys(prf)); setAcknowledged(false);
  }
  async function activate() {
    if (!pending || !acknowledged) return;
    const envelopes = pending.envelopes.map((e) => e.source === "prf" ? { ...e, credentialId: prfCredential ?? undefined } : e);
    await save({ data: { publicKey: pending.publicKey as LedgerPublicKey, envelopes, expectedKeyId: active?.key_id ?? null } });
    setClientKey({ id: pending.keyId, key: pending.privateKey }); setPending(null); setRecovery(""); setDecoded({}); await refresh();
  }
  async function unlock(prf: boolean) {
    const envelopeKey = keys.find((k) => prf ? k.key_id === active?.key_id : k.key_id === (selectedKeyId || active?.key_id));
    if (!envelopeKey) throw new Error("Geen sleutel beschikbaar.");
    const envelopes = envelopeKey.encrypted_ledger_private_key;
    const envelope = envelopes.find((e) => e.source === (prf ? "prf" : "recovery"));
    if (!envelope) throw new Error("Geen geschikte sleutelenvelop.");
    const { unlockLedgerKey, decryptLedgerEvent } = await import("@/lib/ledger/crypto");
    let material: string | Uint8Array = recovery.trim();
    if (prf) {
      const result = await (await import("@/lib/ledger/prf")).ledgerPrf(envelope.credentialId);
      if (!result) throw new Error("Passkey PRF niet beschikbaar."); material = result.output;
    }
    const key = await unlockLedgerKey(envelope, envelopeKey.key_id, material);
    setClientKey({ id: envelopeKey.key_id, key }); setRecovery("");
    const output: Record<string, string> = {};
    for (const row of rows.filter((r) => r.key_id === envelopeKey.key_id)) output[row.id] = JSON.stringify(await decryptLedgerEvent(key, row.encrypted_payload));
    setDecoded(output);
  }
  async function loadMore() {
    const last = rows.at(-1); if (!last) return;
    const extra = await list({ data: { cursor: { id: last.id, createdAt: last.created_at } } }) as unknown as LogRow[];
    setRows((current) => [...current, ...extra]);
    if (clientKey) {
      const { decryptLedgerEvent } = await import("@/lib/ledger/crypto");
      const output = { ...decoded };
      for (const row of extra.filter((r) => r.key_id === clientKey.id)) output[row.id] = JSON.stringify(await decryptLedgerEvent(clientKey.key, row.encrypted_payload));
      setDecoded(output);
    }
  }
  return <section className="space-y-5 border-t border-border py-5">
    <h2 className="flex items-center gap-2 text-lg font-medium"><LockKeyhole aria-hidden="true" className="size-5" />Inlog- &amp; Activiteitsgeschiedenis</h2>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!pending && <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={usePrf} onCheckedChange={(v) => setUsePrf(v === true)} />Passkey PRF toevoegen</label>
      <Button variant="outline" disabled={busy} onClick={() => void run(prepare)}><RefreshCw aria-hidden="true" className="size-4" />{active ? "Nieuwe logboeksleutel" : "Versleuteld logboek activeren"}</Button>
    </div>}
    {pending && <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Bewaar deze herstelcode. Sleutelverlies raakt alleen je historische logboek, nooit je account, profielen of domeinen.</p>
      <code className="block break-all rounded-md border border-border bg-muted p-3 text-sm">{pending.recoveryCode}</code>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={acknowledged} onCheckedChange={(v) => setAcknowledged(v === true)} />Ik heb de herstelcode veilig opgeslagen.</label>
      <div className="flex gap-2"><Button disabled={busy || !acknowledged} onClick={() => void run(activate)}>Sleutel activeren</Button><Button variant="ghost" onClick={() => setPending(null)}>Annuleren</Button></div>
    </div>}
    {keys.length > 0 && <div className="flex flex-wrap gap-2">
      <select aria-label="Logboeksleutel" value={selectedKeyId || active?.key_id || ""} onChange={(e) => setSelectedKeyId(e.target.value)} className="rounded-md border border-border bg-background px-3 text-sm">
        {keys.map((k, index) => <option key={k.key_id} value={k.key_id}>{k.retired_at ? `Historische sleutel ${index + 1}` : "Actieve sleutel"}</option>)}
      </select>
      <Input aria-label="Logboekherstelcode" type="password" autoComplete="off" value={recovery} onChange={(e) => setRecovery(e.target.value)} placeholder="ROUT-RCVR-…" className="max-w-md" />
      <Button disabled={busy || !recovery} onClick={() => void run(() => unlock(false))}>Lokaal ontsleutelen</Button>
      {active?.encrypted_ledger_private_key.some((e) => e.source === "prf") && <Button variant="outline" disabled={busy} onClick={() => void run(() => unlock(true))}><Fingerprint aria-hidden="true" className="size-4" />Passkey</Button>}
      {clientKey && <Button variant="ghost" onClick={() => { setClientKey(null); setDecoded({}); }}>Vergrendelen</Button>}
    </div>}
    <ul className="divide-y divide-border">{rows.map((row) => <li key={row.id} className="py-3"><time className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString("nl-BE")}</time><p className="break-all text-sm">{decoded[row.id] ?? "Versleutelde activiteit · vergrendeld"}</p></li>)}</ul>
    {!rows.length && <p className="text-sm text-muted-foreground">Nog geen versleutelde activiteiten.</p>}
    {rows.length >= 50 && <Button variant="outline" disabled={busy} onClick={() => void run(loadMore)}>Meer activiteiten</Button>}
    <h3 className="text-lg font-medium">Auditlog</h3>
    <p role="status" className="flex items-center gap-2 text-sm">{integrity?.verified ? <><ShieldCheck aria-hidden="true" className="size-5 text-primary" />Cryptografisch geverifieerd</> : "Geen volledige cryptografische verificatie beschikbaar"}</p>
    {integrity?.merkleRoot && <code className="block break-all text-xs text-muted-foreground">Merkle root: {integrity.merkleRoot}</code>}
    <ul className="divide-y divide-border">{integrity?.rows.map((row) => <li key={row.id} className="py-2 text-sm">{row.clientId} · {row.scopes.join(", ")}<time className="block text-xs text-muted-foreground">{new Date(row.timestamp).toLocaleString("nl-BE")}</time></li>)}</ul>
  </section>;
}