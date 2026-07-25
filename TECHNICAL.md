# MyGym — технический документ (актуально на v2.5.0)

## 1. Общая информация

| | |
|--|--|
| Название | **MyGym** |
| Тип | PWA + Android (Capacitor 7) |
| Стек | Vanilla JS, Bootstrap 5, Chart.js, Service Worker, Supabase Auth/Postgres, Capacitor |
| Пользователи | Пет-проект: автор + друзья (общий облачный аккаунт) |
| Репозиторий | https://github.com/k4rtosh/mygym |
| Web | https://k4rtosh.github.io/mygym/ |
| Android | Debug APK через GitHub Actions (Artifacts / Releases) |
| Версия | `version.json` → **2.5.0**, Android `versionName` 2.5.0 |

## 2. Цели и ограничения

- Дневник тренировок: шаблоны, активная сессия, история, календарь план/факт, прогресс.
- Один код для web и APK; данные в Supabase (не локальный PIN).
- Без «тяжёлой» разработки: без TypeScript/React; минимальный native-слой.

## 3. Два канала доставки

```
Исходники (корень репо)
    ├── GitHub Pages  →  /mygym/  (BASE_PATH=/mygym, SW включён)
    └── Capacitor www/ → Android APK (BASE_PATH='', SW выключен)
              └── данные → один и тот же Supabase
```

`js/config.js` выставляет `BASE_PATH` и `IS_NATIVE`.  
SW регистрируется только в браузере: `(BASE_PATH)/sw.js`.

## 4. Структура проекта

```
mygym/
  index.html, app.js, sw.js, manifest.json, version.json
  css/style.css
  js/          — auth, api, db, router, templates, workout, history,
                 exercises, calendar, progress, demoData, sync, config…
  pages/       — HTML-фрагменты (home, login, profile, …)
  data/exercises.json
  icons/       — favicon / PWA icons
  android/     — Capacitor Android (com.k4rtosh.mygym)
  www/         — генерируется (gitignore), webDir Capacitor
  scripts/     — build-www, seed/expand/normalize exercises
  supabase/    — schema.sql, seed_exercises.sql
  .github/workflows/android-apk.yml
  capacitor.config.json
  README.md, SUPABASE_SETUP.md, TECHNICAL.md
```

## 5. Данные

### 5.1 Supabase (source of truth)

Таблицы (RLS по `auth.uid()`):

- `profiles` — display_name, created_at (триггер при signup)
- `exercises` — каталог (~188), поля: id, name, category, muscle, **type** (оборудование), description
- `templates` — шаблоны пользователя (JSON упражнений: упорядоченный список `exerciseId`)
- `sessions` — завершённые/черновые тренировки (sets: `{ weight, reps }`)
- `planned_workouts` — план на дату (1 день = 1 тренировка)

Клиент: publishable key в `js/config.js`. Пароль БД в клиент **не** попадает.

### 5.2 IndexedDB (локально)

- Черновик активной тренировки
- Кэш каталога упражнений

### 5.3 Оборудование (`exercises.type`)

`Свободный вес` | `Блочный` | `Хаммер` | `Тренажёр` | `Собственный вес` | `Кардио`

Для `Собственный вес` в логе поле `weight` = **доп. кг** (0 = без довеска).

### 5.4 Сессия (упрощённо)

```js
{
  id, userId, templateId, templateName, date,
  startTime, endTime, duration, completed, notes,
  exercises: [{
    exerciseId, completed, exerciseTime,
    sets: [{ weight, reps }]
  }]
}
```

Плановые sets/reps в шаблоне **не** хранятся — только порядок упражнений.

## 6. Функциональность

| Модуль | Файл | Назначение |
|--------|------|------------|
| Auth | `auth.js` | email/password Supabase |
| API | `api.js` | CRUD cloud |
| DB | `db.js` | IndexedDB draft/cache |
| Router | `router.js` | экраны |
| Templates | `templates.js` | шаблоны, пикер с фильтрами мышца/оборудование |
| Workout | `workout.js` | активная тренировка, таймеры, BW-лейбл |
| Calendar | `calendar.js` | план / факт / пропуск |
| Progress | `progress.js` | Chart.js вес + объём |
| History | `history.js` | список/деталь |
| Sync | `sync.js` | экспорт JSON / импорт старого бэкапа |
| Demo | `demoData.js` | тестовые данные |

## 7. UI / дизайн

- Тёмная тема, Manrope/Sora, акцент `#ff5a6a`
- Persistent bottom nav (`#shell-nav`)
- Кнопки: flex + `gap` между иконкой и текстом

## 8. PWA

- `manifest.json` — relative `start_url` (`./?v=…`)
- `sw.js` — shell cache с учётом BASE_PATH; network-first для Supabase / CDN / `data/`

## 9. Android

- Capacitor 7, `appId` `com.k4rtosh.mygym`
- Сборка: `npm run cap:sync` → `gradlew assembleDebug`
- CI: `.github/workflows/android-apk.yml` → artifact `mygym-android-apk`, при успехе — GitHub Release
- Иконки/splash из `resources/` + `@capacitor/assets`

### Где скачать APK

1. Успешный run: Actions → Build Android APK → внизу **Artifacts** → `mygym-android-apk` (zip с `.apk`)  
   Пример: https://github.com/k4rtosh/mygym/actions/runs/30152356177  
2. Либо вкладка **Releases** (если workflow опубликовал релиз)

## 10. Деплой web

```bash
git push origin main
```

GitHub Pages обновляется за 1–2 минуты.  
Путь `/mygym/` обязателен для BASE_PATH и SW.

## 11. Соглашения

- Vanilla ES6+, без TypeScript
- Классы `*Manager`, экспорт на `window`
- Bootstrap 5 CDN + `css/style.css`
- Toast через `Utils.showToast()`
