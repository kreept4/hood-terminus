import { CreateForm } from "@/components/create/CreateForm";
import { YourTokens } from "@/components/create/YourTokens";
import { OwnerPanel } from "@/components/create/OwnerPanel";

export const metadata = {
  title: "Create a token",
  description:
    "Launch a token on Robinhood Chain with nothing up front and keep the fees it trades on.",
};

export default function CreatePage() {
  return (
    <div className="gutter py-10 md:py-14">
      <header className="max-w-2xl">
        <h1 className="text-h1 leading-none font-bold tracking-tight text-ink">
          Launch a token
        </h1>
        <p className="mt-4 text-lead text-ink-2">
          Nothing up front. Buyers fund it, and at four ETH it gets a real
          pool.
        </p>
      </header>

      <div className="mt-8">
        <CreateForm />
      </div>

      <YourTokens />
      {/* Renders for the launchpad owner and nobody else. */}
      <OwnerPanel />
    </div>
  );
}
