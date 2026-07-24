# Supabase — статус для проекта mygym

URL: `https://gkcjwunfgzhidqyyhhik.supabase.co`  
Ключ в приложении: `js/config.js` (publishable)

## Уже сделано автоматически

- Таблицы: `profiles`, `exercises`, `templates`, `sessions`, `planned_workouts`
- RLS + триггер создания профиля при регистрации
- В каталог залито **98 упражнений**

## Осталось сделать тебе в Dashboard (1 минута)

Сейчас регистрация создаёт пользователя, но **сессия не выдаётся**, пока не подтверждена почта.

1. Открой: https://supabase.com/dashboard/project/gkcjwunfgzhidqyyhhik/auth/providers
2. **Email** → выключи **Confirm email**
3. Save

После этого регистрация в MyGym сразу пускает в приложение (удобно для тебя и друзей).

## Проверка

1. Открой приложение
2. Регистрация: имя + email + пароль (≥6)
3. Должна открыться главная
4. В Dashboard → Table Editor → `profiles` появится строка

## Безопасность

Пароль от БД **не** лежит в коде приложения (только publishable key).  
Раз пароль светился в чате — позже лучше сменить его в Supabase → Project Settings → Database.
