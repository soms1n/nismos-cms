# Исследование: метрики аудитории Telegram-канала

**Дата**: 2026-11-10

## 1. Источник данных

**Decision**: Использовать MTProto через пользовательскую сессию выделенного аккаунта. Bot API не подходит для этой функции.

**Rationale**: Bot API `getChatMemberCount` возвращает только общее число участников, `getChatMember` — данные одного известного пользователя, а объект Bot API `User` не содержит признака удалённого аккаунта. MTProto `channels.getParticipants` возвращает страницы участников и связанные объекты `User`; конструктор `user` содержит флаг `deleted`.

**Alternatives considered**:

- Bot API: отклонён, поскольку не предоставляет полный список подписчиков и признак `deleted`.
- Смешивание общего счётчика Bot API с частичным списком MTProto: отклонено, поскольку значения могут относиться к разному составу аудитории.

**Источники**:

- [Bot API: getChatMemberCount](https://core.telegram.org/bots/api#getchatmembercount)
- [Bot API: getChatMember](https://core.telegram.org/bots/api#getchatmember)
- [Bot API: User](https://core.telegram.org/bots/api#user)
- [MTProto: channels.getParticipants](https://core.telegram.org/method/channels.getParticipants)
- [MTProto: channels.channelParticipants](https://core.telegram.org/constructor/channels.channelParticipants)
- [MTProto: user](https://core.telegram.org/constructor/user)

## 2. Полнота и согласованность обхода

**Decision**: До основной разработки выполнить технический spike на реальном канале. Каждый результат формировать из одного полного постраничного обхода, дедуплицировать участников по ID и отклонять снимок при неполноте, противоречивости или наличии неклассифицируемых записей.

**Rationale**: Telegram предоставляет offset/limit-пагинацию, но не транзакционный snapshot ID. Во время обхода аудитория может меняться. `hash` служит для кеширования и не фиксирует версию снимка. Поэтому можно гарантировать арифметическую согласованность ответа, но нельзя универсально обещать атомарный снимок всего канала на один момент времени.

Для обхода используется поиск участников с пустым запросом, а не фильтр «recent». Проверяются `can_view_participants` и `participants_hidden` через `channels.getFullChannel`. Используемый аккаунт должен быть участником и администратором канала.

**Alternatives considered**:

- Считать снимок успешным при любом частичном ответе: отклонено, так как нарушает FR-005, FR-009 и FR-010.
- Выполнять повторные обходы до совпадения: может обнаружить нестабильность, но не доказывает атомарность; использовать только как диагностику spike.
- Выводить отдельно полученный `participants_count` как total: отклонено для расчёта метрик, поскольку он может не совпадать с собранным набором.

**Условия прохождения spike**:

1. Доступен полный обход выбранного канала без неподтверждённых пропусков.
2. На контрольном наборе удалённые аккаунты присутствуют в выдаче и имеют `deleted=true`.
3. Все участники имеют достаточные данные для классификации; `userEmpty`, отсутствующий `User` и неполные `min`-объекты не считаются реальными.
4. Повторные обходы дают объяснимые и проверяемые результаты при стабильном составе канала.
5. На реальном размере канала измеряется длительность и проверяется SC-002.

Если условия не выполняются, разработка панели останавливается, а требования и критерии успеха возвращаются на уточнение. Смена клиентской библиотеки не устраняет ограничения Telegram.

**Источники**:

- [Pagination in the API](https://core.telegram.org/api/offsets)
- [channels.getFullChannel](https://core.telegram.org/method/channels.getFullChannel)
- [channelFull](https://core.telegram.org/constructor/channelFull)
- [ChannelParticipantsFilter](https://core.telegram.org/type/ChannelParticipantsFilter)
- [Min constructors](https://core.telegram.org/api/min)
- [Error handling и FLOOD_WAIT](https://core.telegram.org/api/errors)

## 3. MTProto-клиент

**Decision**: Использовать `@mtcute/node` в долгоживущем серверном процессе Node.js.

**Rationale**: Библиотека поддерживает TypeScript и серверное использование, продолжает развиваться и позволяет хранить сессию отдельно от кода. Постоянный процесс переиспользует соединение и сессию.

**Alternatives considered**:

- GramJS: удобен для перечисления участников, но репозиторий архивирован; для нового проекта не выбран.
- TDLib: официальный клиент, но добавляет native bindings и более сложное развёртывание без снятия ограничений Telegram.

**Источники**:

- [mtcute](https://github.com/mtcute/mtcute)
- [mtcute: хранение сессий](https://mtcute.dev/guide/topics/storage)
- [GramJS](https://github.com/gram-js/gramjs)

## 4. Форма приложения

**Decision**: Создать `apps/admin-telegram` как одно full-stack приложение на Next.js, React и TypeScript в pnpm workspace. Обработчики HTTP и MTProto-клиент находятся в серверной части того же приложения.

**Rationale**: Для одной панели не требуются независимые frontend/backend-развёртывания, CORS и два процесса. Такой вариант сохраняет независимость приложения в монорепозитории и минимизирует инфраструктуру.

**Alternatives considered**:

- Vite/React + отдельный Fastify backend: оправдан при независимом масштабировании, но избыточен для первой версии.
- Микрофронтенд: отклонён ранее из-за лишней сложности.
- Turborepo: не требуется для одного приложения; добавить при появлении нескольких приложений и потребности в оркестрации задач.

**Источники**:

- [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route)
- [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [pnpm workspaces](https://pnpm.io/workspaces)

## 5. Хранение

**Decision**: Хранить только последний успешный агрегированный снимок в памяти одного процесса. Не сохранять список подписчиков и их ID. База данных не нужна. Telegram session string хранить в менеджере секретов и загружать в память при запуске.

**Rationale**: История и восстановление после перезапуска не входят в объём. Отсутствие базы уменьшает объём персональных данных и инфраструктуры.

**Alternatives considered**:

- PostgreSQL: добавить только при появлении истории, нескольких реплик или необходимости сохранять снимок между перезапусками.
- SQLite для Telegram-сессии: допустимо на защищённом постоянном диске, но требует дополнительных правил шифрования, резервного копирования и доступа.

**Ограничения**: Одна production-реплика на Telegram-сессию; отдельные сессии для local/stage/production. Session string даёт полный доступ к аккаунту и не должна попадать в репозиторий, браузер или логи.

## 6. Авторизация

**Decision**: Использовать Auth.js с существующим OIDC/OAuth-провайдером и allowlist администраторов по паре `issuer + subject`. Проверять права при входе и при каждом запросе метрик.

**Rationale**: Не требуется собственная база паролей. Проверка allowlist на каждом запросе отзывает доступ без ожидания истечения сессии. Проверка только в интерфейсе недостаточна.

**Alternatives considered**:

- Собственные логин и пароль: больше обязанностей по безопасности без дополнительной ценности.
- Telegram Login: не доказывает принадлежность к списку администраторов панели без дополнительной привязки и не выбран для первой версии.

**Источники**:

- [Auth.js](https://authjs.dev/getting-started)
- [Next.js: Authentication](https://nextjs.org/docs/app/guides/authentication)

## 7. Тестирование и проверка

**Decision**: Использовать Vitest для доменных и серверных тестов, React Testing Library для панели и Playwright для end-to-end сценариев. Реальный Telegram вызывается только в spike и staging smoke-тестах, но не в обычном CI.

**Rationale**: Тестовый адаптер позволяет детерминированно проверять пагинацию, ошибки, неполные данные и права доступа. Реальный источник изменчив и подвержен `FLOOD_WAIT`.

**Alternatives considered**: Только ручная проверка с Telegram отклонена, поскольку не обеспечивает повторяемость граничных случаев.

**Источники**:

- [Vitest](https://vitest.dev/guide/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Playwright](https://playwright.dev/docs/intro)
