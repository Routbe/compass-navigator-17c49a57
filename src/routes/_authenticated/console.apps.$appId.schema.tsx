import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ConsoleCard, ConsolePage } from "@/components/console/ConsolePage";
import { CodeBlock } from "@/components/console/CodeBlock";
import { useAppPage } from "@/components/console/useAppPage";
import { buildPrismaSchema, buildSqlSchema } from "@/lib/oauth/integration-templates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/console/apps/$appId/schema")({
  head: () => ({ meta: [{ title: "Schema-templates — ROUT Developer Console" }, { name: "description", content: "SQL- en Prisma-schema’s voor veilige ROUT-identiteitskoppelingen." }, { property: "og:title", content: "Schema-templates — ROUT Developer Console" }, { property: "og:description", content: "SQL- en Prisma-schema’s voor veilige ROUT-identiteitskoppelingen." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: SchemaPage,
});

function SchemaPage() {
  const { appId } = Route.useParams();
  const { app } = useAppPage(appId);
  const [kind, setKind] = useState<"sql" | "prisma">("sql");
  const diagram = app.accountDiscoveryEnabled
    ? "ROUT id_token ──► sub ──► user_identities(provider='rout') ──► users\n                   └─ email_verified + email match ─► link bestaande user"
    : "ROUT id_token ──► sub ──► users.rout_id (uniek)";
  return (
    <ConsolePage title="Schema-templates" description="Kopieer hoe je tabellen eruitzien om ROUT-logins, Auto-Discovery en Rich Identity correct op te slaan.">
      <ConsoleCard title="Zo stroomt de data">
        <pre className="overflow-x-auto font-mono text-xs text-muted-foreground">{diagram}</pre>
        <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
          <li><b className="text-foreground">rout_id</b> — de stabiele ROUT-ID (sub). Zoek gebruikers hierop, niet op e-mail.</li>
          {app.richIdentityEnabled && <li><b className="text-foreground">Badges</b> — overschrijf ze bij elke login vanuit de claims; nooit vanuit formulieren.</li>}
          {app.scopes.includes("linked_accounts") && <li><b className="text-foreground">linked_accounts</b> — lijst van {"{ provider, account_id }"} (bv. google, apple, github). Vind je bij jou een gebruiker met dezelfde provider + account_id, dan is het dezelfde persoon: koppel ROUT daaraan. Meerdere treffers op verschillende accounts? Toon de gebruiker een samenvoeg-keuze in plaats van zelf te beslissen.</li>}
          {app.accountDiscoveryEnabled && <li><b className="text-foreground">Samenvoegen</b> — koppel enkel als email_verified waar is. Unieke sleutels verhinderen dubbele koppelingen.</li>}
        </ul>
      </ConsoleCard>
      <div className="flex gap-2">
        {(["sql", "prisma"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={cn("rounded-full border px-3 py-1 text-sm", kind === k ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>
            {k === "sql" ? "SQL (Postgres)" : "Prisma"}
          </button>
        ))}
      </div>
      <CodeBlock label={kind === "sql" ? "schema.sql" : "schema.prisma"} code={kind === "sql" ? buildSqlSchema(app) : buildPrismaSchema(app)} />
    </ConsolePage>
  );
}
