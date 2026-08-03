# MyGym

PWA-дневник тренировок: облачный аккаунт (Supabase), шаблоны, календарь план/факт, прогресс.

Один репозиторий — **два канала** (общие аккаунты и данные):

| Канал | Как пользоваться |
|--------|------------------|
| **Web** | [k4rtosh.github.io/mygym](https://k4rtosh.github.io/mygym/) |
| **Android** | Debug APK из GitHub Actions (см. ниже) |

Версия: **0.7.0**. Подробности архитектуры — [TECHNICAL.md](TECHNICAL.md).

## Где скачать APK

Готовая сборка уже есть:

1. Открой успешный run:  
   **https://github.com/k4rtosh/mygym/actions/runs/30152356177**
2. Внизу страницы → **Artifacts** → **`mygym-android-apk`** (~3.7 MB)
3. Скачается **zip** — внутри файл `MyGym-*.apk`
4. На телефоне: разреши установку из неизвестных источников → открой APK

Нужен вход в GitHub (artifacts приватны для скачивания без логина).  
Также смотри вкладку [Releases](https://github.com/k4rtosh/mygym/releases) после следующих сборок.

Пересобрать: **Actions** → **Build Android APK** → **Run workflow**.

## Возможности

- Регистрация / вход (email + пароль), Postgres + RLS
- Шаблоны: фильтр по мышцам и оборудованию
- Активная тренировка: подходы, таймеры, черновик в IndexedDB
- Календарь: план / выполнено / пропуск (1 день = 1 тренировка)
- Прогресс: графики веса и объёма; BW → поле «доп. вес»
- Каталог ~188 упражнений (свободный вес, блочный, хаммер, тренажёр, BW, кардио)
- Профиль: экспорт/импорт JSON, демо-данные, сброс кэша PWA

## Стек

Vanilla JS · Bootstrap 5 · Chart.js · Service Worker · Supabase · Capacitor 7

## Локальный запуск (web)

```bash
npm start
# http://localhost:5500
```

GitHub Pages: база `/mygym/` (`BASE_PATH` в `js/config.js`).

## Android вручную (опционально)

Нужны Node + Android Studio/SDK. Обычно **не нужно** — достаточно CI.

```bash
npm install
npm run cap:sync
cd android && ./gradlew assembleDebug   # Windows: gradlew.bat
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

## Supabase

Проект **mygym** (`gkcjwunfgzhidqyyhhik`).  
Ключ: `js/config.js`. Схема/сид: `supabase/`.  
Настройка Auth: [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

## Структура (кратко)

| Путь | Назначение |
|------|------------|
| `js/`, `pages/`, `css/` | Web / PWA |
| `android/` | Capacitor Android |
| `www/` | webDir (генерируется, не в git) |
| `data/exercises.json` | Каталог упражнений |
| `TECHNICAL.md` | Техническое описание |

## Скрипты каталога

```bash
node scripts/expand-exercises.js
node scripts/normalize-equipment.js
node scripts/add-traps.js
# MYGYM_DB_PASSWORD=... node scripts/seed-exercises.js
```
