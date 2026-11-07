-- Admin-only list of accounts, and messages sent from the public contact page.
-- Additive. Only admins can read either; anyone may send a message, but only
-- through submit_contact_message, which validates and rate-limits it.

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text not null check (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  -- True only when a signed-in person used their own account's address.
  email_verified boolean not null default false,
  subject text not null check (char_length(btrim(subject)) between 3 and 120),
  message text not null check (char_length(btrim(message)) between 10 and 5000),
  status text not null default 'new' check (status in ('new', 'handled')),
  created_at timestamptz not null default now()
);
create index contact_messages_recent_idx on public.contact_messages (created_at desc);
create index contact_messages_email_idx on public.contact_messages (lower(email), created_at desc);

alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated;
grant select on public.contact_messages to authenticated;
create policy "admins read contact messages" on public.contact_messages for select to authenticated using (public.is_admin());

create function public.submit_contact_message(p_email text, p_subject text, p_message text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_account_email text;
begin
  if (select count(*) from public.contact_messages where lower(email) = v_email and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from public.contact_messages where created_at > now() - interval '1 hour') >= 100 then
    raise exception 'contact_rate_limited';
  end if;
  if uid is not null then
    select lower(email) into v_account_email from auth.users where id = uid and email_confirmed_at is not null;
  end if;
  begin
    insert into public.contact_messages (user_id, email, email_verified, subject, message)
    values (uid, v_email, v_account_email is not null and v_account_email = v_email, btrim(p_subject), btrim(p_message));
  exception
    when check_violation or not_null_violation then raise exception 'contact_invalid';
  end;
end $$;

create function public.set_contact_message_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_status not in ('new', 'handled') then raise exception 'invalid_status'; end if;
  update public.contact_messages set status = p_status where id = p_id;
  perform public.audit('contact.' || p_status, 'contact_message', p_id::text, '{}');
end $$;

-- auth.users isn't readable through the API; admins get this narrow view of it.
create function public.admin_list_users(p_limit int default 200)
returns table (id uuid, email text, email_confirmed boolean, display_name text, github_username text, organization text, joined_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  return query
    select u.id, u.email::text, u.email_confirmed_at is not null, p.display_name, p.github_username,
           (select o.name from public.organization_members m join public.organizations o on o.id = m.organization_id
             where m.user_id = u.id order by m.created_at limit 1),
           u.created_at, u.last_sign_in_at
    from auth.users u left join public.profiles p on p.id = u.id
    order by u.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end $$;

-- People's data export now includes their contact messages.
create or replace function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at) from auth.users u where u.id = uid),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = uid),
    'roles', coalesce((select jsonb_agg(r.role) from public.user_roles r where r.user_id = uid), '[]'),
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object('role', m.role, 'organization', to_jsonb(o)))
      from public.organization_members m join public.organizations o on o.id = m.organization_id
      where m.user_id = uid), '[]'),
    'office_claims', coalesce((select jsonb_agg(to_jsonb(c)) from public.office_claims c where c.claimed_by = uid), '[]'),
    'reports_filed', coalesce((select jsonb_agg(to_jsonb(r)) from public.moderation_reports r where r.reporter_id = uid), '[]'),
    'contact_messages', coalesce((select jsonb_agg(to_jsonb(c)) from public.contact_messages c where c.user_id = uid), '[]')
  );
end $$;

revoke all on function public.submit_contact_message(text, text, text) from public;
revoke all on function public.set_contact_message_status(uuid, text) from public, anon;
revoke all on function public.admin_list_users(int) from public, anon;
grant execute on function public.submit_contact_message(text, text, text) to anon, authenticated;
grant execute on function public.set_contact_message_status(uuid, text) to authenticated;
grant execute on function public.admin_list_users(int) to authenticated;
