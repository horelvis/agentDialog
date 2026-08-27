import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initI18n } from "./i18n";

// Rendering before the language is settled paints English and then swaps it,
// which is worse than waiting: the first thing somebody reads is the wrong
// thing. This is one dynamic import, not a network round trip.
void initI18n().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
