"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { useState } from "react";
import { AuthProvider } from "@/lib/auth";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds
            retry: 2,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#0f162e",
              color: "#e2e8f0",
              border: "1px solid rgba(109,93,253,0.15)",
            },
            success: {
              iconTheme: {
                primary: "#34d399",
                secondary: "#0f162e",
              },
            },
            error: {
              iconTheme: {
                primary: "#ef4444",
                secondary: "#0f162e",
              },
            },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
