import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";

/** The numbers are the same in every language; the words are in the catalogue. */
const steps = [
  { step: "1", id: "ask" },
  { step: "2", id: "answer" },
  { step: "3", id: "receive" },
] as const;

export function HowItWorks() {
  const { t } = useTranslation("landing");

  return (
    <section id="how-it-works" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-100 sm:text-4xl">
            {t("how.heading")}
          </h2>
          <p className="mt-4 text-lg text-gray-400">{t("how.intro")}</p>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.step} className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-xl font-bold text-white">
                {s.step}
              </div>
              <h3 className="mt-6 text-lg font-semibold text-gray-100">
                {t(`how.steps.${s.id}.title`)}
              </h3>
              <p className="mt-2 text-sm text-gray-400">{t(`how.steps.${s.id}.description`)}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <a href="https://docs.agentdialog.io" target="_blank" rel="noopener noreferrer">
            <Button size="lg">{t("how.cta")}</Button>
          </a>
          <p className="mt-2 text-sm text-gray-500">{t("how.ctaNote")}</p>
        </div>
      </div>
    </section>
  );
}
