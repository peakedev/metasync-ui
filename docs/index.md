# MetaSync UI Documentation

## Table of Contents

- [Architecture](./architecture.md) -- System architecture, tech stack, and data flow
- [Authentication & Authorization](./auth.md) -- Auth flows, roles, RLS, custom token hook
- [Edge Functions](./edge-functions.md) -- Proxy, stream-proxy, invite, complete-signup
- [Frontend Features](./features.md) -- Page-by-page feature summary
- [Supabase RLS Reference](./supabase-rls.md) -- RLS policies, verification queries, and new-project setup checklist
- [Development Guide](./development.md) -- Setup, running, testing, and deployment

## Diagrams

Architecture, ER, and sequence diagrams are in [`./diagrams/`](./diagrams/) as draw.io files.

| File | Type | Description |
|---|---|---|
| [system-architecture.drawio](./diagrams/system-architecture.drawio) | Architecture | Browser -> Supabase -> MetaSync Backends |
| [database-schema.drawio](./diagrams/database-schema.drawio) | ER | All tables and foreign key relationships |
| [proxy-flow.drawio](./diagrams/proxy-flow.drawio) | Sequence | MetaSync proxy: JWT validation -> Vault -> forward |
| [invitation-flow.drawio](./diagrams/invitation-flow.drawio) | Sequence | Invitation: admin sends -> user accepts -> membership created |

## Related

- [Baseline Requirements](../specs/baseline/requirements.md) -- Full feature specification
- [Baseline Design](../specs/baseline/design.md) -- Architecture and software design document
