-- Identity-layer hardening (ADR-0008, ADR-0011) — companion to 0002.
-- Grants for the auth (global) and workspace (tenant-scoped) tables, FORCE
-- RLS on the tenant-scoped ones, and the tenant provisioning primitive.

-- Auth tables are global (ADR-0011): better-auth reads/writes them under
-- the app role during request authentication, before tenant context
-- exists. Full DML, no RLS — isolation is semantic (session tokens, user
-- ids) and enforced by better-auth.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  users, sessions, accounts, verifications,
  organizations, members, invitations, two_factors
TO drovano_app;
--> statement-breakpoint
-- Workspace tables are tenant-scoped domain data: full DML under RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE workspaces, workspace_members TO drovano_app;
--> statement-breakpoint
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE workspace_members FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Tenant provisioning primitive. SECURITY DEFINER: runs with the owner's
-- privileges so the app role can create a tenant *only* through this
-- controlled, audited path (it has no INSERT grant on tenants).
-- Idempotent: re-provisioning an existing tenant is a no-op, so a retried
-- afterCreateOrganization hook cannot duplicate workspaces.
CREATE FUNCTION provision_tenant(
  p_tenant_id uuid,
  p_tenant_name text,
  p_creator_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  INSERT INTO tenants (id, name)
  VALUES (p_tenant_id, p_tenant_name)
  ON CONFLICT (id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN NULL; -- already provisioned
  END IF;

  INSERT INTO workspaces (tenant_id, name)
  VALUES (p_tenant_id, 'General')
  RETURNING id INTO v_workspace_id;

  INSERT INTO workspace_members (tenant_id, workspace_id, user_id, role)
  VALUES (p_tenant_id, v_workspace_id, p_creator_user_id, 'admin');

  INSERT INTO audit_log (tenant_id, actor_kind, actor_id, action, resource_type, resource_id)
  VALUES (p_tenant_id, 'human', p_creator_user_id, 'tenant.provision', 'tenant', p_tenant_id);

  RETURN v_workspace_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION provision_tenant(uuid, text, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION provision_tenant(uuid, text, uuid) TO drovano_app;
