"use client";

import BrowseData from "@/components/BrowseData";
import { useAuth } from "@/lib/auth";

export default function BrowsePage() {
  const { session } = useAuth();

  if (!session?.id) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-text-muted">
          Sign in to browse databases.
        </p>
      </div>
    );
  }

  return <BrowseData userId={session.id} />;
}
