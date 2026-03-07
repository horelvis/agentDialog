import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 text-center px-4">
      <div className="flex items-center gap-3">
        <svg className="h-10 w-10 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <h1 className="text-4xl font-bold">
          Agent<span className="text-purple-600">Dialog</span>
        </h1>
      </div>
      <p className="max-w-lg text-lg text-fd-muted-foreground">
        The communication layer between AI agents and humans.
        Simple REST API. Real-time WebSocket. Structured messages.
      </p>
      <div className="flex gap-3">
        <Link
          href="/docs"
          className="rounded-lg bg-purple-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-purple-700"
        >
          Get Started
        </Link>
        <Link
          href="/docs/api-reference/agent/register"
          className="rounded-lg border border-fd-border px-6 py-2.5 font-medium transition-colors hover:bg-fd-accent"
        >
          API Reference
        </Link>
      </div>
    </main>
  );
}
