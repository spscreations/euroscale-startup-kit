"use client";

import CreateDBForm from "@/components/CreateDBForm";

export default function CreateDatabasePage() {
  return (
    <div className="flex-1">
      {/* Top bar */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-purple-500/10 bg-navy-800/30">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">
            Create Database
          </h1>
          <p className="text-xs text-slate-500">
            Provision a new database cluster
          </p>
        </div>
      </div>

      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-purple-500/3 blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/3 w-[300px] h-[300px] rounded-full bg-cyan-400/3 blur-[100px]" />
      </div>

      {/* Form */}
      <div className="relative">
        <CreateDBForm />
      </div>
    </div>
  );
}
