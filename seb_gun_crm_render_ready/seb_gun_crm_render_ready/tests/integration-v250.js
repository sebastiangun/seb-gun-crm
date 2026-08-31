const fs=require('fs');
const assert=require('assert');
const app=fs.readFileSync('public/app.js','utf8');
const api=fs.readFileSync('public/api.js','utf8');
const server=fs.readFileSync('server.js','utf8');
const css=fs.readFileSync('public/styles.css','utf8');

// Messaging: reply / forward / copy full dialog / voice transcripts.
assert(app.includes('data-msg-reply'), 'reply action missing');
assert(app.includes('data-msg-forward'), 'forward action missing');
assert(app.includes('data-copy-dialog'), 'dialog copy button missing');
assert(app.includes('Расшифровка голосового'), 'voice transcript UI missing');
assert(server.includes('/export-text'), 'dialog text export endpoint missing');
assert(server.includes('reply_to'), 'VK reply_to missing');
assert(server.includes('forward_messages'), 'VK forward_messages missing');
assert(server.includes("transcript: String(x?.transcript || '')"), 'VK transcript normalization missing');

// Unified browser/UI back + URL-persisted list state.
assert(app.includes("window.addEventListener('popstate',handleHistoryRoute)"), 'browser back handler missing');
assert(app.includes('function chatBack()'), 'chat back handler missing');
for(const key of ["searchParams.set('q'","searchParams.set('manager'","searchParams.set('status'","searchParams.set('tag'","searchParams.set('bucket'"])assert(app.includes(key), `URL filter state missing ${key}`);
assert(app.includes("activeFilterSummary('dialogs')"), 'dialog active filter summary missing');
assert(app.includes("activeFilterSummary('reminders')"), 'reminder active filter summary missing');

// Phrase search: normalized case-insensitive search over name/group/body.
assert(app.includes("function normSearch"), 'normalized search missing');
assert(app.includes("`${g.name} ${p.name} ${p.text}`"), 'phrase body search missing');
assert(app.includes('const n=normSearch(p.name),t=normSearch(p.text),g=normSearch(p.groupName)'), 'autocomplete body search missing');

// Performance protections.
assert(api.includes('AbortController'), 'frontend request timeout missing');
assert(server.includes('BS_QUEUE_MAX_WAIT_MS'), 'BlueSales queue max wait missing');
assert(server.includes('cachedLoad(cacheKey, 60000'), 'order cache missing');
assert(app.includes('state.drawerOrdersError'), 'order retry/error state missing');
assert(app.includes('visualViewport'), 'mobile keyboard viewport fix missing');
assert(css.includes('pointer-events:none'), 'nonblocking loading overlay missing');

console.log('OK: v25 messaging + back/navigation + searches + performance safeguards.');
