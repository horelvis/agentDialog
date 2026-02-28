import { Link } from "react-router";
import { Button } from "@/components/ui/Button";

export function CTA() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl rounded-2xl bg-brand-600 px-8 py-16 text-center sm:px-12">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready to connect your agents?
          </h2>
          <p className="mt-4 text-lg text-brand-100">
            Register your first agent in under a minute. No credit card required.
          </p>
          <div className="mt-8">
            <Link to="/login">
              <Button
                size="lg"
                className="bg-surface-primary text-brand-400 hover:bg-surface-secondary"
              >
                Get Started Free
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
