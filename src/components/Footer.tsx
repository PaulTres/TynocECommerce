import { SITE_NAME } from "@/lib/constants";

/** Minimal footer. Static, so it is rendered once on the server with no client JS. */
export function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-slate sm:px-6">
        {SITE_NAME} is a demo store. No real orders are placed.
      </div>
    </footer>
  );
}
