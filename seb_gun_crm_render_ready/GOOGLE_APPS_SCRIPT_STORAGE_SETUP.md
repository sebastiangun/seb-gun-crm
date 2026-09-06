# seb_gun CRM v28.27 — настройка помесячной аналитики Google Sheets

Архитектура: **Render → HTTPS → Google Apps Script Web App → Google Sheets**. PostgreSQL не используется.

## Что будет использоваться сейчас

Текущая таблица: **seb_gun_crm_storage_2026-09**  
Spreadsheet ID: `1lm0ajA6nFpQ5jXybxm3MY5pVp0gTjqP_oC_0rira7oI`

В ней аналитика хранится только за **сентябрь 2026**. Обычная VK-переписка и карточка BlueSales остаются за весь период.

### Помесячные листы
- `Leads`
- `LeadEvents`
- `Notifications`
- `Outbox`
- `Bootstrap`

### Постоянные листы
- `SLASettings`
- `NotificationRules`
- `Managers`
- `Statuses`
- `Users`
- `Runtime`
- `QuickPhrases` — 185 быстрых фраз / 27 групп
- `ClientsCache` — резервный кэш BlueSales, чтобы раздел «Клиенты» не падал 503 при `API_BUSY/QUEUE_BUSY`

## Шаг 1. Обновите Apps Script

1. Откройте таблицу `seb_gun_crm_storage_2026-09`.
2. **Расширения → Apps Script**.
3. Полностью замените код содержимым `google-apps-script/Code.gs` из этого архива.
4. В строке `API_SECRET` укажите **новый** секрет, совпадающий с Render `GOOGLE_SHEETS_API_SECRET`.
5. `DEFAULT_SPREADSHEET_ID` оставьте пустым. v28.27 передаёт ID таблицы из Render.
6. **Начать развертывание → Управление развертываниями → Редактировать → Новая версия → Развернуть**.
7. Web App: **Запуск от имени: я**, **У кого есть доступ: Все / Anyone**.
8. URL `/exec` обычно остаётся прежним.

## Шаг 2. Render Environment

Оставьте/добавьте:

```text
GOOGLE_SPREADSHEET_ID=1lm0ajA6nFpQ5jXybxm3MY5pVp0gTjqP_oC_0rira7oI
GOOGLE_SHEETS_WEBAPP_URL=https://script.google.com/macros/s/.../exec
GOOGLE_SHEETS_API_SECRET=<НОВЫЙ_секрет_из_Code.gs>
REQUIRE_GOOGLE_STORAGE=1
MONTHLY_AUTO_PREPARE=1
SESSION_SECRET=<новый_секрет_32+_символа>
APP_TIMEZONE=Europe/Moscow
ANALYTICS_TIMEZONE=Europe/Moscow
```

`ANALYTICS_PERIOD` в обычной работе **не задавайте**: CRM сама определяет текущий месяц по Москве.

### Что делает `MONTHLY_AUTO_PREPARE=1`

Это одноразовая безопасная миграция вашей старой таблицы v28.26. При первом запуске v28.27, если `Runtime.analytics_period` ещё отсутствует, CRM:

1. проверяет, что имя таблицы содержит `2026-09` / `2026_09` / `202609`;
2. очищает только `Leads`, `LeadEvents`, `Notifications`, `Outbox`, `Bootstrap`;
3. сохраняет настройки, пользователей, Runtime, `QuickPhrases`, `ClientsCache`;
4. ставит `analytics_period=2026-09`;
5. начинает Bootstrap **только с 01.09.2026 00:00 МСК**;
6. не вызывает BlueSales из исторического Bootstrap.

Если имя таблицы не соответствует месяцу, очистка блокируется и сервер завершится с понятной ошибкой — архивный месяц случайно стереть нельзя.

После первого успешного запуска `MONTHLY_AUTO_PREPARE=1` можно оставить: повторно сентябрь не очистится, потому что `analytics_period` уже записан.

## Шаг 3. Deploy

Build Command можно оставить:

```bash
cd seb_gun_crm_render_ready && npm ci --include=dev && npm run build && npm run check:runtime && npm run test:v2819 && npm run test:database
```

Start Command:

```bash
cd seb_gun_crm_render_ready && npm start
```

После успешного запуска ожидайте в логах:

```text
[storage] Google Sheets подключён; листы готовы
seb_gun CRM + VK DIRECT v28.27
```

## Что произойдёт с быстрыми фразами

Если лист `QuickPhrases` пустой, CRM автоматически загрузит туда 185 фраз из `data/quick_phrases.json`. После этого админские изменения фраз сохраняются в Google Sheets, поэтому для изменения текста фразы redeploy GitHub больше не нужен.

## Что произойдёт с клиентами BlueSales

После каждого успешного `customers.get` CRM обновляет `ClientsCache`. Если BlueSales временно занят (`API_BUSY`, `QUEUE_BUSY`, timeout/503), раздел «Клиенты» отдаёт сохранённый кэш Google Sheets вместо ошибки 503.

## Что делать 1 октября

1. В Google Drive сделайте **копию** сентябрьской таблицы.
2. Назовите её `seb_gun_crm_storage_2026-10`.
3. В Render поменяйте **только** `GOOGLE_SPREADSHEET_ID` на ID октябрьской копии.
4. Apps Script повторно разворачивать не нужно.
5. CRM увидит, что в копии `analytics_period=2026-09`, а сейчас `2026-10`, и покажет предупреждение только админу.
6. Откройте **Ещё → Админка → Google Drive / Sheets** и нажмите **«Очистить аналитику в НОВОЙ таблице и начать месяц»**.
7. Очистятся только месячные листы (`Leads`, `LeadEvents`, `Notifications`, `Outbox`, `Bootstrap`). `QuickPhrases`, настройки и `ClientsCache` останутся.

Сентябрьская таблица остаётся архивом и больше не читается текущей аналитикой.

## Важно по безопасности

Секреты, которые когда-либо отправлялись в чат/скриншоты/логи, нужно считать раскрытыми. Перед финальным запуском перевыпустите VK token, Telegram bot token, Google Sheets API secret и SESSION_SECRET. Новые значения не храните в GitHub и не присылайте в чат.
