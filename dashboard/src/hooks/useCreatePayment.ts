"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/constants";

interface CreatePaymentResponse {
  checkout_url: string;
  payment_id: string;
}

export function useCreatePayment() {
  const [isLoading, setIsLoading] = useState(false);
  const { session } = useAuth();

  const createPayment = useCallback(
    async (tier: string): Promise<CreatePaymentResponse> => {
      if (!session?.id) throw new Error("Not authenticated");

      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/create-payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: session.id,
            email: session.email,
            tier,
          }),
        });

        if (!res.ok) {
          let message = "Payment creation failed";
          try {
            const body = await res.json();
            message = body.message ?? message;
          } catch {}
          throw new Error(message);
        }

        return await res.json();
      } finally {
        setIsLoading(false);
      }
    },
    [session],
  );

  return { createPayment, isLoading };
}
