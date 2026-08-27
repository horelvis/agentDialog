import { Trans, useTranslation } from "react-i18next";

/**
 * The questions an integrator actually asks, including the three whose honest
 * answer is "no", and the three about what stops the product being turned
 * against them. Inbound mail is not read, an MCP agent has to ask for the
 * answer, and the Python SDK is not published: saying so here is what makes the
 * other four believable.
 *
 * Only the ids are here now — every word is in the catalogue, under
 * landing:faq.items.<id>. An answer carries <code> around the literals it
 * names, and one of them a <link>; both are mapped to components below, so a
 * translator moves the markup with the words instead of around them.
 *
 * Built on <details>, not React state — it opens with a keyboard and reads
 * correctly to a screen reader without any of that being reimplemented.
 */
const FAQ = [
  "account",
  "inboundEmail",
  "delivery",
  "admission",
  "linkSafety",
  "integrations",
  "riskAuthority",
  "keyLeak",
  "webhookSignature",
] as const;

// `children` is optional because <Trans> is handed a bare <Code /> and fills it
// in from the catalogue string.
function Code({ children }: { children?: React.ReactNode }) {
  return (
    <code className="rounded bg-surface-tertiary px-1 py-0.5 font-mono text-[13px] text-brand-300">
      {children}
    </code>
  );
}

export function Faq() {
  const { t } = useTranslation("landing");

  return (
    <section className="py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-3xl font-bold tracking-tight text-gray-100 sm:text-4xl">
          {t("faq.heading")}
        </h2>

        <div className="mt-10 space-y-3">
          {FAQ.map((id) => (
            <details
              key={id}
              className="group rounded-xl border border-surface-border bg-surface-secondary open:bg-surface-tertiary"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-base font-medium text-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 [&::-webkit-details-marker]:hidden">
                {t(`faq.items.${id}.question`)}
                <svg
                  className="h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 group-open:rotate-180"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 6l4 4 4-4" />
                </svg>
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-gray-400">
                <Trans
                  t={t}
                  i18nKey={`faq.items.${id}.answer`}
                  components={{
                    code: <Code />,
                    link: (
                      <a
                        href="https://www.standardwebhooks.com"
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-400 underline underline-offset-2 hover:text-brand-300"
                      />
                    ),
                  }}
                />
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
