# E-mailtemplates

Alle transactionele mail loopt via Brevo (`src/emails/send.server.ts`).

- `*.html` — losse HTML-templates. De oudere kleine bestanden zijn placeholders;
  de volledig uitgewerkte ROUT-templates hieronder zijn de bron voor de
  bijbehorende Brevo-templates (upload ze daar met dezelfde `{{ params.X }}`-namen).
- Voor mails die volledig in Brevo zijn ontworpen: gebruik `templateId` + `params`
  in `sendMail()` in plaats van een bestand hier.

## Uitgewerkte templates

| Bestand | Categorie (`template-ids.ts`) | Taal | Params |
| --- | --- | --- | --- |
| `contact-confirmation.html` | `form` | en | `NAME`, `MESSAGE` |
| `login-code.html` | `login` | en | `CODE`, `MAGIC_LINK` |
| `payment-received.html` | `payment` | en | `NAME`, `AMOUNT`, `INVOICE_ID`, `METHOD` |
| `payment-confirmation.fr.html` | `payment_confirmation` | fr | `NAME`, `AMOUNT`, `INVOICE_ID`, `DATE` |
| `refund-credit-note.html` | `refund` | en | `NAME`, `AMOUNT`, `CREDIT_ID`, `REASON` |
| `refund-credit-note.de.html` | `refund` | de | `NAME`, `AMOUNT`, `CREDIT_ID`, `REASON` |
| `renewal-upcoming.html` | `renewal` | en | `NAME`, `PLAN`, `AMOUNT`, `DATE` |
| `cancellation-confirmed.html` | `cancellation` | en | `NAME`, `PLAN`, `END_DATE` |

Naamconventie: `<categorie-omschrijving>.<taal>.html`; zonder taalsuffix is de
template Engels. Talen volgen `EMAIL_LANGUAGES` in `template-ids.ts`.

Alle templates delen dezelfde opmaak: monospace huisstijl, lichte kaart op
`#f6f6f4`, het ROUT-bunnylogo via `https://rout.be/img/rout-bunny.png` en de
standaardfooter met links naar rout.be, Privacy, Terms en Manifesto.
