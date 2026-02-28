import { Link } from "react-router";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/Button";

export function Navbar() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <nav className="border-b border-surface-border bg-surface-secondary">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            L
          </div>
          <span className="text-lg font-bold text-gray-100">LangChannelAgent</span>
        </Link>

        <div className="flex items-center gap-4">
          {isAuthenticated ? (
            <Link to="/app">
              <Button variant="primary" size="sm">Dashboard</Button>
            </Link>
          ) : (
            <Link to="/login">
              <Button variant="primary" size="sm">Login</Button>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
