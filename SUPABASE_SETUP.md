# Supabase — MyGym

URL: `https://gkcjwunfgzhidqyyhhik.supabase.co`  
Ключ в приложении: `js/config.js` (publishable / anon)

## Схема

Таблицы:

- `profiles` — в т.ч. `display_name`, `birth_date`, `coach_goal`, `coach_inbox`
- `exercises` — каталог (~185)
- `templates`, `sessions`, `planned_workouts`
- `body_weight_entries`

RLS + триггер профиля при регистрации.  
Инкрементальные миграции: `supabase/migrations/`. Полная схема: `supabase/schema.sql`.

## Auth

Email Auth; для пет-проекта обычно **Confirm email** выключен (иначе после signup нет сессии).

1. https://supabase.com/dashboard/project/gkcjwunfgzhidqyyhhik/auth/providers  
2. Email → выключи **Confirm email** → Save

## Edge Functions (опционально)

`coach-enrich` — rewrite title/body карточек коуча. См. `supabase/functions/coach-enrich/`.  
Клиент: `COACH_LLM_ENABLED` в `js/config.js`. Секрет `OPENAI_API_KEY` (или другой провайдер после доработки функции).

## Проверка

1. Web или APK → регистрация (имя + email + пароль ≥6)
2. Открывается главная
3. Dashboard → Table Editor → `profiles` — новая строка

## Клиенты

| Клиент | Как ходит в API |
|--------|------------------|
| GitHub Pages PWA | браузер, SW, `BASE_PATH=/mygym` |
| Android APK | Capacitor WebView, тот же publishable key |

## Безопасность

- В клиенте только publishable key (не DB password).
- RLS: пользователи видят только свои templates/sessions/plans/вес.
- Пароль БД / service role никогда в репозиторий.
