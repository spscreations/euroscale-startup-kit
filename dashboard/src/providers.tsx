"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TransportProvider } from "@connectrpc/connect-query";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/lib/auth";
import { createTransport } from "@/lib/api";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 2,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: 1 },
        },
      }),
  );

  const [transport] = useState(() => createTransport());

  return (
    <QueryClientProvider client={queryClient}>
      <TransportProvider transport={transport}>
        <AuthProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "#141414",
                color: "#fafafa",
                border: "1px solid #262626",
                borderRadius: "8px",
                fontSize: "13px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              },
              success: {
                iconTheme: { primary: "#10b981", secondary: "#141414" },
              },
              error: {
                iconTheme: { primary: "#ef4444", secondary: "#141414" },
              },
            }}
          />
        </AuthProvider>
      </TransportProvider>
    </QueryClientProvider>
  );
}
