"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/**
 * Whether the desktop rail is expanded.
 *
 * Lives in context rather than in the rail itself, because the content column
 * has to move with it, and those are siblings under the root layout.
 *
 * The choice persists. A rail that a reader collapses and finds expanded again
 * on the next page is a rail they stop collapsing.
 */

const KEY = "ht:rail";

type Ctx = { collapsed: boolean; toggle: () => void };

const SidebarContext = createContext<Ctx>({
  collapsed: false,
  toggle: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  // Starts expanded on both server and client. Reading localStorage during the
  // first render would not match what the server sent, and a rail that snaps
  // width on hydration is worse than one that settles a frame late.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "1") setCollapsed(true);
    } catch {
      // Site data blocked. The rail simply starts expanded every time.
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(KEY, next ? "1" : "0");
      } catch {
        // As above.
      }
      return next;
    });
  }, []);

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

/** The content column, inset by whatever width the rail currently has. */
export function ContentColumn({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div
      className={[
        "relative z-10 flex min-h-dvh flex-col pb-20 transition-[padding] duration-200 ease-out md:pb-0",
        collapsed ? "md:pl-16" : "md:pl-64",
      ].join(" ")}
    >
      {children}
    </div>
  );
}
