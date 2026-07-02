"use client";

import CreateDBForm from "@/components/CreateDBForm";

export default function CreateDatabasePage() {
  return (
    <div className="flex-1">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-border-subtle bg-bg-primary">
        <div>
          <h1 className="text-sm font-semibold text-text-primary">
            Create database
          </h1>
        </div>
      </div>

      {/* Form */}
      <CreateDBForm />
    </div>
  );
}
