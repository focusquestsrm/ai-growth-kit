-- Keep one invitation record per email so retries and concurrent submissions
-- cannot create duplicate pending invitations.

with ranked_invitations as (
  select id,
    row_number() over (
      partition by normalized_email
      order by (auth_invited_at is not null) desc, (accepted_at is not null) desc, created_at desc
    ) as duplicate_rank
  from public.platform_invitations
)
delete from public.platform_invitations invitation
using ranked_invitations ranked
where invitation.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists platform_invitations_normalized_email_unique
  on public.platform_invitations(normalized_email);
