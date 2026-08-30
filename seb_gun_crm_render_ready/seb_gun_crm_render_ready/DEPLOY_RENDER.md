# Публикация seb_gun CRM: GitHub Private + Render Free

Эта папка подготовлена для безопасной публикации.

## Что уже сделано

- `.env.local` удалён из deploy-копии.
- `.env.example` содержит только имена переменных, без секретов.
- `render.yaml` готов для Render Blueprint.
- `/api/health` используется как health check.
- приложение запускается через `npm start` и слушает `process.env.PORT` / `0.0.0.0`.

## GitHub

Создайте PRIVATE repository `seb-gun-crm` и загрузите содержимое этой папки в корень репозитория.

Не делайте репозиторий Public: папка `data/` содержит внутренние настройки CRM, быстрые фразы и данные пользователей/менеджеров.

## Render

1. Render Dashboard -> New -> Blueprint (или Web Service).
2. Подключите private GitHub repository `seb-gun-crm`.
3. Если используется Blueprint, Render прочитает `render.yaml`.
4. Введите секретные Environment Variables, когда Render попросит:
   - `VK_TOKEN`
   - `VK_COMMUNITY`
   - `VK_COMMUNITY_URL`
5. Нажмите Deploy.

После успешного запуска проверьте:

- `/api/health`
- главную страницу `/`

## Важно про бесплатный Render

Free Web Service может засыпать после периода без входящих запросов, а локальные изменения файлов на сервере не являются постоянным хранилищем. Исходные JSON-файлы из GitHub будут снова доступны после нового deploy, но изменения, записанные приложением только в локальные файлы Render, могут потеряться после restart/redeploy/spin-down.

Для полноценной постоянной эксплуатации локальные изменяемые настройки следует позже перенести в базу данных или persistent storage.
