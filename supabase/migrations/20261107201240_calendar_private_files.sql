-- Additive creator-private job-file manifest. Storage bucket creation/configuration
-- is a parent-controlled Storage API operation; never insert storage.objects here.
CREATE TABLE xtreme_avatar.job_attachments (
 attachment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES xtreme_avatar.members(user_id),
 organization_id uuid NOT NULL REFERENCES xtreme_avatar.organizations(organization_id),
 event_ref text NOT NULL CHECK(event_ref ~ '^ce1_[0-9a-f]{64}$'),
 job_id text, request_id uuid NOT NULL,
 file_name text NOT NULL CHECK(length(file_name) BETWEEN 1 AND 160),
 mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 4000000),
 object_name text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','uploading','ready','deleting','deleted','failed')),
 sha256 text CHECK(sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
 upload_nonce uuid, upload_expires_at timestamptz,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_id),
 CHECK(status!='ready' OR sha256 IS NOT NULL)
);
CREATE INDEX job_files_owner_event ON xtreme_avatar.job_attachments(user_id,event_ref);
ALTER TABLE xtreme_avatar.job_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON xtreme_avatar.job_attachments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON xtreme_avatar.job_attachments TO authenticated;
CREATE POLICY job_files_private_read ON xtreme_avatar.job_attachments FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()) AND organization_id=(SELECT xtreme_avatar_private.current_org()));
-- No authenticated metadata mutation or Storage write policy exists. The Edge
-- server's fixed operation helper is the only caller of the mutation function.
CREATE FUNCTION xtreme_avatar_private.file_mutation(operation text,input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; org uuid; row xtreme_avatar.job_attachments; ref text;
 n integer; used bigint; ext text; item_id uuid; work_version integer; work_value text;
BEGIN
 actor:=auth.uid();
 SELECT m.organization_id INTO org FROM xtreme_avatar.members m JOIN auth.users u ON u.id=m.user_id
  WHERE m.user_id=actor AND m.status='active' AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false);
 IF actor IS NULL OR org IS NULL THEN RETURN jsonb_build_object('ok',false,'code','access_required'); END IF;
 IF operation NOT IN ('reserve','claim','finish','delete_begin','delete_finish') OR jsonb_typeof(input)!='object' THEN
  RETURN jsonb_build_object('ok',false,'code','invalid_file'); END IF;
 ref:=input->>'eventRef';
 IF ref IS NULL OR ref !~ '^ce1_[0-9a-f]{64}$' THEN RETURN jsonb_build_object('ok',false,'code','invalid_file'); END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('xtreme-job-files:'||actor::text,0));
 IF operation='reserve' THEN
  SELECT version,value INTO work_version,work_value FROM xtreme_avatar.private_state
   WHERE user_id=actor AND organization_id=org AND key='calendar_job_v1:'||ref;
  IF work_version IS NULL THEN RETURN jsonb_build_object('ok',false,'code','job_missing'); END IF;
  IF work_version!=(input->>'jobVersion')::integer THEN RETURN jsonb_build_object('ok',false,'code','version_conflict'); END IF;
  IF work_value::jsonb->'job'->>'jobId' IS DISTINCT FROM input->>'jobId' THEN RETURN jsonb_build_object('ok',false,'code','version_conflict'); END IF;
  SELECT * INTO row FROM xtreme_avatar.job_attachments WHERE user_id=actor AND request_id=(input->>'requestId')::uuid;
  IF row.attachment_id IS NOT NULL THEN
   IF row.organization_id=org AND row.job_id IS NOT DISTINCT FROM input->>'jobId' AND row.event_ref=ref AND row.file_name=input->>'fileName' AND row.mime_type=input->>'mimeType' AND row.byte_size=(input->>'byteSize')::integer
    THEN RETURN jsonb_build_object('ok',true,'row',to_jsonb(row),'replayed',true);
   ELSE RETURN jsonb_build_object('ok',false,'code','duplicate_request'); END IF;
  END IF;
  IF input->>'mimeType' NOT IN ('image/jpeg','image/png','image/webp','application/pdf') OR (input->>'byteSize')::integer NOT BETWEEN 1 AND 4000000
   OR length(input->>'fileName') NOT BETWEEN 1 AND 160 OR input->>'fileName' ~ '[\\/]' THEN RETURN jsonb_build_object('ok',false,'code','invalid_file'); END IF;
  SELECT count(*) INTO n FROM xtreme_avatar.job_attachments WHERE user_id=actor AND event_ref=ref AND status NOT IN ('deleted','failed');
  IF n>=10 THEN RETURN jsonb_build_object('ok',false,'code','file_limit'); END IF;
  SELECT coalesce(sum(byte_size),0) INTO used FROM xtreme_avatar.job_attachments WHERE user_id=actor AND status NOT IN ('deleted','failed');
  IF used+(input->>'byteSize')::integer>200000000 THEN RETURN jsonb_build_object('ok',false,'code','storage_limit'); END IF;
  item_id:=gen_random_uuid();ext:=CASE input->>'mimeType' WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' ELSE 'pdf' END;
  INSERT INTO xtreme_avatar.job_attachments(attachment_id,user_id,organization_id,event_ref,job_id,request_id,file_name,mime_type,byte_size,object_name)
   VALUES(item_id,actor,org,ref,input->>'jobId',(input->>'requestId')::uuid,input->>'fileName',input->>'mimeType',(input->>'byteSize')::integer,
    org::text||'/'||actor::text||'/'||ref||'/'||item_id::text||'.'||ext) RETURNING * INTO row;
  RETURN jsonb_build_object('ok',true,'row',to_jsonb(row),'replayed',false);
 END IF;
 SELECT * INTO row FROM xtreme_avatar.job_attachments WHERE attachment_id=(input->>'id')::uuid AND user_id=actor AND organization_id=org AND event_ref=ref FOR UPDATE;
 IF row.attachment_id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','attachment_missing'); END IF;
 IF operation='claim' THEN
  IF row.status='ready' THEN
   IF row.sha256 IS DISTINCT FROM input->>'sha256' THEN RETURN jsonb_build_object('ok',false,'code','attachment_changed'); END IF;
   RETURN jsonb_build_object('ok',true,'row',to_jsonb(row),'replayed',true); END IF;
  IF row.status!='reserved' THEN RETURN jsonb_build_object('ok',false,'code','attachment_busy'); END IF;
  IF input->>'sha256' IS NULL OR input->>'sha256' !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('ok',false,'code','invalid_file'); END IF;
  UPDATE xtreme_avatar.job_attachments SET status='uploading',sha256=input->>'sha256',upload_nonce=gen_random_uuid(),upload_expires_at=now()+interval '3 minutes',version=version+1,updated_at=now()
   WHERE attachment_id=row.attachment_id RETURNING * INTO row;
 ELSIF operation='finish' THEN
  IF row.status='ready' AND row.sha256=input->>'sha256' THEN RETURN jsonb_build_object('ok',true,'row',to_jsonb(row),'replayed',true); END IF;
  IF row.status!='uploading' OR row.upload_nonce::text IS DISTINCT FROM input->>'lease' OR row.sha256 IS DISTINCT FROM input->>'sha256'
   OR row.byte_size!=(input->>'byteSize')::integer OR row.mime_type IS DISTINCT FROM input->>'mimeType' THEN RETURN jsonb_build_object('ok',false,'code','attachment_changed'); END IF;
  UPDATE xtreme_avatar.job_attachments SET status='ready',version=version+1,updated_at=now()
   WHERE attachment_id=row.attachment_id RETURNING * INTO row;
 ELSIF operation='delete_begin' THEN
  IF row.status='deleted' THEN RETURN jsonb_build_object('ok',true,'row',to_jsonb(row)); END IF;
  IF row.version!=(input->>'version')::integer THEN RETURN jsonb_build_object('ok',false,'code','attachment_changed'); END IF;
  IF row.status='uploading' THEN RETURN jsonb_build_object('ok',false,'code','attachment_busy'); END IF;
  IF row.status!='deleting' THEN UPDATE xtreme_avatar.job_attachments SET status='deleting',version=version+1,updated_at=now() WHERE attachment_id=row.attachment_id RETURNING * INTO row; END IF;
 ELSIF operation='delete_finish' THEN
  IF row.status='deleted' THEN RETURN jsonb_build_object('ok',true,'row',to_jsonb(row)); END IF;
  IF row.status!='deleting' OR row.version!=(input->>'version')::integer THEN RETURN jsonb_build_object('ok',false,'code','attachment_changed'); END IF;
  UPDATE xtreme_avatar.job_attachments SET status='deleted',version=version+1,updated_at=now() WHERE attachment_id=row.attachment_id RETURNING * INTO row;
 END IF;
 RETURN jsonb_build_object('ok',true,'row',to_jsonb(row));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation OR not_null_violation THEN
 RETURN jsonb_build_object('ok',false,'code','invalid_file');
END $$;
REVOKE ALL ON FUNCTION xtreme_avatar_private.file_mutation(text,jsonb) FROM PUBLIC,anon,authenticated;
COMMENT ON FUNCTION xtreme_avatar_private.file_mutation(text,jsonb) IS 'Server-only reviewed file lifecycle; no user/API execute grant. Fresh claims are set only by verified Edge adapter.';
-- Proxy-only: signature-checked files never bypass download-only response headers.
CREATE POLICY xtreme_job_files_proxy_only ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
 USING(bucket_id!='xtreme-avatar-job-files') WITH CHECK(bucket_id!='xtreme-avatar-job-files');
