import { useTranslation } from "react-i18next";

export function EmptyState() {
  const { t } = useTranslation("chat");

  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-950">
        <svg className="h-8 w-8 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-gray-100">{t("empty.title")}</h3>
      <p className="mt-2 max-w-sm text-sm text-gray-400">{t("empty.body")}</p>
    </div>
  );
}
