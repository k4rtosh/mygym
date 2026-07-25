# MyGym

PWA-дневник тренировок: облачный аккаунт (Supabase), шаблоны, календарь план/факт, прогресс по упражнениям.

Один репозиторий — **два канала**:

| Канал | Как пользоваться |
|--------|------------------|
| **Web** | [k4rtosh.github.io/mygym](https://k4rtosh.github.io/mygym/) — браузер или «На экран Домой» |
| **Android** | APK через Capacitor (см. ниже) |

Аккаунт и данные общие (Supabase). Версия: **2.5.0** (`version.json`).

## Возможности

- Регистрация / вход (email + пароль), данные в Postgres + RLS
- Шаблоны (фильтр по мышцам и оборудованию)
- Активная тренировка: подходы, таймеры, черновик в IndexedDB
- Календарь: план / выполнено / пропуск
- Прогресс: графики веса и объёма; для BW — «доп. вес»
- Каталог ~188 упражнений (свободный вес, блочный, хаммер, тренажёр, BW, кардио)
- Профиль: экспорт/импорт, демо-данные, обновление кэша PWA

## Стек

Vanilla JS · Bootstrap 5 · Chart.js · Service Worker · Supabase · **Capacitor 7** (Android)

## Локальный запуск (web)

```bash
npm start
# или: npx --yes serve -l 5500
```

Открой `http://localhost:5500`.  
GitHub Pages: путь `/mygym/` — `BASE_PATH` определяется автоматически.

## Android APK (для друзей)

Нужны: [Node.js](https://nodejs.org/), [Android Studio](https://developer.android.com/studio) (JDK + SDK).

```bash
npm install
npm run cap:sync          # www/ + sync в android/
npm run cap:open          # открыть Android Studio → Run
# или из командной строки:
cd android
.\gradlew.bat assembleDebug
```

Готовый файл:

`android/app/build/outputs/apk/debug/app-debug.apk`

Установка на телефон: разрешить установку из неизвестных источников → открыть APK.

После правок веб-кода всегда:

```bash
npm run cap:sync
```

и пересобери APK.

## Supabase

Проект: **mygym** (`gkcjwunfgzhidqyyhhik`).  
Ключ: `js/config.js` (publishable).  
Схема/сид: `supabase/`. Подробнее — [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

## Структура

| Путь | Назначение |
|------|------------|
| `index.html`, `js/`, `pages/`, `css/` | Web / PWA (деплой на Pages) |
| `www/` | Копия для Capacitor (генерируется, в git нет) |
| `android/` | Нативный Android-проект |
| `capacitor.config.json` | Конфиг Capacitor |
| `scripts/build-www.js` | Сборка `www/` |
| `data/exercises.json` | Каталог упражнений |

## Скрипты каталога

```bash
node scripts/expand-exercises.js
node scripts/normalize-equipment.js
node scripts/add-traps.js
# MYGYM_DB_PASSWORD=... node scripts/seed-exercises.js
```
