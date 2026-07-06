import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="max-w-lg w-full text-center space-y-8 animate-fade-in">
        {/* Brand */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">
            EuroScale
          </h1>
          <p className="text-base text-text-secondary leading-relaxed max-w-sm mx-auto">
            Sovereign EU database infrastructure — managed Vitess clusters on
            European soil.
          </p>
        </div>

        {/* Status indicator */}
        <Badge
          variant="outline"
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 h-auto"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
          </span>
          <span className="text-xs text-text-muted">Dashboard is live</span>
        </Badge>

        {/* CTAs */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            render={<Link href="/login" />}
            size="lg"
            className="min-h-[44px]"
          >
            Sign in
            <ArrowRight size={15} />
          </Button>
          <Button
            variant="outline"
            render={<Link href="/signup" />}
            size="lg"
            className="min-h-[44px] text-text-secondary hover:text-text-primary"
          >
            Create account
          </Button>
        </div>

        {/* Footer */}
        <p className="text-xs text-text-disabled pt-2">
          EU sovereign infrastructure · GDPR by architecture
        </p>
      </div>
    </main>
  );
}
