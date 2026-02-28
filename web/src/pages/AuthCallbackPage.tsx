import { VerifyToken } from "@/components/auth/VerifyToken";

export function AuthCallbackPage() {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
      <VerifyToken />
    </div>
  );
}
