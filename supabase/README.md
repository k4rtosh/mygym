# Supabase assets for MyGym

Prefer running `seed_exercises.sql` as project owner / service role in SQL Editor.

## Migrations (existing projects)

Apply in order if upgrading an older DB:

1. `migrations/20260727_body_metrics.sql` — `birth_date`, `body_weight_entries`
2. `migrations/20260804_coach_goal.sql` — `profiles.coach_goal`
3. `migrations/20260804_coach_inbox.sql` — `profiles.coach_inbox`

Full greenfield schema: `schema.sql`.

## Edge Functions

Optional LLM rewrite of coach cards:

```bash
supabase functions deploy coach-enrich
# optional secret for OpenAI (or leave unset → passthrough stub)
supabase secrets set OPENAI_API_KEY=sk-...
```

See `functions/coach-enrich/README.md`. Client flag: `COACH_LLM_ENABLED` in `js/config.js`.
