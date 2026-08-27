import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/Button";

export function NotFoundPage() {
  const { t } = useTranslation("landing");

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-6xl font-bold text-gray-100">404</h1>
      <p className="mt-4 text-lg text-gray-400">{t("notFound.message")}</p>
      <div className="mt-8">
        <Link to="/">
          <Button>{t("notFound.home")}</Button>
        </Link>
      </div>
    </div>
  );
}
