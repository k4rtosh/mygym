# MyGym — технический обзор проекта

> Документ для разработчиков и ИИ-агентов. Описывает актуальную архитектуру, данные, модули, деплой и соглашения.  
> Версия документа соответствует релизу **1.3.1** (см. `version.json`, `js/config.js`).

---

## Содержание

1. [Что это за проект](#1-что-это-за-проект)
2. [Архитектура высокого уровня](#2-архитектура-высокого-уровня)
3. [Каналы доставки: Web и Android](#3-каналы-доставки-web-и-android)
4. [Структура репозитория](#4-структура-репозитория)
5. [Запуск приложения (bootstrap)](#5-запуск-приложения-bootstrap)
6. [Роутинг и экраны](#6-роутинг-и-экраны)
7. [Слой данных](#7-слой-данных)
8. [Режимы работы: Prod и Demo](#8-режимы-работы-prod-и-demo)
9. [Модули JavaScript](#9-модули-javascript)
10. [Модели данных в приложении](#10-модели-данных-в-приложении)
11. [UI, вёрстка и safe area](#11-ui-вёрстка-и-safe-area)
12. [PWA и Service Worker](#12-pwa-и-service-worker)
13. [Система обновлений](#13-система-обновлений)
14. [Android (Capacitor)](#14-android-capacitor)
15. [CI/CD и релизы](#15-cicd-и-релизы)
16. [Версионирование](#16-версионирование)
17. [Локальная разработка](#17-локальная-разработка)
18. [Безопасность](#18-безопасность)
19. [Соглашения для разработки](#19-соглашения-для-разработки)
20. [Частые проблемы](#20-частые-проблемы)

---

## 1. Что это за проект

| Параметр | Значение |
|----------|----------|
| **Название** | MyGym |
| **Тип** | PWA (Progressive Web App) + нативная оболочка Android через Capacitor 7 |
| **Назначение** | Дневник силовых тренировок: шаблоны, активная сессия, история, календарь план/факт, графики прогресса |
| **Стек** | Vanilla JavaScript (ES6+), Bootstrap 5, Chart.js, Service Worker, Supabase (Auth + Postgres), Capacitor |
| **Бэкенд** | Supabase — единый источник правды для prod-режима |
| **Репозиторий** | https://github.com/k4rtosh/mygym |
| **Web (prod)** | https://k4rtosh.github.io/mygym/ |
| **Android** | Debug APK из GitHub Actions / Releases |
| **Аудитория** | Пет-проект: автор и друзья (общий облачный проект Supabase) |

### Что умеет приложение

- Регистрация и вход (email + пароль) через Supabase Auth
- **Демо-режим** — вход без регистрации (`test` / `test`), данные только локально
- Шаблоны тренировок (порядок упражнений, без плановых подходов/повторов)
- Активная тренировка: подходы, таймеры упражнений, таймер отдыха, заметки
- История тренировок и детальный просмотр
- Календарь: план на день, выполнено, пропуск
- Прогресс: подсказки по дневнику, упражнения, собственный вес, пропуски
- Первичные данные (дата рождения + вес) при первом входе; вес дальше — только после тренировки
- Экспорт/импорт JSON (миграция со старых бэкапов)
- Проверка обновлений (web + APK)

### Сознательные ограничения

- **Без** TypeScript, React, Vue, сборщика (Vite/Webpack) для фронта
- **Без** магазина приложений — APK распространяется вручную (GitHub Releases)
- Один общий Supabase-проект для всех prod-пользователей
- Минимальный native-слой (только StatusBar, SplashScreen)

---

## 2. Архитектура высокого уровня

```
┌─────────────────────────────────────────────────────────────────┐
│                        Пользователь                              │
└────────────┬───────────────────────────────┬────────────────────┘
             │                               │
      ┌──────▼──────┐                 ┌──────▼──────┐
      │  Web (PWA)  │                 │ Android APK │
      │ GitHub Pages│                 │  Capacitor  │
      │ BASE_PATH   │                 │ BASE_PATH=''│
      │  /mygym/    │                 │  + WebView  │
      └──────┬──────┘                 └──────┬──────┘
             │                               │
             └──────────────┬────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │   Один код (HTML/JS/CSS)   │
              │  index.html → app.js       │
              │  js/* + pages/*            │
              └─────────────┬─────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
  ┌──────▼──────┐   ┌───────▼───────┐  ┌──────▼──────┐
  │  IndexedDB  │   │ localStorage  │  │  Supabase   │
  │  (черновик, │   │ (demo-данные, │  │ Auth + DB   │
  │   кэш)      │   │  dismiss upd) │  │ (prod)      │
  └─────────────┘   └───────────────┘  └─────────────┘
```

### Паттерн фронтенда

Это **SPA без фреймворка**:

1. `index.html` — единственная HTML-страница-оболочка (`#app` + `#shell-nav`)
2. `app.js` — точка входа, инициализация
3. `js/router.js` — маршрутизация: подгружает HTML-фрагменты из `pages/` или рендерит через `*Manager`
4. Каждый домен — класс `*Manager` на `window` (TemplatesManager, WorkoutManager, …)
5. `js/api.js` — единый слой обращения к Supabase (в demo подменяется `DemoMode`)

---

## 3. Каналы доставки: Web и Android

| | Web (PWA) | Android (APK) |
|--|-----------|---------------|
| **Источник** | Корень репо → GitHub Pages | `www/` → Capacitor → APK |
| **BASE_PATH** | `/mygym` | `''` (пусто) |
| **IS_NATIVE** | `false` | `true` |
| **Service Worker** | Да (`sw.js`) | Нет |
| **Определение режима** | `js/config.js` → `detectBasePath()` | Capacitor `isNativePlatform()` |
| **Данные** | Supabase или Demo (localStorage) | То же самое |
| **Обновление UI** | Очистка SW-кэша + reload | Скачивание нового APK |

`js/config.js` выставляет `window.MYGYM_CONFIG`:

```js
{
  SUPABASE_URL, SUPABASE_ANON_KEY,
  APP_VERSION,      // текущая вшитая версия
  BASE_PATH,          // '' или '/mygym'
  IS_NATIVE,          // Capacitor?
  url(path)           // helper для путей с BASE_PATH
}
```

---

## 4. Структура репозитория

```
mygym/
├── index.html              # Shell: подключение всех скриптов, shell-nav, SW register
├── app.js                  # Bootstrap: native shell, auth, router, update check
├── sw.js                   # Service Worker (только web)
├── manifest.json           # PWA manifest
├── version.json            # Манифест обновлений (remote source of truth для UpdateCheck)
├── capacitor.config.json   # Capacitor: appId, webDir=www
│
├── css/
│   └── style.css           # Вся кастомная стилизация (тёмная тема, safe area, модалки)
│
├── js/                     # Логика приложения (порядок подключения важен — см. index.html)
│   ├── config.js           # MYGYM_CONFIG, BASE_PATH, APP_VERSION
│   ├── supabaseClient.js   # createClient(SUPABASE_URL, ANON_KEY)
│   ├── utils.js            # Helpers, toast, confirm/prompt/formModal
│   ├── db.js               # IndexedDB: черновик тренировки, кэш упражнений
│   ├── analytics/          # Domain-слой (pure, без DOM)
│   │   ├── profileMetrics.js
│   │   ├── bodyWeight.js
│   │   ├── adherence.js
│   │   ├── insights.js
│   │   ├── coachGoal.js    # Нормализация цели коуча + closePause / inbox
│   │   ├── coach.js        # Rule-коуч: ранжирование, микроплан, лимит карточек
│   │   └── coachEnrich.js  # Опциональный LLM-rewrite (флаг; fallback на правила)
│   ├── demoMode.js         # Demo API/Auth shim (localStorage)
│   ├── api.js              # Supabase CRUD
│   ├── auth.js             # Supabase email/password auth
│   ├── sync.js             # Экспорт/импорт JSON
│   ├── onboarding.js       # Первичные данные + вес после тренировки
│   ├── router.js           # Маршрутизация + history stack + init login/home/profile
│   ├── gestures.js         # Консервативные жесты (агрессивный PTR/swipe убраны)
│   ├── templates.js        # Шаблоны, редактор, picker упражнений
│   ├── workout.js          # Старт/активная/завершение тренировки
│   ├── history.js          # Список и деталь истории
│   ├── exercises.js        # Просмотр каталога упражнений
│   ├── calendar.js         # Календарь план/факт
│   ├── progress.js         # Хаб прогресса + графики Chart.js + Коуч UI
│   ├── demoData.js         # Генерация/очистка тестовых данных
│   └── updateCheck.js      # Проверка version.json, модалка обновления
│
├── pages/                  # HTML-фрагменты (fetch только login/home/profile)
│   ├── login.html
│   ├── home.html
│   └── profile.html
│
├── data/
│   ├── exercises.json      # Локальный каталог (fallback для demo, seed)
│   └── demo-readme.json    # Описание демо-сида (не runtime)
│
├── icons/                  # PWA / favicon
├── resources/              # Исходники для @capacitor/assets (иконки, splash)
│
├── android/                # Capacitor Android проект
│   ├── app/build.gradle    # versionCode, versionName, signing
│   ├── keystores/          # Общий debug keystore (для CI и поверх установки)
│   └── keystore.debug.properties
│
├── www/                    # Генерируется scripts/build-www.js (в .gitignore)
│
├── scripts/
│   ├── build-www.js        # Копия web-ассетов в www/ для Capacitor
│   ├── sync-android-version.js  # version.json → build.gradle + config.js
│   ├── apply-supabase.js   # Вспомогательные SQL-операции
│   ├── seed-exercises.js   # Заливка каталога в Supabase (нужен DB password)
│   └── legacy/             # Одноразовые правки каталога (уже применены)
│
├── supabase/
│   ├── schema.sql          # Таблицы + RLS + триггеры
│   ├── migrations/         # Инкрементальные SQL (existing projects)
│   ├── functions/          # Edge Functions (coach-enrich и др.)
│   ├── seed_exercises.sql
│   └── README.md
│
├── .github/workflows/
│   └── android-apk.yml     # Сборка APK + GitHub Release
│
├── README.md               # Краткая документация для пользователя
├── SUPABASE_SETUP.md       # Настройка Supabase Auth
└── TECHNICAL.md            # Этот файл
```

---

## 5. Запуск приложения (bootstrap)

Порядок в `app.js` → `initApp()`:

```
1. initNativeShell()
   └── Capacitor: StatusBar, SplashScreen, классы is-native / is-native-android на <html>

2. DB.init()                    // IndexedDB

3. UpdateCheck.check()          // Фоновая проверка version.json (не блокирует UI)

4. DemoMode.isDemo()?
   └── activateDemoShims()     // Подмена методов Api/Auth на DemoApi/DemoAuth

5. Auth.init()                  // Восстановление сессии Supabase или demo

6. Если не залогинен → Router.navigate('login')

7. Если demo → showDemoBadge()  // Полоска DEMO под статус-баром

8. DB.loadActiveSession()       // Черновик тренировки (scope: demo / user:id)

9. Prefetch Api.listExercises() → DB.cacheExercises()

10. Если есть незавершённая тренировка → confirm → resume или clear

11. Router.navigate('home')
12. Onboarding.maybePrompt()   // дата рождения + вес, если ещё не заполнены
```

**Важно:** скрипты объявлены как `const Api = …`, `const Auth = …`. Demo-режим **не заменяет** глобальные объекты, а **мутирует их методы** (`DemoMode.activateDemoShims()`), иначе модули продолжат вызывать старые Supabase-методы.

---

## 6. Роутинг и экраны

`Router.navigate(path, params)` — центральная точка навигации.

| path | Источник UI | Менеджер / init |
|------|-------------|-----------------|
| `login` | `pages/login.html` | `initLoginPage()` |
| `home` | `pages/home.html` | `initHomePage()` |
| `profile` | `pages/profile.html` | `initProfilePage()` |
| `templates` | рендер в JS | `TemplatesManager.loadTemplatesList()` |
| `template-edit` | `pages/template-edit.html` + JS | `TemplatesManager.loadTemplateEditor(id)` |
| `workout` | рендер в JS | `WorkoutManager.loadStartWorkout()` |
| `active-workout` | рендер в JS | `WorkoutManager.startActiveWorkout(sessionId)` |
| `history` | рендер в JS | `HistoryManager.loadHistoryList()` |
| `history-detail` | рендер в JS | `HistoryManager.loadHistoryDetail(sessionId)` |
| `exercises` | рендер в JS | `ExercisesManager.loadExercisesList()` |
| `calendar` | рендер в JS | `CalendarManager.load()` |
| `progress` | рендер в JS | `ProgressManager.loadHub()` — категории |
| `progress-exercises` | рендер в JS | графики по упражнениям |
| `progress-body-weight` | рендер в JS | график собственного веса |
| `progress-missed` | рендер в JS | пропуски план/факт |

Нижняя навигация (`#shell-nav`) — постоянная, вне `#app`. Скрывается на `login` через `Utils.hideShellNav()`.

Маршруты привязаны к вкладкам через `Utils.shellNavActiveFor(path)` (все `progress-*` → вкладка «Прогресс»).

**Профиль:** возраст (из `birth_date`) и текущий вес — только просмотр. Редактирования веса в профиле нет.

---

## 7. Слой данных

### 7.1 Supabase (prod) — source of truth

Проект: `gkcjwunfgzhidqyyhhik`  
Схема: `supabase/schema.sql`

| Таблица | Назначение | RLS |
|---------|------------|-----|
| `profiles` | Профиль (`display_name`, `birth_date`) | Только свой |
| `exercises` | Общий каталог упражнений | SELECT для authenticated |
| `templates` | Шаблоны пользователя | CRUD только свои |
| `sessions` | Тренировки (в т.ч. черновики в облаке) | CRUD только свои |
| `planned_workouts` | План на дату (1 день = 1 запись) | CRUD только свои |
| `body_weight_entries` | История веса тела (1 замер / день) | CRUD только свои |

Триггер `on_auth_user_created` создаёт строку в `profiles` при регистрации.

**Ограничение БД:** уникальный индекс `sessions_one_completed_per_day` — не более одной **завершённой** тренировки на пользователя в день.  
**Вес:** unique `(user_id, measured_on)` — upsert при повторном замере в тот же день.

**Миграция существующих проектов:** выполнить `supabase/migrations/20260727_body_metrics.sql` в SQL Editor.

Клиентский ключ: **только** publishable/anon key в `js/config.js`. Пароль БД в клиент не попадает.

### 7.2 IndexedDB (`js/db.js`)

База: `mygym_draft`, store `draft` (key-value).

| Ключ | Содержимое |
|------|------------|
| `activeSessionByScope` | `{ "demo": session, "user:<uuid>": session }` — черновик активной тренировки |
| `exercisesCache` | `{ at, list }` — кэш каталога упражнений |

Черновик хранится **локально** для быстрого восстановления при обрыве связи. Периодически синхронизируется в `sessions` через `Api.upsertSession()`.

Scope черновика (`getActiveScope()`):
- `demo` — в демо-режиме
- `user:<id>` — prod-пользователь
- Разные scope **не пересекаются** (демо-тренировка не попадает в prod-аккаунт)

### 7.3 localStorage (demo)

Префикс `mygym_demo_`:
- `templates`, `sessions`, `planned`, `body_weight` — массивы записей
- `profile` — объект профиля (в т.ч. `birth_date`)

Флаг сессии demo: `sessionStorage.mygym_demo_mode = '1'`
Skip онбординга на сессию: `sessionStorage.mygym_onboarding_skip:<userId>`

### 7.4 Каталог упражнений

Поля: `id`, `name`, `category`, `muscle`, `type`, `description`

**Тип оборудования** (`type`):
`Свободный вес` | `Блочный` | `Хаммер` | `Тренажёр` | `Собственный вес` | `Кардио`

**Категории** (корни для фильтров, ~10):
`Грудные` | `Спина` | `Ноги` | `Плечи` | `Бицепс` | `Трицепс` | `Трапеции` | `Предплечья` | `Кор` | `Кардио`  
Акценты (верх/низ/толщина…) складываются в `muscle`. Нормализация: `node scripts/normalize-exercise-catalog.js`.

Для `Собственный вес`: поле `weight` в подходе = **дополнительный вес** (0 = без довеска).

Источники каталога:
1. Supabase `exercises` (prod)
2. `data/exercises.json` (demo fallback, формат `{ "exercises": [...] }`)
3. IndexedDB кэш

---

## 8. Режимы работы: Prod и Demo

### Prod

- Вход: email + пароль → Supabase Auth
- Данные: Supabase Postgres
- Регистрация на `pages/login.html`

### Demo

- Кнопка **«Войти в демо»** или логин `test` / `test`
- `DemoMode.enableDemo()` + `activateDemoShims()`
- Данные: **localStorage** (не Supabase)
- При входе: `DemoData.seed()` если нет сессий **или** `needsReseed()` (версия сида `SEED_VERSION`)
- Сид v4: ~12 недель, 5 шаблонов (жим/плечи, спина, ноги, руки, кор), сессии, планы с пропусками, вес, `coach_goal` — сценарии для коуча
- Визуальный индикатор: полоска `DEMO · локальные данные` под статус-баром (`body.is-demo-mode`)
- Logout: очистка demo-сессии + `location.reload()` (возврат prod Api/Auth)

**Не путать:** demo-данные не синхронизируются в облако. Для показа продукта друзьям — только demo.

---

## 9. Модули JavaScript

### `config.js`
Определяет `MYGYM_CONFIG` до всех остальных модулей.

### `supabaseClient.js`
`window.supabaseClient = createClient(url, key)`

### `utils.js`
- Форматирование дат/времени
- `escapeHtml`, `generateId`, `debounce`
- `showToast()` — уведомления
- `confirm()`, `prompt()`, `confirmPhrase()`, `formModal()` — **кастомные модалки**
- Управление `#shell-nav`

### `api.js`
Все операции с облаком: профиль, шаблоны, сессии, план, вес тела, прогресс.  
`normalizeSession()` / `normalizeBodyWeight()` приводят snake_case БД к camelCase приложения.  
`birth_date` в профиле **set-once** (повторная смена запрещена на уровне Api).  
In-memory кеш списков (~45 с; каталог упражнений ~10 мин) + dedupe inflight; `invalidateCache` на мутациях.  
`requireUser()` берёт `Auth.currentUser` / `auth.getSession()` (локально), без `getUser()` на каждый вызов.

### `auth.js`
`AuthManager`: signUp, signIn, logout, getCurrentUser, init (restore session).

### `db.js`
`DraftDatabase`: IndexedDB wrapper, scope-aware active session.

### `demoMode.js`
`DemoApi`, `DemoAuth`, `activateDemoShims()`.

### `onboarding.js`
`Onboarding.maybePrompt()` — модалка даты рождения + веса при первом входе (можно «Позже»).  
`Onboarding.promptBodyWeightAfterWorkout()` — опциональный замер после `finishWorkout`.

### `analytics/*` (domain)
Чистые функции без DOM:
- `AnalyticsProfile` — возраст, gaps онбординга
- `AnalyticsBodyWeight` — нормализация и сводка серии веса
- `AnalyticsAdherence` — план/факт/пропуски по диапазону дат
- `AnalyticsInsights` — карточки «разбор ошибок» (`buildCards`)
- `CoachGoal` — нормализация цели (`intent`, `mode` вкл. **Простой**, `pauseReason`, фокус, период, частота, `lastPause`) + inbox «прочитано до следующей тренировки» + `closePause()` / `canClosePause()`
- `AnalyticsCoach` — rule-коуч (`buildPack`): фокус-трек, **микроплан фокуса**, частота, плато, возврат после простоя, следующий шаг + insights; ранжирование по цели, лимит ~6 карточек кроме brief
- `CoachEnrich` — опциональный rewrite title/body через Edge Function `coach-enrich` (`COACH_LLM_ENABLED`, fallback на правила; без чата)
- Форма цели: `search-select` для фокус-упражнения (частые + поиск по каталогу)

Новую аналитику писать **сюда**, UI — тонкая оболочка в `progress.js` (хаб «Коуч», маршрут `progress-insights`).  
Цель: `profiles.coach_goal`. Inbox: `profiles.coach_inbox`. Миграции в `supabase/migrations/`.  
При выходе из режима «Простой» (форма или кнопка «Вернулся в зал») период архивируется в `lastPause` для сравнения до/после.

LLM-коуч: Supabase Edge Function `supabase/functions/coach-enrich` — тот же контракт карточек, не свободный чат. По умолчанию выключен в клиенте.

### `router.js`
`AppRouter`: navigate, history stack (`pushState`/`popstate`), `handleHardwareBack()`, initLoginPage, initHomePage, initProfilePage.  
Корневые вкладки shell-nav делают `navigate(..., { replace: true })` — без свайпа между табами.  
Маршруты прогресса: `progress` (хаб), `progress-insights` (Коуч), `progress-exercises`, `progress-body-weight`, `progress-missed`.

### `gestures.js`
Консервативный модуль: агрессивный PTR / long-press / swipe-back с web убраны (ломали скролл и календарь).  
Смена периода календаря — стрелками; план дня — обычный тап → `openDay` (centered `app-dialog`).

### `templates.js`
`TemplatesManager`: CRUD шаблонов, редактор, модальный picker упражнений (фильтры мышца/оборудование).  
Порядок упражнений в редакторе — drag-and-drop по ручке (pointer events; стрелки ↑↓ убраны; с клавиатуры — ArrowUp/ArrowDown на ручке).

### `workout.js`
`WorkoutManager`:
- `guardActiveWorkout()` — защита от параллельных сессий
- Старт из шаблона / плана / пустая
- Активная тренировка: подходы, таймеры, rest timer
- `persist()` — throttle записи в IndexedDB + cloud
- После `finishWorkout` — запрос веса через `Onboarding`

### `history.js`, `calendar.js`, `exercises.js`
Соответствующие экраны. Календарь использует `AnalyticsAdherence.dayStatus` при наличии.  
`CalendarManager.quickPlan(dateStr)` — компактный план (CTA на главной / день в календаре).

### `progress.js`
Хаб категорий + экраны графиков (Chart.js) + `progress-insights` («Коуч»).  
Расчёты веса/пропусков/инсайтов — через `analytics/`.

### `sync.js`
`SyncManager`: export JSON (сессии, шаблоны, план, `body_weight_entries`, `birth_date`, `coach_goal`, `coach_inbox`); import восстанавливает те же поля (schema `2.1.0`).

### `demoData.js`
`DemoData.seed()` / `clearAll()` / `needsReseed()` — расширенный тестовый набор (`SEED_VERSION` = 4).

### `updateCheck.js`
См. [раздел 13](#13-система-обновлений).

---

## 10. Модели данных в приложении

### Шаблон (template)

```js
{
  id: "uuid",
  name: "День груди",
  description: "",
  exercises: [
    { exerciseId: "chest_1" },
    { exerciseId: "chest_4" }
  ]
}
```

Плановые sets/reps **не хранятся** — только порядок упражнений.

### Сессия (session)

```js
{
  id: "uuid",
  templateId: "uuid" | null,
  templateName: "День груди",
  date: "2026-07-27",           // YYYY-MM-DD, локальный календарный день
  startTime: "ISO8601",
  endTime: "ISO8601" | null,
  duration: 3600,               // секунды
  completed: true | false,
  notes: "",
  exercises: [{
    exerciseId: "chest_1",
    completed: true,
    exerciseTime: 300,          // секунды на упражнение
    sets: [
      { weight: 60, reps: 8 }
    ]
  }]
}
```

### План (planned)

```js
{
  workout_date: "2026-07-28",
  template_id: "uuid" | null,
  templates: { id, name }        // join при чтении
}
```

---

## 11. UI, вёрстка и safe area

- **Тема:** тёмная, акцент `#ff5a6a`, шрифты Manrope + Sora
- **Bootstrap 5** (CDN) + кастом в `css/style.css`
- **Empty states:** `Utils.emptyStateHtml({ icon, title, text, ctaHtml })` → `.empty-state`
- **Плюралы:** `Utils.pluralRu(n, ['один','два','пять'])`
- **A11y:** `:focus-visible`, `aria-current` на shell-nav, `prefers-reduced-motion` для `.fade-in`
- **Bottom nav** (`#shell-nav`): фиксированная, `body.has-shell-nav` добавляет padding-bottom
- **Safe area** (Android/iOS notch):
  - CSS-переменные `--safe-top`, `--safe-bottom`
  - Классы `html.is-native`, `html.is-native-android` — fallback отступы
  - `modal-footer` — padding с учётом safe-bottom
  - Demo-полоска: `top: 0` + `padding-top: var(--safe-top)`

### Диалоги

Все подтверждения и ввод текста — через `Utils.confirm()` / `Utils.prompt()` (Bootstrap modal, класс `app-dialog`). Системные `window.confirm` / `window.prompt` **не используются**.

---

## 12. PWA и Service Worker

Файл: `sw.js`, cache name: `mygym-v1.3.1` (меняется с релизом).  
`APP_SHELL` precache включает `js/analytics/*`, `onboarding.js` и страницы login/home/profile.

### Стратегии кэширования

| Тип запроса | Стратегия |
|-------------|-----------|
| `version.json`, `sw.js` | Network-first |
| Supabase API, CDN (jsdelivr), `data/` | Network-first |
| JS, CSS, HTML, `pages/` | Network-first (с offline fallback) |
| Иконки, прочее | Cache-first с network update |

### Регистрация SW (`index.html`)

- Только если **не** `IS_NATIVE`
- `updateViaCache: 'none'`
- После принудительного обновления: `sessionStorage.mygym_skip_sw = '1'` → один запуск без SW (см. `clearCacheAndReload`)

### Offline

При отсутствии сети отдаётся кэш или «Офлайн». Черновик тренировки доступен из IndexedDB.

---

## 13. Система обновлений

Файл-манифест: `version.json` (на GitHub Pages, доступен и для APK).

```json
{
  "version": "1.3.1",
  "minVersion": "0.5.0",
  "critical": false,
  "releaseNotes": ["..."],
  "apkDownloadUrl": "https://github.com/k4rtosh/mygym/releases/latest/download/MyGym-latest-debug.apk",
  "releasesPageUrl": "https://github.com/k4rtosh/mygym/releases/latest"
}
```

### Логика (`js/updateCheck.js`)

1. Сравнить `MYGYM_CONFIG.APP_VERSION` с `version.json.version`
2. Если `current < minVersion` или `critical: true` → **блокирующая** модалка
3. Иначе — модалку можно закрыть («Позже»); повтор через **24 часа**
4. В профиле кнопка **«Обновить приложение»** активна, пока есть новая версия (независимо от «Позже»)

### Действие «Обновить»

| Платформа | Поведение |
|-----------|-----------|
| **Web** | `clearCacheAndReload()`: unregister SW, delete caches, reload с `?_v=timestamp` |
| **APK** | Открыть `apkDownloadUrl` в браузере, установить поверх |

---

## 14. Android (Capacitor)

| Параметр | Значение |
|----------|----------|
| appId | `com.k4rtosh.mygym` |
| webDir | `www/` |
| Plugins | StatusBar, SplashScreen |

### Safe area на Android

`app.js` → `initNativeShell()`:
- `StatusBar.setOverlaysWebView({ overlay: false })` — контент не под статус-баром
- Тёмный фон статус-бара `#0c1018`

### Подпись APK

Общий debug keystore: `android/keystores/mygym-debug.keystore`  
Конфиг: `android/keystore.debug.properties`

**Зачем:** все CI-сборки подписаны одним ключом → обновление APK **поверх** старого без удаления. Если на телефоне APK от другого ключа (локальная сборка) — один раз удалить и поставить CI-сборку.

### Сборка локально

```bash
npm install
npm run cap:sync          # build:www + cap sync android
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 15. CI/CD и релизы

### Web (GitHub Pages)

```bash
git push origin main
```

Деплой автоматический, путь `/mygym/`. Обновление через 1–2 минуты.

### Android (GitHub Actions)

Workflow: `.github/workflows/android-apk.yml`

Триггер: push в `main` (по путям) или `workflow_dispatch`.

Шаги:
1. `npm ci`
2. `node scripts/sync-android-version.js`
3. `npm run cap:sync`
4. `./gradlew assembleDebug`
5. Artifact `mygym-android-apk`
6. GitHub Release с `MyGym-latest-debug.apk` (стабильная ссылка)

---

## 16. Версионирование

При релизе обновить **все** источники:

| Файл | Поле |
|------|------|
| `version.json` | `version`, `releaseNotes`, при необходимости `critical`, `minVersion` |
| `js/config.js` | `APP_VERSION` |
| `sw.js` | `CACHE_NAME` (`mygym-vX.Y.Z`) |
| `android/app/build.gradle` | `versionCode`, `versionName` (через `sync-android-version.js`) |

`versionCode` = `21000 + major*1000 + minor*100 + patch` (например 0.9.0 → 21900, 1.0.0 → 22000), чтобы APK ставился поверх старых 2.x и каждый релиз повышал код.

Скрипт синхронизации:

```bash
node scripts/sync-android-version.js
```

---

## 17. Локальная разработка

### Web

```bash
npm install
npm start
# http://localhost:5500
```

На localhost `BASE_PATH = ''`. Для проверки GitHub Pages path можно деплоить на fork или использовать `serve` с подпапкой.

### Supabase

См. `SUPABASE_SETUP.md`. Для локальной разработки достаточно publishable key в `config.js`.

### Demo без Supabase

«Войти в демо» на экране логина — полный UI без облака.

### Полезные скрипты

```bash
node scripts/sync-android-version.js
node scripts/build-www.js
# MYGYM_DB_PASSWORD=... node scripts/seed-exercises.js
# Одноразовые правки каталога — scripts/legacy/ (не гонять в prod без нужды)
```

---

## 18. Безопасность

- В клиенте только **publishable** Supabase key
- RLS на всех пользовательских таблицах
- Demo-режим не отправляет данные в prod Supabase
- Пароль БД / service role **никогда** в репозиторий
- Debug keystore в репо — только для debug APK, не для production release

---

## 19. Соглашения для разработки

### Стиль кода

- Vanilla ES6+, без TypeScript
- Классы домена: `*Manager`, синглтон на `window`
- HTML-фрагменты в `pages/` или template strings в менеджерах
- Стили: Bootstrap utilities + `css/style.css`, без CSS-in-JS

### Добавление экрана

1. Маршрут в `router.js` → `switch (path)`
2. HTML в `pages/` или метод `*Manager.load*()`
3. Пункт в `Utils.shellNavActiveFor()` если нужен highlight nav
4. При необходимости — путь в `sw.js` APP_SHELL

### Добавление поля в данные

1. Миграция `supabase/schema.sql` (если нужно в БД)
2. `api.js` — mapping в upsert/list
3. UI в соответствующем Manager
4. Demo API в `demoMode.js` если поле user-specific

### Для ИИ-агентов

- **Не ломать** `DemoMode.activateDemoShims()` — мутирует методы, не заменяет `const Api`
- **Не менять** `BASE_PATH` логику без проверки SW и GitHub Pages
- Черновик тренировки — всегда через `DB.saveActiveSession` (scope-aware)
- `data/exercises.json` — формат `{ exercises: [...] }`, не голый массив
- Ветки: `cursor/<name>-99c5`, PR в `main`
- Версию поднимать согласованно (раздел 16)

---

## 20. Частые проблемы

| Симптом | Причина | Решение |
|---------|---------|---------|
| Web не обновляется после деплоя | SW кэш | Профиль → «Обновить приложение» или hard refresh |
| «Есть обновление», но версия та же | Старый `config.js` в кэше | `clearCacheAndReload()` |
| APK не ставится поверх | Другая подпись | Удалить старый APK, поставить из Releases |
| Demo: `allExercises.find is not a function` | Каталог не массив | Нормализация в `listExercises` / `cacheExercises` |
| Demo-тренировка в prod | Общий ключ черновика | Использовать scope в `db.js` |
| Foreign key на `template_id` | Demo template id в prod session | Не смешивать режимы; scope isolation |
| Кнопки под системной навигацией | Safe area | `--safe-bottom` на modal-footer и bottom-nav |

---

## Связанные документы

- [README.md](README.md) — краткий обзор для пользователя
- [SUPABASE_SETUP.md](SUPABASE_SETUP.md) — настройка Auth и БД
- [supabase/schema.sql](supabase/schema.sql) — полная схема

---

*Последнее обновление: v1.3.1*
