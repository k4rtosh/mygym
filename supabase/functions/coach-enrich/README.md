# coach-enrich

Optional LLM rewrite for MyGym rule-coach cards.

## Contract

**POST** `/functions/v1/coach-enrich`

```json
{
  "facts": { "locale": "ru", "goal": {}, "cards": [] },
  "cards": [{ "id": "coach-brief", "title": "...", "body": "...", "severity": "info" }]
}
```

**Response**

```json
{
  "cards": [{ "id": "coach-brief", "title": "...", "body": "..." }]
}
```

- Same `id`s only — no new cards, no chat.
- Client merges title/body; keeps severity/cta/meta from rules.
- Without `OPENAI_API_KEY` the function echoes input (safe stub).

## Client flag

In `js/config.js`:

```js
COACH_LLM_ENABLED: false,  // flip on after deploy
COACH_LLM_URL: '',         // empty → SUPABASE_URL/functions/v1/coach-enrich
COACH_LLM_TIMEOUT_MS: 2500
```

## Deploy

```bash
supabase functions deploy coach-enrich
supabase secrets set OPENAI_API_KEY=sk-...   # optional
```
