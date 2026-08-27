import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";

/** Only the ids live here. The markdown this section points at is generated,
 *  and is not translated with it. */
const highlights = ["quickstart", "queries", "messages", "email", "realtime"] as const;

function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

export function IntegrationGuide() {
  const { t } = useTranslation("landing");

  return (
    <section id="guide" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-4xl items-center gap-12 lg:grid-cols-2">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-600/10 px-3 py-1 text-sm font-medium text-brand-400">
              <FileTextIcon className="h-4 w-4" />
              {t("guide.badge")}
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-gray-100 sm:text-4xl">
              {t("guide.heading")}
            </h2>
            <p className="mt-4 text-lg text-gray-400">{t("guide.intro")}</p>
            <div className="mt-8 flex items-center gap-4">
              <a href="https://docs.agentdialog.io" target="_blank" rel="noopener noreferrer">
                <Button size="lg">{t("guide.docsLink")}</Button>
              </a>
              <a href="/agentdialog-integration-guide.md" download className="text-sm text-gray-400 underline underline-offset-2 hover:text-gray-200">
                {t("guide.download")}
              </a>
            </div>
          </div>

          <ul className="space-y-4">
            {highlights.map((id) => (
              <li key={id} className="flex items-start gap-3">
                <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
                <span className="text-gray-300">{t(`guide.highlights.${id}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
