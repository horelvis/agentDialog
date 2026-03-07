import { LoginForm } from "@/components/auth/LoginForm";

export function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            A
          </div>
          <h2 className="mt-4 text-2xl font-bold text-gray-100">Sign in to AgentDialog</h2>
          <p className="mt-2 text-sm text-gray-400">
            Enter your email and we'll send you a verification code.
          </p>
        </div>
        <div className="mt-8">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
