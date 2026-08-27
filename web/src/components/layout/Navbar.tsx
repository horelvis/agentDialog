import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";

interface NavLink {
  /** Names its label in the catalogue, at landing:nav.<id>. */
  id: "features" | "how" | "code" | "docs";
  href: string;
  external?: boolean;
}

/** The anchors stay here; the words are in the catalogue. */
const navLinks: NavLink[] = [
  { id: "features", href: "#features" },
  { id: "how", href: "#how-it-works" },
  { id: "code", href: "#code" },
  { id: "docs", href: "https://docs.agentdialog.io", external: true },
];

export function Navbar() {
  const { t } = useTranslation("landing");
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-surface-border backdrop-blur-lg bg-surface-secondary/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2">
          <Logo className="h-7 w-7 text-brand-600" />
          {/* The wordmark. It is the product's name, so it is the same in every
              language and is deliberately not in the catalogue. */}
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <span className="text-lg font-bold"><span className="text-gray-100">Agent</span><span className="text-brand-500">Dialog</span></span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="text-sm text-gray-400 transition-colors hover:text-gray-100"
            >
              {t(`nav.${link.id}`)}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {/* GitHub link */}
          <a
            href="https://github.com/horelvis/agentDialog"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:flex items-center justify-center rounded-lg p-2 text-gray-400 transition-colors hover:text-gray-100"
            aria-label={t("nav.github")}
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844a9.59 9.59 0 012.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          </a>

          {/* Auth button */}
          {isAuthenticated ? (
            <Link to="/app">
              <Button variant="primary" size="sm">{t("nav.dashboard")}</Button>
            </Link>
          ) : (
            <Link to="/login">
              <Button variant="primary" size="sm">{t("nav.login")}</Button>
            </Link>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden flex items-center justify-center rounded-lg p-2 text-gray-400 transition-colors hover:text-gray-100"
            aria-label={t("nav.toggleMenu")}
          >
            {mobileOpen ? (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {mobileOpen && (
        <div className="md:hidden border-t border-surface-border bg-surface-secondary/95 backdrop-blur-lg">
          <div className="flex flex-col gap-1 px-4 py-3">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-surface-hover hover:text-gray-100"
              >
                {t(`nav.${link.id}`)}
              </a>
            ))}
            <a
              href="https://github.com/horelvis/agentDialog"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-surface-hover hover:text-gray-100"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844a9.59 9.59 0 012.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              {t("nav.github")}
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
