# Implementation Plan: Метрики аудитории Telegram-канала

**Branch**: `001-telegram-channel-metrics` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-telegram-channel-metrics/spec.md`

**Note**: This template is filled in by the `/skill:speckit-plan` command; its definition describes the execution workflow.

## Summary

Создать первую административную панель `apps/admin-telegram` для одного Telegram-канала с тремя согласованными счётчиками и временем обновления. Использовать full-stack TypeScript-приложение на Next.js: серверная часть получает участников через MTProto (`@mtcute/node`), вычисляет агрегаты и предоставляет их только авторизованным администраторам. База данных и постоянный список подписчиков не нужны.

Bot API не позволяет получить требуемые данные. Telegram также не гарантирует полный обход и атомарный снимок канала. Поэтому первый обязательный этап — feasibility spike на реальном канале с контрольными удалёнными аккаунтами и измерением SC-002. До его успешного завершения основная реализация не начинается; при неудаче спецификация возвращается на уточнение без скрытого уменьшения объёма.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 24 LTS

**Primary Dependencies**: Next.js stable (App Router), React stable, Auth.js, `@mtcute/node`, Zod; точные версии фиксируются в lockfile при создании приложения

**Storage**: Последний агрегированный снимок в памяти процесса; Telegram session string в менеджере секретов; база данных отсутствует

**Testing**: Vitest, React Testing Library, Playwright; отдельный staging spike/smoke с реальным Telegram

**Target Platform**: Современные desktop/mobile browsers; один долгоживущий Node.js-процесс в Linux-контейнере

**Project Type**: Full-stack admin web app в pnpm-монорепозитории

**Performance Goals**: 95% успешных открытий не более 5 секунд согласно SC-002; цель подтверждается измерениями spike на реальном размере канала

**Constraints**: Один канал; одна production-реплика на Telegram-сессию; никаких частичных снимков; старые значения только с пометкой `stale`; MTProto и секреты только на сервере; никаких ID подписчиков в ответах, логах и постоянном хранилище

**Scale/Scope**: Одна панель, три метрики, ручное обновление, небольшой allowlist администраторов; размер поддерживаемого канала определяется результатами spike

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Before Phase 0 — PASS**: `.specify/memory/constitution.md` остаётся незаполненным шаблоном и не содержит ратифицированных принципов или обязательных gates. Нарушений конституции нет.

**After Phase 1 — PASS**: Проект следует `docs/architecture.md`: приложение изолировано в `apps/admin-telegram`, общие пакеты не создаются без реального повторения, серверная авторизация обязательна. Дополнительная сложность не требует исключений: база данных, отдельный backend, микрофронтенды и Turborepo отложены.

## Project Structure

### Documentation (this feature)

```text
specs/001-telegram-channel-metrics/
├── plan.md              # Этот план
├── research.md          # Источник данных, ограничения и выбранный стек
├── data-model.md        # Агрегаты, классификация и состояния
├── quickstart.md        # Feasibility spike и end-to-end проверка
├── contracts/
│   └── http-api.md      # HTTP-контракт панели
└── tasks.md             # Создаётся следующей командой /skill:speckit-tasks
```

### Source Code (repository root)

```text
apps/admin-telegram/
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── metrics/route.ts
│   │       └── metrics/refresh/route.ts
│   ├── components/
│   │   └── audience-metrics-panel.tsx
│   └── server/
│       ├── auth.ts
│       ├── config.ts
│       ├── metrics/
│       │   ├── contracts.ts
│       │   ├── service.ts
│       │   └── store.ts
│       └── telegram/
│           ├── client.ts
│           ├── gateway.ts
│           └── mtcute-gateway.ts
├── scripts/
│   ├── telegram-login.ts
│   └── verify-telegram-access.ts
├── tests/
│   ├── unit/
│   └── integration/
├── e2e/
└── package.json

package.json
pnpm-workspace.yaml
```

**Structure Decision**: Одно независимое full-stack приложение в `apps/admin-telegram`. Серверные модули отделены от React-компонентов. Telegram-доступ скрыт за интерфейсом `gateway`, чтобы unit/integration/e2e-тесты использовали детерминированный адаптер. `packages/*`, `services/*`, `infra/*` и Turborepo пока не создаются.

## Delivery Order

1. Создать минимальный workspace и скрипт `verify-telegram-access.ts`; успешно выполнить все условия spike из `research.md` и `quickstart.md`.
2. Реализовать и протестировать классификацию, расчёт и атомарную публикацию снимка на тестовом адаптере.
3. Добавить серверную авторизацию и HTTP-контракты, затем панель с состояниями загрузки, ошибки и ручного обновления.
4. Провести staging smoke и измерение производительности. Не переходить к production при неподтверждённой полноте данных.
