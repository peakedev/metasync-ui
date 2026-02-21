"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import Link from "next/link";

interface MetaSyncErrorProps {
  error: string;
  tenantSlug?: string;
  onRetry?: () => void;
}

export function MetaSyncError({ error, tenantSlug, onRetry }: MetaSyncErrorProps) {
  if (error === "credentials_not_configured") {
    return (
      <div className="flex items-center gap-3 rounded-md border border-destructive/20 bg-destructive/5 p-4">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <div className="flex-1">
          <p className="text-sm font-medium">MetaSync credentials not configured</p>
          <p className="text-sm text-muted-foreground">
            Please configure the backend URL and API key.
          </p>
        </div>
        {tenantSlug && (
          <Link href={`/${tenantSlug}/config`}>
            <Button size="sm" variant="outline">
              Go to Config
            </Button>
          </Link>
        )}
      </div>
    );
  }

  if (error === "backend_unreachable") {
    return (
      <div className="flex items-center gap-3 rounded-md border border-destructive/20 bg-destructive/5 p-4">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <div className="flex-1">
          <p className="text-sm font-medium">MetaSync backend unreachable</p>
          <p className="text-sm text-muted-foreground">
            The backend server could not be reached. Please check the URL configuration.
          </p>
        </div>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-destructive/20 bg-destructive/5 p-4">
      <AlertCircle className="h-5 w-5 text-destructive" />
      <div className="flex-1">
        <p className="text-sm font-medium">Error</p>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
