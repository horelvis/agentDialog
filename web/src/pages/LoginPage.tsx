import { useTranslation } from "react-i18next";
import { LoginForm } from "@/components/auth/LoginForm";
import { Logo } from "@/components/ui/Logo";

export function LoginPage() {
  // `common`, not `chat`: /login is reached before signing in, and `chat` is
  // the whole signed-in app's catalogue.
  const { t } = useTranslation("common");

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 p-1.5 text-white">
            <Logo className="h-full w-full" />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-gray-100">{t("auth.title")}</h2>
          <p className="mt-2 text-sm text-gray-400">{t("auth.subtitle")}</p>
        </div>
        <div className="mt-8">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
