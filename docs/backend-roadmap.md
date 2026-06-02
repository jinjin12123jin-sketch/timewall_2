# Backend Roadmap

Timewall does not need a custom backend until the product promises cross-device persistence, public sharing, reminders, collaboration, or payment.

## Recommended Backend Stack

For this product, a small managed backend is enough:

- Supabase Auth for accounts.
- Supabase Postgres for records.
- Row-level security so each user only reads and writes their own wall.
- Next.js route handlers only where server-side validation or share-link generation is needed.

## Suggested Data Model

`profiles`

- `id`: user id
- `created_at`: timestamp

`timewall_days`

- `user_id`: owner
- `date_key`: `YYYY-MM-DD`
- `blocks`: array of 8 numbers
- `locked`: boolean
- `updated_at`: timestamp

`timewall_preferences`

- `user_id`: owner
- `theme_id`: selected color theme
- `labels`: array of 4 text labels
- `updated_at`: timestamp

`shared_reports`

- `id`: public id
- `user_id`: owner
- `week_start`: `YYYY-MM-DD`
- `snapshot`: frozen report data
- `created_at`: timestamp

## Implementation Order

1. Keep local mode as the default.
2. Add optional sign in.
3. After sign in, sync local data upward once, then merge by `updated_at`.
4. Add explicit conflict behavior before silent overwrites.
5. Add public report links only after sync is stable.

## Product Trigger

Build this backend only when test users say things like:

- "I want to keep using this on my phone and laptop."
- "I'm worried I will lose my records."
- "Can I send this weekly report as a link?"
- "Can I pay to keep years of history?"
