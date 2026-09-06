# seb_gun CRM v28.26 — Google Sheets без PostgreSQL и Google Cloud Console

Хранилище: **Render → HTTPS → Google Apps Script Web App → `seb_gun_crm_storage`**.

## Обновление с v28.25

1. Откройте `seb_gun_crm_storage` → **Расширения → Apps Script**.
2. Полностью замените текущий `Code.gs` файлом `google-apps-script/Code.gs` из v28.26.
3. Вставьте в `API_SECRET` тот же секрет, который хранится в Render как `GOOGLE_SHEETS_API_SECRET`. Новый секрет в чат не отправляйте.
4. Apps Script → **Начать развертывание → Управление развертываниями → Редактировать → Новая версия → Развернуть**.
5. Для Web App должно остаться: **Запуск от имени: я**, **доступ: Все / Anyone**.
6. Если `/exec` URL изменился — замените `GOOGLE_SHEETS_WEBAPP_URL` в Render.
7. Запустите новый deploy Render.

При старте v28.26 команда `setup` автоматически переводит `work_start` / `work_end` в текстовый формат, чтобы `10:00` и `22:00` больше не превращались во внутренние числа Google Sheets.

## Render Environment

```text
GOOGLE_SPREADSHEET_ID=1lm0ajA6nFpQ5jXybxm3MY5pVp0gTjqP_oC_0rira7oI
GOOGLE_SHEETS_WEBAPP_URL=https://script.google.com/macros/s/.../exec
GOOGLE_SHEETS_API_SECRET=<тот же секрет из Code.gs>
REQUIRE_GOOGLE_STORAGE=1
SESSION_SECRET=<ваш секрет не короче 32 символов>
```

PostgreSQL-переменные v28.26 не использует. Старые `DATABASE_URL`, `REQUIRE_DATABASE`, `DB_IMPORT_ON_START`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` можно удалить.

## Что хранится по листам

- `Leads` — состояние эпизодов общения и рассчитанные SLA-поля;
- `LeadEvents` — только значимые изменения, без события на каждый `updatedAt`;
- `Notifications` — история уведомлений;
- `Outbox` — очередь/результат исходящих сообщений;
- `SLASettings` — зеркало настроек SLA по профилям;
- `NotificationRules` — правила уведомлений;
- `Bootstrap` — прогресс одноразовой загрузки диалогов;
- `Runtime` — сессии, служебные документы и guards.

## Проверка запуска

В Render Logs:

```text
[storage] Google Sheets подключён; листы готовы
seb_gun CRM + VK DIRECT v28.26
```

Обычный `/api/health` в v28.26 не обращается в Google на каждый health-check Render. Реальную проверку Google Apps Script выполняют админская диагностика и старт приложения.
