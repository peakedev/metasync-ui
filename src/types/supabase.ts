export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          name: string;
          slug: string;
          backend_url: string | null;
          is_deleted: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          backend_url?: string | null;
          is_deleted?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          backend_url?: string | null;
          is_deleted?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          tenant_id: string;
          metasync_client_id: string;
          name: string;
          enabled: boolean;
          vault_secret_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          metasync_client_id: string;
          name: string;
          enabled?: boolean;
          vault_secret_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          metasync_client_id?: string;
          name?: string;
          enabled?: boolean;
          vault_secret_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          }
        ];
      };
      tenant_memberships: {
        Row: {
          id: string;
          tenant_id: string;
          user_id: string;
          role: "tenant_admin" | "tenant_user";
          client_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          user_id: string;
          role: "tenant_admin" | "tenant_user";
          client_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          user_id?: string;
          role?: "tenant_admin" | "tenant_user";
          client_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          }
        ];
      };
      invitations: {
        Row: {
          id: string;
          tenant_id: string;
          email: string;
          role: "tenant_admin" | "tenant_user";
          client_id: string | null;
          invited_by: string;
          status: "pending" | "accepted" | "expired";
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          email: string;
          role: "tenant_admin" | "tenant_user";
          client_id?: string | null;
          invited_by: string;
          status?: "pending" | "accepted" | "expired";
          expires_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          email?: string;
          role?: "tenant_admin" | "tenant_user";
          client_id?: string | null;
          invited_by?: string;
          status?: "pending" | "accepted" | "expired";
          expires_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          }
        ];
      };
      owner_invitations: {
        Row: {
          id: string;
          email: string;
          invited_by: string;
          status: "pending" | "accepted" | "expired";
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          invited_by: string;
          status?: "pending" | "accepted" | "expired";
          expires_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          invited_by?: string;
          status?: "pending" | "accepted" | "expired";
          expires_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      custom_access_token_hook: {
        Args: { event: Json };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type InsertTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type UpdateTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
