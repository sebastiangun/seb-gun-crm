# seb_gun CRM v28.24 — Google Sheets storage

Эта версия не использует PostgreSQL, SQL migrations, connection pool или DATABASE_URL.

## Готовый Google Sheet

Spreadsheet ID:
`1lm0ajA6nFpQ5jXybxm3MY5pVp0gTjqP_oC_0rira7oI`

Листы:
- Leads
- LeadEvents
- Notifications
- Outbox
- SLASettings
- NotificationRules
- Managers
- Statuses
- Users
- Bootstrap
- Runtime

## Что нужно в Render

Добавьте Environment Variables:

- `GOOGLE_SPREADSHEET_ID=1lm0ajA6nFpQ5jXybxm3MY5pVp0gTjqP_oC_0rira7oI`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL=<email сервисного аккаунта>`
- `GOOGLE_PRIVATE_KEY=<private key>`
- `REQUIRE_GOOGLE_STORAGE=1`
- `SESSION_SECRET=<минимум 32 символа>`

Также оставьте ваши существующие VK / BlueSales / Telegram переменные.

## Очень важно

Подключение Google Drive к ChatGPT не передаётся в Render. Для серверной CRM нужен Google Cloud service account.

1. Создайте service account в Google Cloud.
2. Включите Google Sheets API.
3. Создайте JSON key.
4. Возьмите `client_email` и `private_key`.
5. Откройте таблицу `seb_gun_crm_storage` и дайте `client_email` право **Редактор**.
6. Внесите email/private key в Render Environment.

`GOOGLE_PRIVATE_KEY` можно вставить как multiline secret или строкой с `\n`.

## Логика хранения

`Leads` — текущее состояние каждого эпизода SLA.
`LeadEvents` — история только дописывается.
`Notifications` — фактические Telegram/browser уведомления.
`Outbox` — зависшие исходящие сообщения.
`Runtime` — сессии, служебные флаги и маленькие JSON-документы.
`Bootstrap` — отдельный лист для прогресса первичной обработки.

Новые события не требуют чтения всей истории. Сервер держит листы в памяти и обновляет конкретную строку или добавляет новую.

## Render

Build Command оставьте:

`cd seb_gun_crm_render_ready && npm ci --include=dev && npm run build && npm run check:runtime && npm run test:v2819 && npm run test:database`

Start Command:

`cd seb_gun_crm_render_ready && npm start`
