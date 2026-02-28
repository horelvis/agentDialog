import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useAuthStore } from "@/stores/authStore";
import { Spinner } from "@/components/ui/Spinner";

export function VerifyToken() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const verifyToken = useAuthStore((s) => s.verifyToken);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setError("Invalid verification link.");
      return;
    }

    verifyToken(token)
      .then(() => navigate("/app", { replace: true }))
      .catch(() => setError("Verification failed. The link may have expired."));
  }, [searchParams, verifyToken, navigate]);

  if (error) {
    return (
      <div className="text-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <Spinner size="lg" />
      <p className="text-gray-400">Verifying your login...</p>
    </div>
  );
}
