import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { LanguageSelector } from "@/components/i18n/LanguageSelector";

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
          {/* The language picker takes the slot the GitHub link used to hold: the
              repository is linked from the docs and the footer, and this is the
              control a visitor may actually need before reading anything. Ghost
              styling so the only weight in this cluster stays on the button. */}
          <LanguageSelector variant="ghost" className="hidden md:inline-flex" />

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
            <LanguageSelector className="px-3 py-2" />
          </div>
        </div>
      )}
    </nav>
  );
}
