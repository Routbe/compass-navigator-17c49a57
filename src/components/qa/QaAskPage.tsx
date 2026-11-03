import { Link } from "@tanstack/react-router";
import { ArrowLeft, MessageCircleQuestion } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { profileImageSrc } from "@/lib/image-proxy-rules";
import { promptHeadline, storedPromptLabel } from "@/lib/qa/prompts";
import { RoutLogo } from "@/components/RoutLogo";
import { QaAskForm } from "./QaAskForm";
import { QaStoryRing } from "./QaStoryRing";
import { qaPaths, useQaPublic, type QaSpace } from "./useQaPublic";
import type { QaPublic } from "@/lib/qa/types";
import { QA_PAGE_SURFACE, qaDesign } from "@/lib/qa/design";

/** Full-screen, distraction-free anonymous message page (/u/<handle>/ask, /<handle>/ask). */
export function QaAskPage({ handle, space, initial }: { handle: string; space: QaSpace; initial: QaPublic | null }) {
  const { t } = useI18n();
  const live = useQaPublic(handle, space);
  const qa = live.data ?? initial;
  const paths = qaPaths(handle, space);

  if (!qa) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-background px-6 text-center" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <MessageCircleQuestion className="h-8 w-8 text-muted-foreground" aria-hidden />
        <h1 className="font-display text-2xl">{t("pages.qa.ask.missingTitle")}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t("pages.qa.ask.missingBody")}</p>
        <Link to="/" className="mt-2 text-sm underline underline-offset-4">rout.be</Link>
      </main>
    );
  }

  const name = qa.displayName || `@${handle}`;
  const avatar = profileImageSrc(qa.avatarUrl);
  const headline = promptHeadline(qa.promptKey, qa.promptCustom, t);
  let design: unknown = {};
  try { design = qa.designJson ? JSON.parse(qa.designJson) : {}; } catch { /* use default design */ }
  const surface = QA_PAGE_SURFACE;

  return (
    <main
      className="dark relative min-h-[100dvh] overflow-x-hidden bg-gradient-to-b from-story-from to-story-to text-foreground"
      style={{ paddingTop: "max(env(safe-area-inset-top), 1rem)", paddingBottom: "max(env(safe-area-inset-bottom), 1.5rem)" }}
    >
      <div className="mx-auto flex w-full max-w-md flex-col px-5">
        <header className="flex items-center justify-between py-2">
          {qa.showProfileLink && <a href={paths.profile} className="inline-flex min-h-10 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden /> {t("pages.qa.ask.back")}
          </a>}
          <RoutLogo size={22} showWordmark={false} />
        </header>

        <div className="mt-6 flex flex-col items-center text-center">
          {qa.showAvatar && <QaStoryRing handle={handle} space={space} displayName={qa.displayName} avatarUrl={qa.avatarUrl}>
            {avatar ? (
              <img src={avatar} alt={name} className="h-24 w-24 rounded-full object-cover" />
            ) : (
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-card text-3xl font-semibold">{name.replace(/^@/, "").slice(0, 1).toUpperCase()}</span>
            )}
          </QaStoryRing>}
          <h1 className="mt-3 text-lg font-semibold">{name}</h1>
          <p className="text-xs text-muted-foreground">@{handle}</p>
        </div>

        <section className="mt-6">
          {qa.accepting ? (
            <QaAskForm handle={handle} space={space} headline={headline} designStyle={qaDesign(design, "questions", surface)} />
          ) : (
            <p role="status" className="rounded-3xl border border-border bg-card p-5 text-sm text-muted-foreground">{t("pages.qa.ask.closed")}</p>
          )}
        </section>

        <a href="/claim" className="mx-auto mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-border px-5 text-sm font-semibold hover:bg-card">
          {t("pages.qa.ask.getYours")}
        </a>

        <section className="mt-10" aria-labelledby="qa-answers">
          <h2 id="qa-answers" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("pages.qa.ask.answersTitle")}</h2>
          {qa.answers.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("pages.qa.ask.noAnswers")}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {qa.answers.map((a) => (
                <li key={a.id} className="overflow-hidden rounded-2xl border border-border bg-card" style={qaDesign(design, "answers", surface)}>
                  <div className="bg-gradient-to-br from-story-ring/25 to-story-ring-2/10 px-4 py-3">
                    {a.prompt && <p className="text-[11px] text-muted-foreground">{storedPromptLabel(a.prompt, t)}</p>}
                    <p className="break-words font-medium">{a.body}</p>
                  </div>
                  <p className="whitespace-pre-line break-words px-4 py-3 text-sm text-muted-foreground">{a.answer}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
