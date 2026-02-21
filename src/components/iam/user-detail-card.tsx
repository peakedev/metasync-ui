"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Shield } from "lucide-react";
import type { IAMAuthUser } from "@/types/iam";

interface UserDetailCardProps {
  user: IAMAuthUser;
}

export function UserDetailCard({ user }: UserDetailCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          {user.email}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <Shield className="h-4 w-4" />
          <Badge variant="outline">{user.provider}</Badge>
        </div>
        <div>
          Joined {new Date(user.createdAt).toLocaleDateString()}
        </div>
      </CardContent>
    </Card>
  );
}
