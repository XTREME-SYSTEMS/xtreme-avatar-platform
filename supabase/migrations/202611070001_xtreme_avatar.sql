-- Xtreme Avatar: own schema and app memberships. Does not touch public Auto Leads
-- or Vision Factory tables. No legacy Sites account/data/owner is inferred.
BEGIN;
CREATE SCHEMA IF NOT EXISTS xtreme_avatar;
CREATE SCHEMA IF NOT EXISTS xtreme_avatar_private;
REVOKE ALL ON SCHEMA xtreme_avatar FROM PUBLIC, anon;
REVOKE ALL ON SCHEMA xtreme_avatar_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA xtreme_avatar,xtreme_avatar_private TO authenticated;

CREATE TABLE xtreme_avatar.organizations(
 organization_id uuid PRIMARY KEY,
 name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO xtreme_avatar.organizations(organization_id,name)
VALUES('8239c37e-9b5c-49bf-af9c-dd0dcd091047','XPS / Xtreme Avatar');
CREATE TABLE xtreme_avatar.members(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),
 organization_id uuid NOT NULL REFERENCES xtreme_avatar.organizations(organization_id),
 email text NOT NULL UNIQUE CHECK(email=lower(email)),
 role text NOT NULL CHECK(role IN('owner','admin','member')),
 status text NOT NULL CHECK(status IN('active','suspended')),
 created_at text NOT NULL
);
-- One app organization per authenticated account in this release. Other apps'
-- membership tables are independent and never grant access here.
CREATE FUNCTION xtreme_avatar_private.current_org() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT organization_id FROM xtreme_avatar.members
 WHERE user_id=(SELECT auth.uid()) AND status='active' $$;
CREATE FUNCTION xtreme_avatar_private.current_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT role FROM xtreme_avatar.members
 WHERE user_id=(SELECT auth.uid()) AND status='active' $$;
REVOKE ALL ON FUNCTION xtreme_avatar_private.current_org() FROM PUBLIC;
REVOKE ALL ON FUNCTION xtreme_avatar_private.current_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION xtreme_avatar_private.current_org(),xtreme_avatar_private.current_role() TO authenticated;

CREATE TABLE xtreme_avatar.invitations(
 email text PRIMARY KEY CHECK(email=lower(email)),
 organization_id uuid NOT NULL DEFAULT xtreme_avatar_private.current_org()
  REFERENCES xtreme_avatar.organizations(organization_id),
 role text NOT NULL CHECK(role IN('admin','member')),
 status text NOT NULL CHECK(status IN('active','revoked','accepted')),
 created_at text NOT NULL,
 accepted_by uuid REFERENCES auth.users(id),
 accepted_at timestamptz
);
CREATE TABLE xtreme_avatar.account_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 organization_id uuid NOT NULL DEFAULT xtreme_avatar_private.current_org()
  REFERENCES xtreme_avatar.organizations(organization_id),
 actor_id uuid REFERENCES auth.users(id),
 action text NOT NULL,
 target text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at text NOT NULL
);
CREATE TABLE xtreme_avatar.private_state(
 user_id uuid NOT NULL REFERENCES xtreme_avatar.members(user_id),
 organization_id uuid NOT NULL DEFAULT xtreme_avatar_private.current_org()
  REFERENCES xtreme_avatar.organizations(organization_id),
 key text NOT NULL,value text NOT NULL,version integer NOT NULL CHECK(version>0),
 updated_at text NOT NULL, PRIMARY KEY(user_id,key)
);
CREATE TABLE xtreme_avatar.assistant_turns(
 user_id uuid NOT NULL REFERENCES xtreme_avatar.members(user_id),
 organization_id uuid NOT NULL DEFAULT xtreme_avatar_private.current_org()
  REFERENCES xtreme_avatar.organizations(organization_id),
 request_id text NOT NULL,prompt text NOT NULL,context_json text NOT NULL,
 status text NOT NULL CHECK(status IN('pending','complete','failed')),
 reply text,created_at text NOT NULL,updated_at text NOT NULL,
 PRIMARY KEY(user_id,request_id)
);
CREATE UNIQUE INDEX assistant_one_pending ON xtreme_avatar.assistant_turns(user_id) WHERE status='pending';
CREATE INDEX members_org ON xtreme_avatar.members(organization_id);
CREATE INDEX invitations_org ON xtreme_avatar.invitations(organization_id);
CREATE INDEX private_state_org_user ON xtreme_avatar.private_state(organization_id,user_id);
CREATE INDEX assistant_turns_org_user ON xtreme_avatar.assistant_turns(organization_id,user_id);

-- Existing membership can never be re-admitted through an email invitation.
-- Verified identity and confirmed current email come from auth.users, not claims,
-- request args, user_metadata, or any email copied from an older Site.
CREATE FUNCTION xtreme_avatar_private.admit_member() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE identity uuid := auth.uid(); verified_email text;
 invitation xtreme_avatar.invitations%ROWTYPE;
BEGIN
 IF identity IS NULL OR EXISTS(SELECT 1 FROM xtreme_avatar.members WHERE user_id=identity) THEN RETURN false; END IF;
 SELECT lower(email) INTO verified_email FROM auth.users
 WHERE id=identity AND email_confirmed_at IS NOT NULL
 AND coalesce(is_anonymous,false)=false;
 IF verified_email IS NULL THEN RETURN false; END IF;
 SELECT * INTO invitation FROM xtreme_avatar.invitations
 WHERE email=verified_email AND status='active' AND role IN('admin','member')
 FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO xtreme_avatar.members(user_id,organization_id,email,role,status,created_at)
 VALUES(identity,invitation.organization_id,verified_email,invitation.role,'active',now()::text)
 ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE xtreme_avatar.invitations SET status='accepted',accepted_by=identity,accepted_at=now()
 WHERE email=verified_email;
 INSERT INTO xtreme_avatar.account_audit(organization_id,actor_id,action,target,created_at)
 VALUES(invitation.organization_id,identity,'invitation_accepted',identity::text,now()::text);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION xtreme_avatar_private.admit_member() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION xtreme_avatar_private.admit_member() TO authenticated;

ALTER TABLE xtreme_avatar.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE xtreme_avatar.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE xtreme_avatar.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE xtreme_avatar.account_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE xtreme_avatar.private_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE xtreme_avatar.assistant_turns ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON xtreme_avatar.organizations TO authenticated;
GRANT SELECT,UPDATE ON xtreme_avatar.members TO authenticated;
GRANT SELECT,INSERT,UPDATE ON xtreme_avatar.invitations TO authenticated;
GRANT SELECT,INSERT ON xtreme_avatar.account_audit TO authenticated;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA xtreme_avatar TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON xtreme_avatar.private_state,xtreme_avatar.assistant_turns TO authenticated;
-- No authenticated membership insert/delete, arbitrary owner grant or org move.
CREATE POLICY organization_read ON xtreme_avatar.organizations FOR SELECT TO authenticated
 USING(organization_id=(SELECT xtreme_avatar_private.current_org()));
CREATE POLICY member_read ON xtreme_avatar.members FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()) OR
 (organization_id=(SELECT xtreme_avatar_private.current_org()) AND
 (SELECT xtreme_avatar_private.current_role()) IN('owner','admin')));
CREATE POLICY member_manage ON xtreme_avatar.members FOR UPDATE TO authenticated
 USING(organization_id=(SELECT xtreme_avatar_private.current_org()) AND user_id<>(SELECT auth.uid())
 AND role<>'owner' AND ((SELECT xtreme_avatar_private.current_role())='owner'
 OR ((SELECT xtreme_avatar_private.current_role())='admin' AND role='member')))
 WITH CHECK(organization_id=(SELECT xtreme_avatar_private.current_org()) AND user_id<>(SELECT auth.uid())
 AND role<>'owner' AND ((SELECT xtreme_avatar_private.current_role())='owner'
 OR ((SELECT xtreme_avatar_private.current_role())='admin' AND role='member')));
CREATE FUNCTION xtreme_avatar_private.freeze_member_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.user_id<>OLD.user_id OR NEW.organization_id<>OLD.organization_id OR NEW.email<>OLD.email THEN
 RAISE EXCEPTION 'Member identity and organization are immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER freeze_member_identity BEFORE UPDATE ON xtreme_avatar.members
FOR EACH ROW EXECUTE FUNCTION xtreme_avatar_private.freeze_member_identity();
CREATE POLICY invitation_read ON xtreme_avatar.invitations FOR SELECT TO authenticated
 USING(organization_id=(SELECT xtreme_avatar_private.current_org())
 AND (SELECT xtreme_avatar_private.current_role()) IN('owner','admin'));
CREATE POLICY invitation_create ON xtreme_avatar.invitations FOR INSERT TO authenticated
 WITH CHECK(organization_id=(SELECT xtreme_avatar_private.current_org())
 AND status='active' AND accepted_by IS NULL AND accepted_at IS NULL
 AND ((SELECT xtreme_avatar_private.current_role())='owner'
 OR ((SELECT xtreme_avatar_private.current_role())='admin' AND role='member')));
CREATE POLICY invitation_manage ON xtreme_avatar.invitations FOR UPDATE TO authenticated
 USING(organization_id=(SELECT xtreme_avatar_private.current_org()) AND status<>'accepted'
 AND ((SELECT xtreme_avatar_private.current_role())='owner'
 OR ((SELECT xtreme_avatar_private.current_role())='admin' AND role='member')))
 WITH CHECK(organization_id=(SELECT xtreme_avatar_private.current_org()) AND status IN('active','revoked')
 AND accepted_by IS NULL AND accepted_at IS NULL
 AND ((SELECT xtreme_avatar_private.current_role())='owner'
 OR ((SELECT xtreme_avatar_private.current_role())='admin' AND role='member')));
CREATE POLICY audit_read ON xtreme_avatar.account_audit FOR SELECT TO authenticated
 USING(organization_id=(SELECT xtreme_avatar_private.current_org())
 AND (SELECT xtreme_avatar_private.current_role()) IN('owner','admin'));
CREATE POLICY audit_append ON xtreme_avatar.account_audit FOR INSERT TO authenticated
 WITH CHECK(actor_id=(SELECT auth.uid()) AND organization_id=(SELECT xtreme_avatar_private.current_org())
 AND (SELECT xtreme_avatar_private.current_role()) IN('owner','admin'));
CREATE POLICY private_data ON xtreme_avatar.private_state FOR ALL TO authenticated
 USING(user_id=(SELECT auth.uid()) AND organization_id=(SELECT xtreme_avatar_private.current_org()))
 WITH CHECK(user_id=(SELECT auth.uid()) AND organization_id=(SELECT xtreme_avatar_private.current_org()));
CREATE POLICY private_chat ON xtreme_avatar.assistant_turns FOR ALL TO authenticated
 USING(user_id=(SELECT auth.uid()) AND organization_id=(SELECT xtreme_avatar_private.current_org()))
 WITH CHECK(user_id=(SELECT auth.uid()) AND organization_id=(SELECT xtreme_avatar_private.current_org()));
-- Authority changes and their audit receipt are the same database transaction.
-- A missing/broken audit store rejects the membership/invitation mutation.
CREATE FUNCTION xtreme_avatar_private.audit_authority_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); change_action text;
BEGIN
 change_action := CASE WHEN actor IS NULL THEN 'database_admin:' ELSE '' END
   || TG_TABLE_NAME || ':' || lower(TG_OP);
 INSERT INTO xtreme_avatar.account_audit(organization_id,actor_id,action,target,details,created_at)
 VALUES(NEW.organization_id,actor,change_action,
   CASE WHEN TG_TABLE_NAME='members' THEN to_jsonb(NEW)->>'user_id' ELSE to_jsonb(NEW)->>'email' END,
   jsonb_build_object('before',CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE null END,'after',to_jsonb(NEW)),
   now()::text);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION xtreme_avatar_private.audit_authority_change() FROM PUBLIC,authenticated,anon;
REVOKE ALL ON FUNCTION xtreme_avatar_private.freeze_member_identity() FROM PUBLIC,authenticated,anon;
CREATE TRIGGER membership_audit AFTER INSERT OR UPDATE ON xtreme_avatar.members
FOR EACH ROW EXECUTE FUNCTION xtreme_avatar_private.audit_authority_change();
CREATE TRIGGER invitation_audit AFTER INSERT OR UPDATE ON xtreme_avatar.invitations
FOR EACH ROW EXECUTE FUNCTION xtreme_avatar_private.audit_authority_change();
COMMIT;
