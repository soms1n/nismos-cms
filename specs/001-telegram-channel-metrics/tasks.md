---
description: "Task list for Telegram channel audience metrics"
---

# Tasks: Метрики аудитории Telegram-канала

**Input**: Design documents from `/specs/001-telegram-channel-metrics/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http-api.md, quickstart.md

**Tests**: Отдельные задачи написания тестов не включены, поскольку они явно не запрошены в спецификации. Feasibility spike и приёмочные проверки обязательны.

**Organization**: Единственная пользовательская история US1 образует MVP. Foundational Phase 2 содержит блокирующую проверку реального Telegram-канала.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Можно выполнять параллельно: другие файлы и нет зависимости от незавершённых задач
- **[Story]**: US1 обозначает User Story 1 из spec.md
- Все пути указаны относительно корня репозитория

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Создать минимальный pnpm workspace и независимое full-stack приложение без преждевременных shared packages

- [ ] T001 Создать корневой workspace с Node.js 24 LTS, packageManager pnpm и общими командами приложения в `package.json` и `pnpm-workspace.yaml`; включить только `apps/*`
- [ ] T002 Инициализировать Next.js App Router, React и TypeScript 5.x с зависимостями Auth.js, `@mtcute/node` и Zod, зафиксировать версии в `apps/admin-telegram/package.json`, `apps/admin-telegram/next.config.ts`, `apps/admin-telegram/tsconfig.json` и `pnpm-lock.yaml`
- [ ] T003 [P] Настроить линтинг и форматирование с командами проверки в `apps/admin-telegram/eslint.config.mjs`, `.prettierrc.json` и `package.json`
- [ ] T004 [P] Настроить Vitest, React Testing Library и Playwright без добавления тестовых сценариев в `apps/admin-telegram/vitest.config.ts`, `apps/admin-telegram/playwright.config.ts`, `apps/admin-telegram/tests/setup.ts` и `apps/admin-telegram/package.json`
- [ ] T005 [P] Исключить зависимости, артефакты, локальные секреты и Telegram-сессии из Git и описать только имена переменных окружения в `.gitignore` и `apps/admin-telegram/.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Подтвердить возможность получения данных и подготовить серверную инфраструктуру, обязательную для US1

**CRITICAL**: Никакая работа над US1 не начинается до завершения этой фазы. Неуспешный T012 блокирует реализацию и возвращает спецификацию на уточнение.

- [ ] T006 Реализовать строгую загрузку конфигурации через Zod с `channelRef` только на сервере, проверкой всех обязательных переменных и без вывода секретов в `apps/admin-telegram/src/server/config.ts`
- [ ] T007 Реализовать серверный lifecycle MTProto-клиента с импортом session string в память, повторным использованием соединения, корректным закрытием и запретом клиентского импорта в `apps/admin-telegram/src/server/telegram/client.ts`
- [ ] T008 Создать интерактивную одноразовую авторизацию выделенного Telegram-аккаунта с 2FA и экспортом сессии в защищённый файл вне репозитория без записи сессии в логи в `apps/admin-telegram/scripts/telegram-login.ts`
- [ ] T009 Определить серверные типы запроса доступа, страниц участников и результата полного обхода, включая `participantId` и `classification` (`deleted` | `real` | `unknown`), в `apps/admin-telegram/src/server/telegram/gateway.ts`
- [ ] T010 Реализовать MTProto-обход через `channels.getFullChannel` и `channels.getParticipants`: проверка `can_view_participants` и `participants_hidden`, пустой поисковый фильтр вместо `recent`, offset/limit-пагинация, дедупликация по ID, обработка `FLOOD_WAIT` и явная ошибка неполного обхода в `apps/admin-telegram/src/server/telegram/mtcute-gateway.ts`
- [ ] T011 Создать feasibility spike с агрегированным выводом без ID/имён участников, сверкой контрольных счётчиков, повторным обходом и не менее чем 20 измерениями длительности; подключить команду `telegram:verify` в `apps/admin-telegram/scripts/verify-telegram-access.ts` и `apps/admin-telegram/package.json`
- [ ] T012 Выполнить `pnpm telegram:verify` на реальном staging-канале с независимо известным контрольным набором, включая удалённые аккаунты; записать только агрегированные результаты, полноту классификации и измерения SC-002 в `specs/001-telegram-channel-metrics/research.md`; при неудаче остановить последующие задачи
- [ ] T013 Настроить Auth.js с OIDC/OAuth и реализовать серверный guard: доступ только по паре `issuer + subject` из allowlist, email сам по себе не критерий, проверка allowlist при каждом запросе, `401` без сессии и `403` без прав в `apps/admin-telegram/src/server/auth.ts` и `apps/admin-telegram/src/app/api/auth/[...nextauth]/route.ts`
- [ ] T014 [P] Создать единый безопасный формат HTTP-ошибок и ответов с `Cache-Control: no-store`, UTC ISO 8601 timestamps и отсутствием внутренних деталей/данных подписчиков в `apps/admin-telegram/src/server/http.ts`

**Checkpoint**: Telegram spike успешно пройден, серверная конфигурация и авторизация готовы — можно реализовывать US1

---

## Phase 3: User Story 1 - Просмотр текущего состава аудитории (Priority: P1) — MVP

**Goal**: Администратор видит общее число подписчиков, удалённые и реальные аккаунты из одного успешного обхода, время обновления и может вручную обновить показатели

**Independent Test**: При тестовом составе 1 000 участников, из которых 120 удалены, открытие панели показывает `1 000 / 120 / 880` и timestamp; ручное обновление заменяет весь снимок; ошибка или отсутствие прав не раскрывает актуальные/частичные данные

### Implementation for User Story 1

- [ ] T015 [US1] Определить Zod-схемы и типы `AudienceSnapshot`, ответов и ошибок: `total` и `deleted` — целые `>= 0`, `real = total - deleted`, `updatedAt >= startedAt`, состояния `current` | `stale`, все коды из HTTP-контракта в `apps/admin-telegram/src/server/metrics/contracts.ts`
- [ ] T016 [P] [US1] Реализовать чистую классификацию и агрегацию: `deleted=true` → `deleted`; полный пользователь без признака `deleted` → `real`; `userEmpty`, отсутствующий пользователь, неполные данные или неподдерживаемый тип → `unknown`; любой `unknown` отклоняет снимок; `bot`, `fake`, `scam` не меняют `real` в `apps/admin-telegram/src/server/metrics/classification.ts`
- [ ] T017 [P] [US1] Реализовать хранение не более одного последнего успешного снимка в памяти, атомарную замену только после полного успеха, состояния `empty`/`current`/`stale` и отсутствие ID участников после расчёта в `apps/admin-telegram/src/server/metrics/store.ts`
- [ ] T018 [US1] Реализовать оркестрацию обновления: один полный обход для всех счётчиков, `startedAt`/`updatedAt`, отклонение частичных и противоречивых данных, объединение параллельных refresh в один Promise, таймаут и сохранение прежнего снимка только как `stale` в `apps/admin-telegram/src/server/metrics/service.ts`
- [ ] T019 [P] [US1] Реализовать серверную защиту refresh: проверка same-origin через `Origin` и/или `Sec-Fetch-Site`, ограничение частоты, `429` с `Retry-After` и `504 REFRESH_TIMEOUT` в `apps/admin-telegram/src/server/metrics/refresh-guard.ts`
- [ ] T020 [P] [US1] Реализовать `GET /api/metrics` с серверной проверкой прав, возвратом последнего снимка со `state=current` или `state=stale`, `503 METRICS_UNAVAILABLE` при отсутствии снимка и без нового обращения к Telegram в `apps/admin-telegram/src/app/api/metrics/route.ts`
- [ ] T021 [P] [US1] Реализовать `POST /api/metrics/refresh` без тела: запуск/присоединение к обходу, успешный ответ `200`, ошибки `401`, `403`, `429`, `502` и `504` по `contracts/http-api.md`, без публикации частичного результата в `apps/admin-telegram/src/app/api/metrics/refresh/route.ts`
- [ ] T022 [P] [US1] Создать доступную русскоязычную панель с тремя точными неотрицательными счётчиками, `updatedAt`, автоматическим refresh при открытии, кнопкой «Обновить» и состояниями `refreshing`/`current`/`stale`/`unavailable`; большие числа не теряют точность в `apps/admin-telegram/src/components/audience-metrics-panel.tsx`
- [ ] T023 [US1] Подключить панель к странице с серверной проверкой администратора, адаптивным отображением и отсутствием передачи серверных секретов клиенту в `apps/admin-telegram/src/app/page.tsx`, `apps/admin-telegram/src/app/layout.tsx` и `apps/admin-telegram/src/app/globals.css`
- [ ] T024 [US1] Добавить структурированные логи только с длительностью, результатом и агрегированным кодом ошибки; запретить session string, `channelRef`, ID/имена участников и частичные данные в `apps/admin-telegram/src/server/logger.ts` и `apps/admin-telegram/src/server/metrics/service.ts`
- [ ] T025 [US1] Выполнить независимую приёмку US1 по сценариям 1–5 из `specs/001-telegram-channel-metrics/quickstart.md`, включая `1000/120/880`, ручное обновление, права, ошибки, нулевые/большие значения и отсутствие частичных снимков; зафиксировать результат в `specs/001-telegram-channel-metrics/quickstart.md`

**Checkpoint**: US1 полностью функциональна и независимо проверена; это весь запрошенный MVP

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Подготовить воспроизводимый запуск и выполнить итоговую проверку без расширения объёма

- [ ] T026 [P] Настроить Next.js standalone output и один долгоживущий Node.js-процесс без горизонтальных реплик Telegram-сессии в `apps/admin-telegram/next.config.ts` и `apps/admin-telegram/Dockerfile`
- [ ] T027 [P] Добавить инструкции по установке Node.js 24 LTS/pnpm, настройке OIDC, защищённому Telegram login, запуску и ограничениям полноты данных в `README.md` со ссылками на `apps/admin-telegram/.env.example` и `specs/001-telegram-channel-metrics/quickstart.md`
- [ ] T028 Выполнить полный сценарий `specs/001-telegram-channel-metrics/quickstart.md`, включая staging smoke, реальный OIDC, перезапуск с потерей in-memory снимка и итоговое измерение SC-002; зафиксировать подтверждённые и неподтверждённые результаты в `specs/001-telegram-channel-metrics/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Начинается немедленно; T002 зависит от T001, T003–T005 можно выполнять после T002
- **Foundational (Phase 2)**: Зависит от Setup; T007–T011 зависят от конфигурации и предыдущих Telegram-модулей; T012 блокирует все последующие задачи
- **User Story 1 (Phase 3)**: Начинается только после успешного T012 и завершения T013–T014
- **Polish (Phase 4)**: Зависит от завершения и независимой приёмки US1

### User Story Dependencies

- **US1 (P1)**: Единственная история; не зависит от других пользовательских историй и полностью образует MVP

### Within User Story 1

1. T015 задаёт контракты и инварианты
2. T016, T017 и T019 могут выполняться параллельно после T015
3. T018 зависит от T016–T017 и Telegram gateway из Phase 2
4. T020–T022 могут выполняться параллельно после T018–T019
5. T023–T025 выполняются после соответствующих компонентов; T025 завершает независимую приёмку

### Parallel Opportunities

- **Setup**: T003, T004, T005
- **Foundational**: T014 может выполняться параллельно с T013 после успешного spike
- **US1 — домен**: T016, T017, T019
- **US1 — интерфейсы**: T020, T021, T022
- **Polish**: T026, T027

---

## Parallel Example: User Story 1

```text
После T015:
Task: "T016 — классификация в apps/admin-telegram/src/server/metrics/classification.ts"
Task: "T017 — хранилище в apps/admin-telegram/src/server/metrics/store.ts"
Task: "T019 — защита refresh в apps/admin-telegram/src/server/metrics/refresh-guard.ts"

После T018–T019:
Task: "T020 — GET в apps/admin-telegram/src/app/api/metrics/route.ts"
Task: "T021 — POST в apps/admin-telegram/src/app/api/metrics/refresh/route.ts"
Task: "T022 — панель в apps/admin-telegram/src/components/audience-metrics-panel.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Завершить Setup
2. Завершить Foundational и подтвердить реальный Telegram spike; при неудаче остановиться и уточнить спецификацию
3. Реализовать US1 целиком
4. Выполнить T025 и остановиться для независимой проверки MVP
5. После успешной приёмки выполнить Polish и staging smoke

### Incremental Delivery

- Не публиковать частичные или приблизительные метрики ради завершения MVP
- Не добавлять историю, список подписчиков, несколько каналов, базу данных или shared packages
- Не переходить к production, пока полнота данных и производительность не подтверждены на реальном канале

## Notes

- [P] задачи затрагивают разные файлы и не зависят от незавершённых задач
- Все US1-задачи имеют метку `[US1]`; Setup, Foundational и Polish не имеют story label
- T012 и T028 требуют реальные staging-секреты и внешние системы; их нельзя считать выполненными без фактических результатов
- Изменения можно коммитить логическими группами после проверки, но каждая группа должна сохранять работоспособность проекта
