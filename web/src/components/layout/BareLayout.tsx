import { Outlet } from "react-router";
import { Footer } from "./Footer";

/**
 * Footer only, no navigation.
 *
 * Someone answering a question arrived from an email with a link to one
 * decision. Offering them a marketing navbar invites them away from the only
 * thing the page exists for, and hints at an account they deliberately do not
 * need to have.
 */
export function BareLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer minimal />
    </div>
  );
}
