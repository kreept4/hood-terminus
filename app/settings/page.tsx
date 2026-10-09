import type { Metadata } from "next";
import { SettingsPanel } from "@/components/settings/SettingsPanel";

export const metadata: Metadata = {
  title: "Settings",
  description: "What to call your assistant, and which currency to show.",
};

/**
 * Settings.
 *
 * These preferences all existed already, each one next to the thing it
 * affected and nowhere else: the assistant's name lived at the bottom of the
 * check page, and the currency could only be changed inside the portfolio.
 * That is a good way to find a preference once and a bad way to find it again.
 *
 * It stays short on purpose. A settings page is where options go to be
 * forgotten, so this holds the ones somebody actually changes and nothing
 * invented to fill it out.
 */
export default function SettingsPage() {
  return (
    <div className="gutter py-8 md:py-10">
      <h1 className="text-h1 font-bold tracking-tight text-ink">Settings</h1>
      <p className="mt-2 max-w-xl text-body text-ink-2">
        Kept in this browser. Nothing here is sent to us.
      </p>
      <SettingsPanel />
    </div>
  );
}
