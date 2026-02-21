-- Create tenants table
CREATE TABLE tenants (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  slug        text        NOT NULL UNIQUE,
  backend_url text,
  is_deleted  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
