# Supabase — MyGym

URL: `https://gkcjwunfgzhidqyyhhik.supabase.co`  
Ключ в приложении: `js/config.js` (publishable / anon)

## Сделано

- Таблицы: `profiles`, `exercises`, `templates`, `sessions`, `planned_workouts`
- RLS + триггер профиля при регистрации
- Каталог **~188 упражнений** (типы оборудования нормализованы)
- Email Auth; для пет-проекта обычно **Confirm email** выключен (иначе после signup нет сессии)

## Auth (если снова спросит подтверждение почты)

1. https://supabase.com/dashboard/project/gkcjwunfgzhidqyyhhik/auth/providers  
2. Email → выключи **Confirm email** → Save

## Проверка

1. Web или APK → регистрация (имя + email + пароль ≥6)
2. Открывается главная
3. Dashboard → Table Editor → `profiles` — новая строка

## Клиенты

| Клиент | Как ходит в API |
|--------|------------------|
| GitHub Pages PWA | браузер, SW, BASE_PATH=`/mygym` |
| Android APK | Capacitor WebView, тот же publishable key |

## Безопасность

- В клиенте только publishable key (не DB password).
- Если пароль БД светился в чатах — смени в Project Settings → Database.
- RLS обязателен: пользователи видят только свои templates/sessions/plans.
