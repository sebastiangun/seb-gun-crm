# seb_gun CRM v28.25 — Google Sheets без Google Cloud Console

Эта версия НЕ использует PostgreSQL, DATABASE_URL, Service Account, GOOGLE_PRIVATE_KEY или Google Cloud Console.

Хранилище работает так:

Render -> HTTPS -> Google Apps Script Web App -> Google Sheet `seb_gun_crm_storage`.

## 1. Google Sheet

Spreadsheet ID уже указан для вашей таблицы:

`1lm0ajA6nFpQ5jXybxm3MY5pVp0gTjqP_oC_0rira7oI`

Листы создаются/проверяются автоматически командой setup при старте CRM.

## 2. Apps Script

Откройте таблицу -> Расширения -> Apps Script.

Полностью замените Code.gs содержимым файла:

`google-apps-script/Code.gs`

В начале файла замените:

`CHANGE_THIS_TO_THE_SAME_LONG_SECRET_AS_RENDER`

на длинный секрет (40+ символов).

## 3. Опубликовать Web App

Apps Script -> Deploy -> New deployment -> Web app.

- Execute as: Me
- Who has access: Anyone

Нажмите Deploy и скопируйте URL, который заканчивается на `/exec`.

## 4. Render Environment

Добавьте/замените:

```text
GOOGLE_SPREADSHEET_ID=1lm0ajA6nFpQ5jXybxm3MY5pVp0gTjqP_oC_0rira7oI
GOOGLE_SHEETS_WEBAPP_URL=https://script.google.com/macros/s/.../exec
GOOGLE_SHEETS_API_SECRET=<тот же секрет из Code.gs>
REQUIRE_GOOGLE_STORAGE=1
SESSION_SECRET=<ваш существующий секрет не короче 32 символов>
```

Удалите старые переменные, если они остались:

```text
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
DATABASE_URL
```

## 5. Что должно быть в Render Logs

Правильный запуск:

```text
[storage] Google Sheets подключён; листы готовы
seb_gun CRM + VK DIRECT v28.25
```

Если URL/секрет не настроены, при `REQUIRE_GOOGLE_STORAGE=1` приложение специально остановится, чтобы CRM не работала на временных файлах Render.

## 6. Как сохраняются данные

- Leads — текущее состояние лидов.
- LeadEvents — журнал изменений; новые события дописываются.
- Notifications — журнал уведомлений.
- Outbox — исходящие сообщения/ошибки.
- SLASettings — SLA-настройки.
- NotificationRules — правила уведомлений.
- Bootstrap — прогресс импорта.
- Runtime — служебные документы, сессии, tombstone удаления, create guards.

Записи обновляются по ключу. Массовые изменения передаются пакетами до 100 строк за один HTTP-запрос, чтобы bootstrap не делал тысячи отдельных запросов к Google.

## 7. Резервное восстановление

Google Sheets хранит историю версий файла. Дополнительно LeadEvents сохраняет историю CRM-событий. Удаление SLA-строки в CRM использует tombstone в Runtime, поэтому её можно восстановить штатной кнопкой восстановления.
