"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Mail, Shield, Trash2 } from "lucide-react";
import type { IAMAuthUser } from "@/types/iam";

interface OwnerRowProps {
  owner: IAMAuthUser;
  isSelf: boolean;
}

export function OwnerRow({ owner, isSelf }: OwnerRowProps) {
  return (
    <div className="flex items-center gap-4 rounded-lg border p-4">
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{owner.email}</span>
          {isSelf && <Badge variant="secondary">You</Badge>}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield className="h-3 w-3" />
          <Badge variant="outline">{owner.provider}</Badge>
          <span>Joined {new Date(owner.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Button variant="ghost" size="sm" disabled>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {isSelf
              ? "Cannot remove your own owner account"
              : "Owner removal not available yet"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
