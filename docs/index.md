# Documentation Index

Living technical documentation for MetaSync UI. One file per functional or technical domain. **Always update this file when adding a new documentation file.**

For the full feature specification see [`../specs/baseline/requirements.md`](../specs/baseline/requirements.md).
For the architecture and design document see [`../specs/baseline/design.md`](../specs/baseline/design.md).

---

## Files

| File | Description |
|---|---|
| [authentication.md](./authentication.md) | Supabase Auth setup, Custom Access Token Hook, JWT claims, session lifecycle, route guards |
| [tenant-management.md](./tenant-management.md) | Tenant CRUD, membership model, invitation flow end-to-end |
| [edge-functions.md](./edge-functions.md) | Each edge function: purpose, request/response shape, auth contract, error codes |
| [database.md](./database.md) | Schema reference (all tables, columns, indexes), RLS policies, migration conventions |
| [vault.md](./vault.md) | Supabase Vault: secret naming convention, read/write/rotate operations |
| [frontend-architecture.md](./frontend-architecture.md) | Route structure, key hooks, RoleGuard, Supabase client initialisation |
| [streaming.md](./streaming.md) | SSE chat interface: stream-proxy edge function, useStreamProxy hook, error handling |

## Diagrams

Architecture, ER, and sequence diagrams are in [`./diagrams/`](./diagrams/) as draw.io files.

| File | Type | Description |
|---|---|---|
| [system-architecture.drawio](./diagrams/system-architecture.drawio) | Architecture | Browser → Supabase → MetaSync Backends |
| [database-schema.drawio](./diagrams/database-schema.drawio) | ER | All tables and foreign key relationships |
| [proxy-flow.drawio](./diagrams/proxy-flow.drawio) | Sequence | MetaSync proxy: JWT validation → Vault → forward |
| [invitation-flow.drawio](./diagrams/invitation-flow.drawio) | Sequence | Invitation: admin sends → user accepts → membership created |
