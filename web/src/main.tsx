import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initI18n } from "./i18n";

// Rendering before the language is settled paints English and then swaps it,
// which is worse than waiting: the first thing somebody reads is the wrong
// thing. This is one dynamic import, not a network round trip.
//
// The root is created once, up front, and both branches below render into
// this same object. `.then(render).catch(fallback)` would let an exception
// thrown by render() itself — not just a rejected initI18n() — land in the
// .catch(), which would call createRoot() a second time on a container that
// already has one; React throws on that. Reusing one root sidesteps it.
const root = createRoot(document.getElementById("root")!);

void initI18n()
  .then(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    // If i18n itself failed to load (e.g. a stale deploy 404ing a catalogue
    // chunk), #root would otherwise never receive a render() call and the
    // page stays blank forever with only a console rejection to go on. This
    // text is hardcoded English, not translated, on purpose: it is the
    // fallback for the case where translation is exactly what is unavailable.
    console.error("Failed to initialize i18n", error);
    root.render(
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        {/* Hardcoded English on purpose — see the comment above: this is the
            fallback for when i18n itself is what failed to load. */}
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <h1 className="text-xl font-semibold">AgentDialog failed to load</h1>
        {/* eslint-disable-next-line i18next/no-literal-string -- same fallback screen, same reason as the h1 above */}
        <button type="button" onClick={() => location.reload()} className="rounded bg-brand-600 px-4 py-2 text-white">
          Reload
        </button>
      </div>,
    );
  });
