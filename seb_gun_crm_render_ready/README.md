> Версия 28.19: сначала прочитайте [START_HERE_POSTGRESQL.md](START_HERE_POSTGRESQL.md), затем UPDATE_V28.19.txt. PostgreSQL обязателен для устойчивой истории SLA, одноразового сканирования и аудита уведомлений.

# seb_gun CRM v28.3 — Vue workspace

Это новая ветка интерфейса. Backend Node.js, VK API и BlueSales API сохранены, frontend переписан на Vue 3 + Pinia + Vue Router + Vite.

## Запуск / Render

```bash
npm install
npm run build
npm run check:runtime
npm run test:v280
npm start
```

Render использует те же команды из `render.yaml`. Секреты (`VK_TOKEN`, Telegram и BlueSales notification credentials) задаются только в Render Environment.

## Архитектура frontend

- `frontend/src/stores/dialogs.js` — список диалогов и polling;
- `frontend/src/stores/chat.js` — сообщения, загрузка ранней истории, отправка, STT;
- `frontend/src/stores/drafts.js` — persistent draft по `peerId`;
- `frontend/src/stores/phrases.js` — 151 быстрый скрипт;
- `frontend/src/stores/clients.js` / `reminders.js` — BlueSales экраны;
- `frontend/src/components/MultiFilterSheet.vue` — мобильные мультифильтры;
- `frontend/src/components/PhraseDrawer.vue` — левая шторка скриптов;
- `frontend/src/components/ClientDrawer.vue` — правая карточка BlueSales;
- `frontend/src/views/ChatView.vue` — чат без full-render старого `app.js`.

Старый v27 frontend сохранён в `legacy-public/` и доступен по `/legacy/`. Новый root не регистрирует старый Service Worker; Vite создаёт hashed assets.

См. `UPDATE_V28.0.txt`, `UPDATE_V28.1.txt`, `UPDATE_V28.2.txt` и `UPDATE_V28.3.txt`.

---

# seb_gun CRM v27.0

Стабильное мобильное ядро поверх существующих VK + BlueSales интеграций.

Ключевые изменения v27.0:
- диалоги показываются после первой страницы, остальные догружаются в фоне без ручной кнопки;
- revision-safe черновики не позволяют старому DOM стереть выбранный скрипт;
- на Android/iOS мультифильтры открываются как bottom sheet, кнопки «Сбросить / Применить» закреплены внизу;
- мобильный чат больше не делает full-render после фоновой загрузки BlueSales;
- polling списка диалогов патчит только список;
- HttpOnly session cookie содержит зашифрованный API snapshot и позволяет восстановить сессию после restart Render; plaintext пароль в cookie не пишется;
- сохранены 151 скрипт, VK-вложения, Telegram SLA, расшифровка и защита от дублей.

См. `UPDATE_V27.0.txt`.

---

# seb_gun CRM + VK DIRECT v25.6

CRM использует BlueSales и VK для сообщений, но **расшифровка голосовых полностью независима от VK transcript**.

## Голосовые v25.6

- Голосовое можно слушать прямо в CRM через встроенный HTML5-плеер.
- Распознавание **не обращается к VK transcript API**: CRM использует только сам аудиофайл сообщения.
- Готовый open-source движок — `whisper.cpp`; Node-интеграция — prebuilt пакет `@fugood/whisper.node`, поэтому отдельный STT-сервис и API-ключи не нужны.
- Перед распознаванием встроенный в Render `ffmpeg` переводит OGG/Opus/MP3/M4A/WebM в WAV 16 kHz mono.
- Модель — multilingual quantized `ggml-tiny-q5_1.bin` (~32 MB). Она скачивается и проверяется SHA-256 во время Render build, а не хранится в Git.
- На Render Free используется один поток и только одна задача распознавания одновременно; после простоя модель освобождается из памяти.
- Расшифровки кэшируются и при повторном открытии не считаются заново.
- Кнопка расшифровки не включает глобальный loader чата, поэтому во время долгого STT можно продолжать работать с CRM.

## Остальные функции

- шторка быстрых фраз запоминает последний скрипт, поиск и прокрутку;
- поиск фраз регистронезависимый, `ё/е`, поиск по полному тексту;
- свайп слева открывает скрипты, свайп справа CRM-карточку;
- Browser Back/Forward и системная кнопка телефона используют History API;
- услуги и заказы используют кэш/stale fallback;
- глобальная загрузка не блокирует интерфейс.

## Что исправлено в v24.5 — ЗАКАЗ / УСЛУГА

По журналу основная задержка была не в `orders.add` и не в локальном `/api/services`, а в тяжёлом `/api/meta`: он сканировал всю базу клиентов через `customers.get` и занимал общую последовательную очередь BlueSales. Теперь `/api/meta` использует один `users.get` и уже сохранённые словари/цвета; полный customer scan из meta удалён.

Дополнительно: `ensureMeta`/`ensureServices`/`loadDrawerOrders` защищены от дублей, `orders.get` кэшируется на 15 секунд, после создания заказа очищается только order cache, форма «Новый заказ» открывается сразу, а каталог услуг/метаданные догружаются в фоне. Поиск услуги обновляет только список услуг, не весь чат.

`data/services.json` остаётся локальным каталогом выбора услуги. В BlueSales заказ отправляется официальным `orders.add` с `goodsPositions`, где позиция определяется `goods.id`, `goods.marking` или `goods.name`.

## Что исправлено в v24.5

1. **Диалог при первом открытии теперь фиксируется на последнем сообщении.**
   - добавлен отдельный нижний якорь;
   - первые 5.2 секунды после открытия действует bottom-lock;
   - повторная прокрутка выполняется после нескольких layout-циклов;
   - `ResizeObserver` следит за высотой реального потока сообщений, поэтому поздняя загрузка фото/стикеров/видео больше не должна возвращать переписку вверх;
   - любое ручное движение колесом/пальцем немедленно снимает bottom-lock.

2. **Цвет BlueSales у статуса и менеджера не теряется в тёмной теме.**
   - правая CRM-карточка теперь использует тот же `statusHtml`, что и списки;
   - реальный `crmStatusColor` остаётся фоном badge;
   - реальный `managerColor` остаётся фоном manager badge;
   - текст выбирается контрастным;
   - тёмные обычные подписи и кнопки становятся светлыми.

3. **Поиск диалогов синхронизирован с адресной строкой браузера.**
   Пример:
   `http://127.0.0.1:9050/?q=себастьян&filter=unanswered#/dialogs`

   После перезагрузки страницы `q`, `filter`, `manager`, `status` восстанавливаются из URL. Такой URL можно скопировать целиком и открыть позже.

4. **Редактирование быстрой фразы больше никогда само не перемещает её.**
   Обычный `PUT /api/admin/phrases/:id` заменяет запись строго на прежнем месте, в прежнем разделе и с прежним индексом.

5. **Добавлено явное перемещение/сортировка скриптов через кнопку `☰`.**
   - клик по `☰` открывает выбор раздела и кнопки `⇈ ↑ ↓ ⇊`;
   - на компьютере карточку можно перетащить мышкой на другую фразу;
   - перенос идёт отдельным endpoint `POST /api/admin/phrases/:id/move`;
   - только этот endpoint меняет группу/позицию.

6. **«Неотвеченные» и «Непрочитанные» загружаются полностью, а не только первой страницей.**
   Клиент запрашивает VK пакетами по 200 и продолжает по `offset`, пока `hasMore=false`. Для этих двух фильтров фоновый poll больше не заменяет полный результат первыми 50 диалогами.

   Под поиском теперь показывается проверка вида:
   `Неотвеченные: загружено 53 из 53 диалогов VK`.

7. **Тёмные кнопки адаптированы к теме.**
   Вторичные кнопки/фильтры/иконки используют тёмный `surface`, белый текст и тёмную границу; основные действия остаются зелёными с белым текстом.

## Почему изменена загрузка «Неотвеченных»

VK `messages.getConversations` официально поддерживает `filter=unanswered` для сообщений сообщества, а также `offset`, `count` и `group_id`. Поэтому v24.5 не пытается вычислять список вручную: она получает именно серверный фильтр VK и последовательно дочитывает все страницы.

## Запуск

1. Полностью закройте старый сервер v24.3.
2. Распакуйте v24.5 в новую папку.
3. Запустите `START_WINDOWS.bat`.
4. Окно `seb_gun CRM v24.5 Server` не закрывайте.
5. Один раз нажмите `Ctrl+Shift+R` в браузере.

## Что проверить первым

1. Откройте длинный диалог с фотографиями — он должен оказаться в самом низу.
2. Включите тёмную тему и откройте CRM — цвет «Диагностика» и цвет менеджера должны сохраниться.
3. В поиске введите `себастьян` — текст должен появиться и в URL браузера.
4. Отредактируйте любую фразу — она должна остаться в том же разделе и на том же месте.
5. Нажмите `☰` у фразы — переместите её вверх/вниз или в другой раздел.
6. Откройте «Неотвеченные» — дождитесь строки `загружено X из X диалогов VK`.

## Локальная проверка

`SELF_TEST_WINDOWS.bat` запускает синтаксические и регрессионные тесты. Реальный VK/BlueSales аккаунт в локальной тестовой среде не используется, поэтому окончательная проверка живых данных выполняется на вашем Windows-компьютере.

## Internet deployment

For a GitHub + Render deployment, see `DEPLOY_RENDER.md` and `render.yaml`.
Never commit `.env.local`; store VK credentials in Render Environment Variables.

## v26.3 — Telegram SLA notifications

Secrets are never stored in GitHub. Configure them in Render Environment:

- `TELEGRAM_BOT_TOKEN` — regenerated BotFather token.
- `TELEGRAM_BOT_USERNAME` — public bot username, e.g. `yozhiki_sebastian_bot`.
- `TELEGRAM_WEBHOOK_SECRET` — optional random secret for Telegram webhook verification. If omitted the server derives a stable secret from the bot token.
- `NOTIFICATION_CHECK_SECRET` — random secret required by `/api/notifications/check`.
- `BLUESALES_NOTIFICATION_LOGIN` / `BLUESALES_NOTIFICATION_PASSWORD` — a BlueSales account used by the background checker so notifications do not depend on an open browser session.
- `NOTIFICATION_TIMEZONE` — default `Europe/Moscow`.

After deploy open CRM -> More -> Telegram notifications. Select a manager, set SLA/work hours, save, then press Connect Telegram and press START in the bot. One bot supports multiple managers; each rule stores its own Telegram chat.

The external scheduler should call once per minute:

`POST https://seb-gun-crm.onrender.com/api/notifications/check`

with HTTP header:

`Authorization: Bearer <NOTIFICATION_CHECK_SECRET>`

SLA counts working minutes only. Example with 10:00-22:00 / 8 minutes: an incoming message at 09:30 becomes due at 10:08; one at 21:57 becomes due at 10:05 next day if no reply is sent.

The default notification-settings JSON is runtime-local. Render Free can replace its filesystem when an instance is recreated, so keep a backup of the rules or add persistent storage before treating this as mission-critical monitoring.
