"use client";

import { useOwnerList } from "@/hooks/iam/use-owner-list";
import { useSession } from "@/hooks/use-session";
import { OwnerRow } from "@/components/iam/owner-row";
import { InviteOwnerDialog } from "@/components/iam/invite-owner-dialog";

export default function OwnersPage() {
  const { data, isLoading } = useOwnerList();
  const { user } = useSession();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Owners</h1>
        <InviteOwnerDialog />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {data?.owners.map((owner) => (
            <OwnerRow
              key={owner.id}
              owner={owner}
              isSelf={owner.id === user?.id}
            />
          ))}
          {data?.owners.length === 0 && (
            <p className="text-muted-foreground text-center py-8">No owners found.</p>
          )}
        </div>
      )}
    </div>
  );
}
