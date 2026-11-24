-- Explicit new-app owner bootstrap. This is NOT a Sites identity/memory transfer.
-- Reviewed verified Supabase auth identity; refuses mismatches or reactivation.
BEGIN;
SELECT set_config('request.jwt.claims','{}',true);
DO $$
DECLARE
 expected_user constant uuid := 'eca619af-f25b-4cf8-adde-e48cee0a96fc';
 expected_org constant uuid := '8239c37e-9b5c-49bf-af9c-dd0dcd091047';
 verified auth.users%ROWTYPE;
 existing xtreme_avatar.members%ROWTYPE;
BEGIN
 SELECT * INTO verified FROM auth.users WHERE id=expected_user FOR SHARE;
 IF NOT FOUND OR lower(verified.email) <> 'jeremy@strategicmindsai.com'
 OR verified.email_confirmed_at IS NULL OR coalesce(verified.is_anonymous,false) THEN
  RAISE EXCEPTION 'Verified nonanonymous owner identity does not match';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM xtreme_avatar.organizations WHERE organization_id=expected_org) THEN
  RAISE EXCEPTION 'Expected Xtreme Avatar organization missing';
 END IF;
 LOCK TABLE xtreme_avatar.members IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO existing FROM xtreme_avatar.members WHERE user_id=expected_user;
 IF FOUND THEN
  IF existing.organization_id<>expected_org OR existing.role<>'owner'
   OR existing.status<>'active' OR existing.email<>lower(verified.email) THEN
   RAISE EXCEPTION 'Existing membership differs; bootstrap must not change privileges or reactivate';
  END IF;
  RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM xtreme_avatar.members WHERE organization_id=expected_org AND role='owner') THEN
  RAISE EXCEPTION 'Organization already has an owner; review explicit ownership change';
 END IF;
 INSERT INTO xtreme_avatar.members(user_id,organization_id,email,role,status,created_at)
 VALUES(expected_user,expected_org,lower(verified.email),'owner','active',now()::text);
 -- The table trigger also records the inserted row atomically.
 INSERT INTO xtreme_avatar.account_audit(organization_id,actor_id,action,target,details,created_at)
 VALUES(expected_org,NULL,'database_admin:verified_initial_owner',expected_user::text,
  jsonb_build_object('basis','explicit operator approval of confirmed Supabase auth UUID',
                    'legacy_identity_transferred',false,
                    'legacy_memory_transferred',false,
                    'pstn_authority_transferred',false),now()::text);
END $$;
COMMIT;
