import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import { Web3Providers } from "@/components/providers/Web3Providers";
import { wagmiConfig } from "@/lib/wagmi";
import { NetworkGuard } from "@/components/wallet/NetworkGuard";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { BRAND } from "@/lib/brand";
import { Sidebar } from "@/components/shell/Sidebar";
import {
  SidebarProvider,
  ContentColumn,
} from "@/components/shell/SidebarState";
import { Footer } from "@/components/shell/Footer";
import { InstallPrompt } from "@/components/shell/InstallPrompt";
import { PageLoader, LOADER_SCRIPT } from "@/components/shell/PageLoader";
import "./globals.css";
/**
 * Two families, each doing the job it is good at.
 *
 * Setting the whole interface in monospace was costing more than it bought.
 * Prose and headings in a fixed pitch read cramped and amateur at any size
 * above body, which is most of what a reader sees first.
 *
 * So: a grotesk for anything made of words, and the monospace kept for
 * anything made of digits. Numbers still align down a column, because every
 * numeric cell goes through `.tnum`, which sets the mono family and tabular
 * figures together.
 */
const sans = Inter({
  variable: "--font-sans-ui",
  subsets: ["latin"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});
export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
};
export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#030302",
  // Traders zoom into charts on mobile. Do not take that away.
  maximumScale: 5,

  /**
   * Lets the layout viewport shrink when the on-screen keyboard opens.
   *
   * The default, `resizes-visual`, shrinks only the visual viewport: the page
   * keeps its full height and the keyboard is drawn over it. Anything centred
   * with `position: fixed` is then centred against a box taller than what is
   * actually visible, so tapping into a field pushes the thing you are typing
   * into off the bottom of the screen. Privy renders its login in a fixed
   * overlay, which is exactly that case.
   *
   * `resizes-content` makes the layout viewport itself shrink, so a centred
   * overlay stays centred in the space the keyboard leaves.
   */
  interactiveWidget: "resizes-content",

  /**
   * Required for `env(safe-area-inset-*)` to report anything.
   *
   * Without it those values resolve to zero, which quietly disabled the inset
   * already written into the mobile tab-bar height in `globals.css`. The
   * calculation looked right and subtracted nothing.
   */
  viewportFit: "cover",
};
export default async function RootLayout({ children }: LayoutProps<"/">) {
  /**
   * The wallet connection, recovered from the cookie before the first paint.
   *
   * wagmi is configured with `ssr: true` and `cookieStorage`, and that pairing
   * only completes if the server reads the cookie and hands the state to the
   * provider. Without this the client began every navigation with no state and
   * reconnected after mount, so a connected wallet rendered as disconnected on
   * the first paint of every page.
   */
  const initialState = cookieToInitialState(
    wagmiConfig,
    (await headers()).get("cookie"),
  );

  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        {/* Runs before first paint, so a session that has already seen the
            loader never paints it at all. */}
        <script dangerouslySetInnerHTML={{ __html: LOADER_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <PageLoader />
        <Web3Providers initialState={initialState}>
          <SidebarProvider>
            <Sidebar />
            {/* The rail is fixed, so the content column is inset rather than
                laid out beside it, and the inset follows the rail's width. */}
            <ContentColumn>
              {/* Above everything, because a wrong network makes every control
                  below it fail in a way that blames the wallet's balance. */}
              <NetworkGuard />
              <main className="flex-1">{children}</main>
              <Footer />
            </ContentColumn>
            <InstallPrompt />
          </SidebarProvider>
        </Web3Providers>
      </body>
    </html>
  );
}