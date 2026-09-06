# Deploy v28.22 on Render

1. Replace the contents of `seb_gun_crm_render_ready/` in GitHub with this version.
2. Keep the existing Render Build Command:

```bash
cd seb_gun_crm_render_ready && npm ci --include=dev && npm run build && npm run check:runtime && npm run test:v2819 && npm run test:database
```

3. Keep Start Command:

```bash
cd seb_gun_crm_render_ready && npm start
```

4. Required Render environment values remain unchanged, especially `DATABASE_URL`, `SESSION_SECRET`, VK/BlueSales/Telegram variables.
5. Deploy latest commit. The build must show:
   - Vite build successful
   - `v28.22 integration checks: OK`
   - `PASS: SQL schema, partial snapshots, direct journal/history queries...`
6. After deploy close old CRM tabs and open the site again with a hard refresh (`Ctrl+Shift+R`).
7. Admin can inspect `Ещё → PostgreSQL и нагрузка` after login.

If `test:database` fails, do not bypass it: use the exact first PostgreSQL error from the Render build log to fix the migration/SQL before starting the service.
