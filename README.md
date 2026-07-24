# MyGym

PWA-дневник тренировок: облачный аккаунт (Supabase), шаблоны, календарь план/факт, прогресс по упражнениям.

**Live:** [k4rtosh.github.io/mygym](https://k4rtosh.github.io/mygym/) · репозиторий [k4rtosh/mygym](https://github.com/k4rtosh/mygym)

Версия: см. `version.json` (сейчас **2.4.2**).

## Возможности

- Регистрация / вход (email + пароль), данные в Postgres + RLS
- Шаблоны тренировок (порядок упражнений, мульти-добавление, фильтр по мышцам и оборудованию)
- Активная тренировка: подходы, таймеры, rest timer, черновик в IndexedDB, продолжение после перезагрузки
- Календарь: 1 день = 1 тренировка, статусы план / выполнено / пропуск
- Прогресс: графики макс. веса (или доп. веса для BW) и объёма
- Каталог **~188 упражнений**: свободный вес, блочный, хаммер, тренажёр, собственный вес, кардио
- Для BW в логе — поле «Доп. вес» (0 = без довеска)
- Профиль: экспорт JSON, импорт старого бэкапа в облако, демо-данные, обновление кэша PWA

## Стек

Vanilla JS · Bootstrap 5 · Bootstrap Icons · Chart.js · Service Worker · Supabase Auth + Postgres

## Локальный запуск

```bash
npx --yes serve -l 5500
```

Открой `http://localhost:5500`.  
На GitHub Pages база пути `/mygym/` — как в `sw.js` и `manifest.json`.

## Supabase

Проект: **mygym** (`gkcjwunfgzhidqyyhhik`).  
Ключ приложения: `js/config.js` (publishable).  
Схема и сид: `supabase/schema.sql`, `supabase/seed_exercises.sql`.

Подробности по Auth и Dashboard — [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

## Структура

| Путь | Назначение |
|------|------------|
| `index.html` | Оболочка PWA + нижняя навигация |
| `js/` | Auth, API, workout, templates, calendar, progress… |
| `pages/` | HTML-фрагменты экранов |
| `data/exercises.json` | Каталог упражнений (зеркало сида) |
| `scripts/` | Expand / normalize / seed каталога |
| `icons/` | Favicon и иконки PWA |

## Скрипты каталога

```bash
node scripts/expand-exercises.js      # разовое расширение (идемпотентно по id)
node scripts/normalize-equipment.js   # типы оборудования + хаммер
node scripts/add-traps.js             # трапеции
# MYGYM_DB_PASSWORD=... node scripts/seed-exercises.js
```
