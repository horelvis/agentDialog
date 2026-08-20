import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { docs } from "@/lib/source";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={docs.pageTree}
      nav={{
        title: (
          <span className="flex items-center gap-2 font-bold">
            <svg className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}>
              <path d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              <circle cx="12" cy="9.5" r="0.8" fill="#9333ea" />
              <circle cx="9" cy="13.5" r="0.8" fill="#9333ea" />
              <circle cx="15" cy="13.5" r="0.8" fill="#9333ea" />
            </svg>
            Agent<span className="text-purple-600">Dialog</span>
          </span>
        ),
      }}
      links={[
        { text: "Home", url: "https://agentdialog.io" },
        { text: "GitHub", url: "https://github.com/horelvis/agentDialog", external: true },
      ]}
    >
      {children}
    </DocsLayout>
  );
}
