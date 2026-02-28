import { MagicLinkForm } from "@/components/auth/MagicLinkForm";

export function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            L
          </div>
          <h2 className="mt-4 text-2xl font-bold text-gray-100">Sign in to LangChannelAgent</h2>
          <p className="mt-2 text-sm text-gray-400">
            Enter your email and we'll send you a magic link.
          </p>
        </div>
        <div className="mt-8">
          <MagicLinkForm />
        </div>
      </div>
    </div>
  );
}
