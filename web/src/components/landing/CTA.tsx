import { Button } from "@/components/ui/Button";

export function CTA() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl rounded-2xl bg-brand-600 px-8 py-16 text-center sm:px-12">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Integrate in 60 seconds. Seriously.
          </h2>
          <p className="mt-4 text-lg text-brand-100">
            Three API calls to connect your agent. Your team gets an email,
            signs in with the code and answers in one click. No account to
            create, no password to remember.
          </p>
          <div className="mt-8 flex flex-col items-center gap-2">
            <div className="flex items-center gap-4">
              <a href="#get-key">
                <Button
                  size="lg"
                  className="bg-surface-primary text-brand-400 hover:bg-surface-secondary"
                >
                  Get your API key
                </Button>
              </a>
              <a href="https://docs.agentdialog.io" target="_blank" rel="noopener noreferrer">
                <Button
                  size="lg"
                  variant="secondary"
                  className="border-brand-300/30 text-brand-100 hover:bg-brand-500"
                >
                  Read the Docs
                </Button>
              </a>
            </div>
            <p className="text-sm text-brand-200">No credit card. No account to create.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
