# MyGym

PWA-дневник тренировок: облачный аккаунт (Supabase), шаблоны, календарь план/факт, прогресс и **коуч**.

Один репозиторий — **два канала** (общие аккаунты и данные):

| Канал | Как пользоваться |
|--------|------------------|
| **Web** | [k4rtosh.github.io/mygym](https://k4rtosh.github.io/mygym/) |
| **Android** | Debug APK из [Releases](https://github.com/k4rtosh/mygym/releases/latest) или Actions |

Версия: **1.3.2**. Архитектура — [TECHNICAL.md](TECHNICAL.md). Перед релизом — [docs/SMOKE.md](docs/SMOKE.md).

## Где скачать APK

1. [Releases → latest](https://github.com/k4rtosh/mygym/releases/latest) → `MyGym-latest-debug.apk`
2. Или **Actions** → **Build Android APK** → Artifacts → `mygym-android-apk` (нужен логин GitHub)

Пересобрать: **Actions** → **Build Android APK** → **Run workflow**.

## Возможности

- Регистрация / вход (email + пароль), Postgres + RLS
- Шаблоны: фильтр по мышцам и оборудованию; порядок — drag-and-drop
- Активная тренировка: подходы, таймеры, черновик в IndexedDB
- Календарь: план / выполнено / пропуск (1 день = 1 тренировка)
- Прогресс: графики; BW → «доп. вес»; **Коуч** (правила по цели и дневнику; опциональный LLM-rewrite)
- Каталог **185** упражнений
- Профиль: экспорт/импорт JSON (сессии, шаблоны, план, вес, цель коуча), демо-данные, сброс кэша PWA

## Стек

Vanilla JS · Bootstrap 5 · Chart.js · Service Worker · Supabase · Capacitor 7

## Локальный запуск (web)

```bash
npm start
# http://localhost:5500
```

GitHub Pages: база `/mygym/` (`BASE_PATH` в `js/config.js`).

## Android вручную (опционально)

```bash
npm install
npm run sync:version
npm run cap:sync
cd android && ./gradlew assembleDebug   # Windows: npm run android:apk:win
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

## Supabase

Проект **mygym** (`gkcjwunfgzhidqyyhhik`).  
Ключ: `js/config.js`. Схема/миграции/сид: `supabase/`.  
Auth: [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

Опциональный LLM: Edge Function `coach-enrich` — флаг `COACH_LLM_ENABLED` в `config.js` (по умолчанию выкл.).

## Структура (кратко)

| Путь | Назначение |
|------|------------|
| `js/`, `pages/` (`login`/`home`/`profile`), `css/` | Web / PWA |
| `js/analytics/` | Domain: insights, coach, вес, adherence |
| `android/` | Capacitor Android |
| `www/` | webDir (генерируется `build-www.js`, не в git) |
| `data/exercises.json` | Каталог (demo fallback + seed) |
| `supabase/` | schema, migrations, `functions/coach-enrich` |
| `TECHNICAL.md` | Полное техописание |
| `docs/SMOKE.md` | Чеклист перед релизом |

## Скрипты

```bash
node scripts/sync-android-version.js   # version.json → gradle + config
node scripts/build-www.js              # www/ для Capacitor
# MYGYM_DB_PASSWORD=... node scripts/seed-exercises.js
```

Одноразовые правки каталога (уже применены) — в `scripts/legacy/`.
