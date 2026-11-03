import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowUpRight, Award, BadgeCheck, CheckCircle2, Gift, Globe, Inbox, KeyRound, Landmark, Plug, UserSearch, Users, Webhook, Wrench,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ControlHeader, ControlMetric, ControlTable, ControlError } from "@/components/admin/ControlCenterUI";
import { commandQuery } from "@/lib/admin-control.queries";
import { webhookHealth } from "@/lib/admin-control-rules";

const MODULES = [
  { to: "/admin/members", label: "Leden 360°", desc: "Zoeken, status, sessies, identiteiten", icon: UserSearch },
  { to: "/admin/verifications", label: "Verificaties", desc: "Aanvragen beoordelen en vinkjes toekennen", icon: BadgeCheck },
  { to: "/admin/team", label: "Team & rechten", desc: "Mede-admins en bevoegdheden", icon: Users },
  { to: "/admin/custom-badges", label: "Badges", desc: "Wapenschilden en claimlinks", icon: Award },
  { to: "/admin/integrations", label: "Schakelkast", desc: "Platformkoppelingen aan/uit", icon: Plug },
  { to: "/admin/oauth-apps", label: "OAuth-apps", desc: "Ontwikkelaarsapps goedkeuren", icon: KeyRound },
  { to: "/admin/finance", label: "Financieel", desc: "Donaties, IBAN-controle, SEPA", icon: Landmark },
  { to: "/admin/gift-cards", label: "Cadeaubonnen", desc: "Uitgifte en inwisseling", icon: Gift },
  { to: "/admin/subdomains", label: "Subdomeinen", desc: "Claims en tiers", icon: Globe },
  { to: "/admin/infra", label: "Infrastructuur", desc: "Logs en systeemgezondheid", icon: Webhook },
  { to: "/admin/ops", label: "Operations", desc: "Onderhoudstaken en sync", icon: Wrench },
  { to: "/admin/contact", label: "Contact-inbox", desc: "Berichten van bezoekers", icon: Inbox },
] as const;

export default function AdminCommandCenter() {
  const { data, refetch, isFetching, isRefetchError } = useSuspenseQuery(commandQuery);
  const actions = [
    { label: "Verificatie-aanvragen", count: data.verificationRequests, to: "/admin/verifications" },
    { label: "SEPA reviews", count: data.sepaReviews, to: "/admin/finance" },
    { label: "Mislukte webhooks", count: data.failedWebhooks, to: "/admin/infra" },
  ] as const;
  const open = actions.reduce((n, a) => n + a.count, 0);
  return (
    <AppLayout width="wide">
      <ControlHeader title="Mission Control" subtitle="Leden, identiteit en operationele aandachtspunten." refreshing={isFetching} refresh={() => void refetch()} />
      <ControlError error={isRefetchError} />
      <div className="mb-10 grid grid-cols-2 gap-6 lg:grid-cols-4">
        <ControlMetric label="Actieve leden" value={data.activeMembers} detail={`${data.totalMembers} profielen totaal`} />
        <ControlMetric label="Uitgedeelde badges" value={data.standardBadges + data.customBadges} detail={`${data.customBadges} wapenschilden · ${data.standardBadges} platformbadges`} />
        <ControlMetric label="Open verificaties" value={data.verificationRequests} />
        <ControlMetric label="Mislukte webhooks" value={data.failedWebhooks} />
      </div>

      <div className="mb-10 grid gap-8 lg:grid-cols-3">
        <section className="lg:col-span-1">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            {open ? <AlertTriangle className="h-5 w-5 text-warning" /> : <CheckCircle2 className="h-5 w-5 text-accent" />} Actie vereist
          </h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {actions.map((a) => (
              <li key={a.to}>
                <Link to={a.to} className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-secondary/50">
                  <span className="flex items-center gap-3">{a.count ? <AlertTriangle className="h-4 w-4 text-warning" /> : <CheckCircle2 className="h-4 w-4 text-accent" />}{a.label}</span>
                  <span className="flex items-center gap-3"><b className="tabular-nums">{a.count}</b><ArrowUpRight className="h-4 w-4" /></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold">Beheermodules</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {MODULES.map((m) => {
              const Icon = m.icon;
              return (
                <Link key={m.to} to={m.to} className="group rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground/40">
                  <Icon className="h-5 w-5 text-primary" aria-hidden />
                  <p className="mt-2 font-medium">{m.label}</p>
                  <p className="text-xs text-muted-foreground">{m.desc}</p>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Recente systeemevents</h2><Link to="/admin/infra" className="text-sm underline">Logboek</Link></div>
        <ControlTable headers={["Bron", "Event", "Status", "Ontvangen"]} empty={!data.events.length}>
          {data.events.map((e) => (
            <tr key={e.id}>
              <td className="px-3 py-3">{e.source}</td>
              <td className="px-3 py-3">{e.kind ?? "—"}</td>
              <td className={`px-3 py-3 ${webhookHealth(e.status) === "failed" ? "text-destructive" : "text-muted-foreground"}`}>{e.status}</td>
              <td className="whitespace-nowrap px-3 py-3 text-xs">{new Date(e.createdAt).toLocaleString("nl-BE")}</td>
            </tr>
          ))}
        </ControlTable>
      </section>
      <p className="mt-4 text-xs text-muted-foreground">Bijgewerkt {new Date(data.updatedAt).toLocaleString("nl-BE")}</p>
    </AppLayout>
  );
}
