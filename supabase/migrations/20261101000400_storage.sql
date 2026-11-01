-- Organisation logos: public read, owners/admins of the organisation write
-- into "<organization_id>/logo.<ext>" only. Size and type limits are enforced
-- by the bucket itself, not just the UI.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-logos', 'org-logos', true, 524288, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "org logos are public" on storage.objects for select
  using (bucket_id = 'org-logos');

create policy "org owners upload logos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'org-logos'
    and name ~ '^[0-9a-f-]{36}/logo\.(png|jpe?g|webp)$'
    and public.is_org_member(public.safe_uuid((storage.foldername(name))[1]), array['owner', 'admin']::public.member_role[])
  );

create policy "org owners replace logos" on storage.objects for update to authenticated
  using (
    bucket_id = 'org-logos'
    and public.is_org_member(public.safe_uuid((storage.foldername(name))[1]), array['owner', 'admin']::public.member_role[])
  );

create policy "org owners delete logos" on storage.objects for delete to authenticated
  using (
    bucket_id = 'org-logos'
    and public.is_org_member(public.safe_uuid((storage.foldername(name))[1]), array['owner', 'admin']::public.member_role[])
  );
