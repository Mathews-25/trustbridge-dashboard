"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

import { Header } from "@/components/Header";
import { I18nProvider } from "@/lib/i18n-context";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <I18nProvider>
            <Header />
            {/*
              The single `main` landmark, and the target of the skip link in
              `layout.tsx`. `tabIndex={-1}` makes it focusable by the skip link
              without adding it to the tab order — without it, Safari and Firefox
              move the viewport but leave focus where it was.
            */}
            <main id="main-content" tabIndex={-1} className="outline-none">
              {children}
            </main>
          </I18nProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
