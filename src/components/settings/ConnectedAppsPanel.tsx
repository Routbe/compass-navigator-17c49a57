import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AppWindow, Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { withStepUp } from "@/components/auth/StepUpDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  bulkUpdateAppEmails,
  listAppEmails,
  listConnectedApps,
  revokeConnectedApp,
  setAppEmail,
} from "@/lib/oauth/connected-apps.functions";
import { i18n as trI18n } from "@/lib/i18n";

const SOURCE_LABEL = { primary: "Primair", alias: "Contact-alias", relay: "Privé-relay" } as const;

/** "Gekoppelde Apps & E-mail Beheer": apps via "Login met ROUT", per-app email and revoke. */
export function ConnectedAppsPanel({ autoWizard = true }: { autoWizard?: boolean } = {}) {
  const list = useServerFn(listConnectedApps);
  const emails = useServerFn(listAppEmails);
  const revoke = useServerFn(revokeConnectedApp);
  const setEmail = useServerFn(setAppEmail);
  const bulk = useServerFn(bulkUpdateAppEmails);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [wizard, setWizard] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const { data, isLoading } = useQuery({ queryKey: ["connected-apps"], queryFn: () => list() });
  const mail = useQuery({ queryKey: ["connected-app-emails"], queryFn: () => emails() });
  const stale = mail.data?.stale ?? [];

  // Primary address changed since these apps got theirs: open the wizard once.
  useEffect(() => {
    if (autoWizard && stale.length) {
      setPicked(stale);
      setWizard(true);
    }
  }, [stale.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ["connected-apps"] }),
    qc.invalidateQueries({ queryKey: ["connected-app-emails"] }),
  ]);

  async function onRevoke(clientId: string, name: string) {
    setBusy(clientId);
    try {
      await withStepUp(() => revoke({ data: { clientId } }));
      toast.success(`Toegang voor ${name} is ingetrokken.`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Intrekken mislukt.");
    } finally {
      setBusy(null);
    }
  }

  async function onChoose(clientId: string, choiceId: string) {
    setBusy(clientId);
    try {
      await withStepUp(() => setEmail({ data: { clientId, choiceId } }));
      toast.success(trI18n.t("ui.88b8cf2e50"));
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt.");
    } finally {
      setBusy(null);
    }
  }

  async function onBulk() {
    setBusy("bulk");
    try {
      const r = await withStepUp(() => bulk({ data: { clientIds: picked } }));
      toast.success(`${r.updated} app(s) bijgewerkt naar ${mail.data?.primary ?? "je nieuwe adres"}.`);
      setWizard(false);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bijwerken mislukt.");
    } finally {
      setBusy(null);
    }
  }

  const apps = data ?? [];
  const allPicked = apps.length > 0 && apps.every((a) => picked.includes(a.clientId));

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <AppWindow className="h-4 w-4" /> Gekoppelde Apps &amp; E-mail Beheer
        </h2>
        {apps.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => { setPicked(apps.map((a) => a.clientId)); setWizard(true); }}>
            <MailCheck className="h-4 w-4" /> Primair adres overal bijwerken
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Apps waarbij je inlogde met ROUT. Kies per app welk e-mailadres ze zien. Intrekken logt de app direct uit.
      </p>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : !apps.length ? (
        <p className="text-sm text-muted-foreground">Nog geen verbonden apps.</p>
      ) : (
        <ul className="divide-y divide-border">
          {apps.map((app) => {
            const em = mail.data?.apps.find((a) => a.clientId === app.clientId);
            return (
              <li key={app.clientId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{app.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Sinds {new Date(app.grantedAt).toLocaleDateString("nl-BE")}
                    {em?.assignedEmail ? ` · ${em.assignedEmail}` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {app.scopes.map((s) => (
                      <Badge key={s} variant="outline" className="text-xs font-normal">{s}</Badge>
                    ))}
                  </div>
                  {em && em.options.length > 1 && (
                    <div className="mt-2 max-w-xs">
                      <Select value={em.choiceId} onValueChange={(v) => void onChoose(app.clientId, v)} disabled={busy === app.clientId}>
                        <SelectTrigger className="h-9 text-xs" aria-label={`E-mailadres voor ${app.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {em.options.map((o) => (
                            <SelectItem key={o.id} value={o.id} className="text-xs">
                              {SOURCE_LABEL[o.source]} · {o.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <Button variant="outline" size="sm" disabled={busy === app.clientId}
                  onClick={() => void onRevoke(app.clientId, app.name)}>
                  {busy === app.clientId ? <Loader2 className="h-4 w-4 animate-spin" /> : "Toegang intrekken"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={wizard} onOpenChange={setWizard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>E-mailadres bijwerken bij je apps</DialogTitle>
            <DialogDescription>
              Kies welke apps voortaan {mail.data?.primary ?? "je primaire adres"} krijgen. Apps met een privé-relay houden hun relay.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-3 text-sm font-medium">
            <Checkbox checked={allPicked} onCheckedChange={(v) => setPicked(v ? apps.map((a) => a.clientId) : [])} />
            Selecteer alles
          </label>
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {apps.map((a) => (
              <li key={a.clientId}>
                <label className="flex items-center gap-3 text-sm">
                  <Checkbox
                    checked={picked.includes(a.clientId)}
                    onCheckedChange={(v) => setPicked((p) => (v ? [...p, a.clientId] : p.filter((x) => x !== a.clientId)))}
                  />
                  <span className="truncate">{a.name}</span>
                  {stale.includes(a.clientId) && <Badge variant="secondary" className="text-xs">oud adres</Badge>}
                </label>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWizard(false)}>Later</Button>
            <Button onClick={() => void onBulk()} disabled={!picked.length || busy === "bulk"}>
              {busy === "bulk" ? <Loader2 className="h-4 w-4 animate-spin" /> : `Bijwerken (${picked.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
