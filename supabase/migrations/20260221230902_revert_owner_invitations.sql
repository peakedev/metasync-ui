drop extension if exists "pg_net";

drop trigger if exists "invitations_updated_at" on "public"."invitations";

drop trigger if exists "last_admin_guard" on "public"."tenant_memberships";

drop policy "deny_anon" on "public"."owner_invitations";

revoke delete on table "public"."owner_invitations" from "anon";
revoke insert on table "public"."owner_invitations" from "anon";
revoke references on table "public"."owner_invitations" from "anon";
revoke select on table "public"."owner_invitations" from "anon";
revoke trigger on table "public"."owner_invitations" from "anon";
revoke truncate on table "public"."owner_invitations" from "anon";
revoke update on table "public"."owner_invitations" from "anon";

revoke delete on table "public"."owner_invitations" from "authenticated";
revoke insert on table "public"."owner_invitations" from "authenticated";
revoke references on table "public"."owner_invitations" from "authenticated";
revoke select on table "public"."owner_invitations" from "authenticated";
revoke trigger on table "public"."owner_invitations" from "authenticated";
revoke truncate on table "public"."owner_invitations" from "authenticated";
revoke update on table "public"."owner_invitations" from "authenticated";

revoke delete on table "public"."owner_invitations" from "service_role";
revoke insert on table "public"."owner_invitations" from "service_role";
revoke references on table "public"."owner_invitations" from "service_role";
revoke select on table "public"."owner_invitations" from "service_role";
revoke trigger on table "public"."owner_invitations" from "service_role";
revoke truncate on table "public"."owner_invitations" from "service_role";
revoke update on table "public"."owner_invitations" from "service_role";

alter table "public"."owner_invitations" drop constraint "owner_invitations_invited_by_fkey";
alter table "public"."owner_invitations" drop constraint "owner_invitations_status_check";

drop function if exists "public"."prevent_last_admin_change"();
drop function if exists "public"."set_updated_at"();

alter table "public"."owner_invitations" drop constraint "owner_invitations_pkey";
drop index if exists "public"."idx_owner_invitations_email";
drop index if exists "public"."owner_invitations_pkey";

drop table "public"."owner_invitations";

alter table "public"."invitations" drop column "updated_at";
