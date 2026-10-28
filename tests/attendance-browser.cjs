const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tip-attendance-browser-'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let server, child, socket;
const checks = [], errors = [], requests = [];
const previewFingerprint = 'a'.repeat(64);

(async () => {
    console.log('Evidence:', out);
    server = http.createServer((request, response) => {
        const file = path.resolve(root, '.' + (new URL(request.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(request.url, 'http://localhost').pathname));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return response.writeHead(404).end();
        response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
        response.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const profile = path.join(out, 'profile');
    child = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--disable-gpu', '--disable-software-rasterizer', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '', port;
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', error => { stderr += error.message; });
    for (let index = 0; index < 100; index++) {
        try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; } catch { await pause(100); }
    }
    if (!port) throw new Error('Chrome failed: ' + stderr.slice(-1000));
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let next = 0;
    const pending = new Map();
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++next;
        const timeout = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 15000);
        pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
        socket.send(JSON.stringify({ id, method, params }));
    });
    const respond = (requestId, data, status = 200) => send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: 'Content-Type' }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PATCH, OPTIONS' }], body: Buffer.from(JSON.stringify(data)).toString('base64') });
    const people = [
        { id: 42, employeeCode: 'QA42', name: 'Alice Attendance', role: 'Server', active: true, locations: [{ id: 11, name: 'Sky Bar', active: true }] },
        { id: 7, employeeCode: 'QA07', name: 'Bruno Midmonth', role: 'Bartender', active: true, locations: [{ id: 12, name: 'Wine Bar', active: true }] },
        { id: 99, employeeCode: 'QA99', name: 'Celia No Work', role: 'Manager', active: true, locations: [] }
    ];
    people.forEach(person => { person.email = null; });
    let attendanceMode = 'success', previewMode = 'success', confirmationMode = 'success', historyMode = 'success';
    const heldAttendance = [], heldPreviews = [], heldHistory = [];
    let confirmedSnapshot = null;
    const attendance = (year, month) => ({ period: { year, month }, source: 'postgresql_attendance', employees: people.map((person, index) => {
        const records = attendanceMode === 'empty' ? [] : index === 0 ? [
            { day: 1, status: 'worked', minutes: 90 }, { day: 2, status: 'worked', minutes: 60 },
            { day: 3, status: 'absence', minutes: 0 }, { day: 4, status: 'vacation', minutes: 0 }, { day: 5, status: 'day_off', minutes: 0 }
        ] : index === 1 ? [{ day: 16, status: 'worked', minutes: 30 }] : [{ day: 1, status: 'vacation', minutes: 0 }];
        const worked = records.filter(record => record.status === 'worked');
        return { ...person, reference: person.employeeCode, daysWorked: worked.length, workedMinutes: worked.reduce((sum, record) => sum + record.minutes, 0), eligible: worked.length > 0, absences: records.filter(row => row.status === 'absence').length, vacationDays: records.filter(row => row.status === 'vacation').length, daysOff: records.filter(row => row.status === 'day_off').length, attendance: records.map(record => ({ date: `${year}-${String(month).padStart(2, '0')}-${String(record.day).padStart(2, '0')}`, status: record.status, clockIn: record.minutes ? '09:00' : null, clockOut: record.minutes ? record.minutes === 90 ? '10:30' : record.minutes === 60 ? '10:00' : '09:30' : null, clockOutNextDay: false, workedMinutes: record.minutes })) };
    }) });
    const intercept = async ({ requestId, request }) => {
        const url = new URL(request.url);
        if (url.hostname !== 'localhost') return send('Fetch.fulfillRequest', { requestId, responseCode: 200, body: '' });
        if (request.method === 'OPTIONS') return respond(requestId, {});
        const body = request.postData ? JSON.parse(request.postData) : null;
        requests.push({ method: request.method, path: url.pathname, query: url.search, body });
        if (url.pathname === '/api/attendance') {
            const payload = attendance(Number(url.searchParams.get('year')), Number(url.searchParams.get('month')));
            if (attendanceMode === 'hold') { heldAttendance.push({ requestId, payload }); return; }
            if (attendanceMode === 'error') return respond(requestId, { error: 'Attendance temporarily unavailable.' }, 503);
            if (attendanceMode === 'invalid') payload.employees[0].daysWorked = '2';
            return respond(requestId, payload);
        }
        if (url.pathname === '/api/workspace') return respond(requestId, { workspace: { id: 1, name: 'Attendance QA', locationsEnabled: true } });
        if (url.pathname === '/api/locations') return respond(requestId, { locations: people.flatMap(person => person.locations) });
        if (url.pathname === '/api/employees') return respond(requestId, { employees: people });
        if (request.method === 'PATCH' && /^\/api\/employees\/\d+$/.test(url.pathname)) {
            const person = people.find(person => person.id === Number(url.pathname.split('/').pop()));
            const { locationIds, ...fields } = body;
            Object.assign(person, fields);
            if (locationIds !== undefined) person.locations = person.locations.filter(location => locationIds.includes(location.id));
            return respond(requestId, { employee: person });
        }
        if (url.pathname === '/api/distributions/preview') {
            const payload = preview(body);
            if (previewMode === 'hold') { heldPreviews.push({ requestId, payload }); return; }
            if (previewMode === 'error') return respond(requestId, { error: 'Preview unavailable.' }, 503);
            if (previewMode === 'invalid') payload.calculation.allocations[0].payoutCents++;
            return respond(requestId, payload);
        }
        if (url.pathname === '/api/distributions' && request.method === 'POST') {
            if (confirmationMode === 'stale') return respond(requestId, { error: 'Attendance changed. Calculate payouts again.', code: 'PREVIEW_STALE' }, 409);
            const calculation = preview(body).calculation;
            confirmedSnapshot = {
                id: 8, reference: 'DIST-ATTENDANCE-QA', periodStart: `${body.year}-${String(body.month).padStart(2, '0')}-01`,
                poolCents: body.poolCents, allocatedCents: body.poolCents, differenceCents: 0, status: 'confirmed', allocationMethod: 'worked_days',
                attendanceSource: 'postgresql_attendance', confirmedAt: '2026-10-23T12:00:00Z', employeeCount: 2,
                items: calculation.allocations.map(allocation => { const person = people.find(person => person.id === allocation.employeeId); return { employeeId: person.id, employeeCode: person.employeeCode, employeeName: person.name, role: person.role, locations: person.locations.map(location => location.name), workedDays: allocation.workedDays, workedMinutes: person.id === 42 ? 150 : 30, payoutCents: allocation.payoutCents }; })
            };
            return respond(requestId, { distribution: { id: 8, reference: confirmedSnapshot.reference, period_start: confirmedSnapshot.periodStart, confirmed_at: confirmedSnapshot.confirmedAt }, calculation, snapshot: confirmedSnapshot }, 201);
        }
        if (url.pathname === '/api/distributions') {
            const payload = { distributions: confirmedSnapshot ? [structuredClone(confirmedSnapshot)] : [] };
            if (historyMode === 'hold') { heldHistory.push({ requestId, payload }); return; }
            return respond(requestId, payload);
        }
        if (url.pathname === '/api/distributions/8') return respond(requestId, confirmedSnapshot);
        throw new Error('Unexpected endpoint: ' + request.method + ' ' + url.pathname);
    };
    function preview(body) {
        const first = Math.floor(body.poolCents * 2 / 3), second = Math.floor(body.poolCents / 3);
        const remaining = body.poolCents - first - second;
        return { ...attendance(body.year, body.month), previewFingerprint, calculation: { poolCents: body.poolCents, totalWorkedDays: 3, allocatedCents: body.poolCents, differenceCents: 0, allocations: [
            { employeeId: 7, workedDays: 1, payoutCents: second + (body.poolCents % 3 === 2 ? remaining : 0) },
            { employeeId: 42, workedDays: 2, payoutCents: first + (body.poolCents % 3 === 1 ? remaining : 0) }
        ] } };
    }
    socket.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.id) { const item = pending.get(message.id); pending.delete(message.id); if (item) message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result); }
        else if (message.method === 'Fetch.requestPaused') intercept(message.params).catch(error => { errors.push(error.message); respond(message.params.requestId, { error: error.message }, 500).catch(() => {}); });
        else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    };
    const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
    const until = async expression => { for (let index = 0; index < 150; index++) { if (await evaluate(expression)) return; await pause(40); } throw new Error('Timeout: ' + expression + '\n' + JSON.stringify({ errors, requests })); };
    const check = (name, actual, expected = true) => { assert.deepEqual(actual, expected, name); checks.push(name); console.log('PASS', name); };
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const input = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const load = async () => { await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/?case=' + Date.now() + '#distribution' }); await until(`document.readyState === 'complete' && typeof state !== 'undefined' && !state.loadingAttendance`); };
    const count = path => requests.filter(request => request.path === path).length;
    const navigate = async view => { await click(`.main-navigation [data-view="${view}"]`); await until(`!document.querySelector('#${view}-view').hidden`); };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Fetch.enable', { patterns: [{ urlPattern: 'http://localhost:3000/api/*' }, { urlPattern: 'https://fonts.googleapis.com/*' }, { urlPattern: 'https://fonts.gstatic.com/*' }, { urlPattern: 'https://cdn.jsdelivr.net/*' }] });
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/#distribution' });
    await until(`typeof state !== 'undefined' && !state.loadingAttendance && state.distributionEmployees.length === 3`);
    check('participation is automatic with no manual checkboxes', await evaluate(`document.querySelectorAll('#employee-rows input[type="checkbox"]').length`), 0);
    check('manual bulk inclusion removed', await evaluate(`!document.querySelector('#include-visible-button')`));
    check('current Lisbon month loads rather than old demo period', await evaluate(`(() => { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit' }).formatToParts(new Date()); return document.querySelector('#period').value === parts.find(part => part.type === 'year').value + '-' + parts.find(part => part.type === 'month').value; })()`));
    check('real attendance maps database identities and aggregates', await evaluate(`state.distributionEmployees.map(person => [person.id, person.daysWorked, person.workedMinutes])`), [[42, 2, 150], [7, 1, 30], [99, 0, 0]]);
    check('two automatic participants from worked status only', await evaluate(`getParticipants().map(person => person.id)`), [42, 7]);
    check('manual inclusion state is absent from API-normalized employees', await evaluate(`state.distributionEmployees.every(person => !Object.hasOwn(person, 'included'))`));
    check('summary communicates participant count', await evaluate(`document.querySelector('#included-count').textContent.trim() === '2 participants'`));
    check('hours use readable integer-minute evidence', await evaluate(`document.querySelector('[data-employee-id="42"]').textContent.includes('2h 30m') && document.querySelector('[data-employee-id="7"]').textContent.includes('0h 30m') && document.querySelector('[data-employee-id="99"]').textContent.includes('0h')`));
    await click('[data-employee-id="42"] .employee-details-button');
    check('vacation absence and day off have distinct evidence labels', await evaluate(`['Worked', 'Absence', 'Vacation', 'Day off'].every(value => document.querySelector('#attendance-records').textContent.includes(value))`));
    check('whole-hour evidence omits zero minutes', await evaluate(`document.querySelector('#attendance-records').textContent.includes('1h') && !document.querySelector('#attendance-records').textContent.includes('1h 00m')`));
    await click('#attendance-dialog-done');
    await navigate('history'); await until(`state.historyLoaded`);
    check('History initially empty and cached', await evaluate(`state.history.length === 0`));
    await navigate('distribution');
    await input('#tips', '0'); const zeroCount = count('/api/distributions/preview'); await click('#calculate-button');
    check('zero pool follows existing positive-pool validation', await evaluate(`!state.preview && !!document.querySelector('#tips-error').textContent.trim()`));
    check('zero pool sends no calculation request', count('/api/distributions/preview'), zeroCount);
    await input('#tips', '1.01');
    await input('#employee-search', 'Alice');
    await click('#calculate-button'); await until(`state.preview && !state.calculating`);
    check('backend preview endpoint receives only period and integer pool', Object.keys(requests.find(request => request.path === '/api/distributions/preview').body).sort(), ['month', 'poolCents', 'year']);
    check('backend fingerprint retained with authoritative allocations', await evaluate(`state.preview.previewFingerprint === ${JSON.stringify(previewFingerprint)} && state.preview.totalTipsCents === 101 && state.preview.totalDistributedCents === 101 && state.preview.payments.reduce((sum, payment) => sum + payment.amountCents, 0) === 101`));
    check('filtered visibility does not alter automatic financial population', await evaluate(`document.querySelectorAll('#employee-rows .employee-details-button').length === 1 && state.preview.payments.length === 2`));
    check('backend allocation order uses IDs rather than display order', await evaluate(`state.preview.payments.map(payment => [payment.id, payment.amountCents])`), [[7, 34], [42, 67]]);
    const previewBeforeFilter = await evaluate(`JSON.stringify(state.preview)`);
    await input('#employee-search', '');
    await click('#status-filter'); await click('#status-menu [data-value="no-worked-days"]');
    check('no-worked-days filter has only zero-day employee', await evaluate(`[...document.querySelectorAll('#employee-rows tr[data-employee-id]')].map(row => Number(row.dataset.employeeId))`), [99]);
    check('status filtering preserves preview byte for byte', await evaluate(`JSON.stringify(state.preview)`), previewBeforeFilter);
    await click('#status-filter'); await click('#status-menu [data-value="all"]');
    await click('#location-filter'); await click('#location-menu [data-value="Wine Bar"]');
    check('Location filter changes visibility without payout population', await evaluate(`document.querySelectorAll('#employee-rows tr[data-employee-id]').length === 1 && JSON.stringify(state.preview) === ${JSON.stringify(previewBeforeFilter)}`));
    await click('#location-filter'); await click('#location-menu [data-value="all"]');
    historyMode = 'hold';
    await evaluate(`void loadHistory()`);
    await until(`state.historyLoading`);
    for (let index = 0; index < 100 && !heldHistory.length; index++) await pause(20);
    await click('#calculate-button'); await until(`document.querySelector('#confirm-dialog').open`);
    await click('#confirm-distribution'); await until(`state.confirmed && !state.confirming`);
    const confirmRequest = requests.find(request => request.method === 'POST' && request.path === '/api/distributions');
    check('confirmation uses preview fingerprint and no employee selection', confirmRequest.body.previewFingerprint === previewFingerprint && !Object.hasOwn(confirmRequest.body, 'employeeIds') && typeof confirmRequest.body.idempotencyKey === 'string');
    check('confirmed payout exactly matches authoritative preview', await evaluate(`state.confirmed.payments.map(payment => [payment.id, payment.amountCents])`), [[7, 34], [42, 67]]);
    historyMode = 'success';
    const oldHistory = heldHistory.shift();
    await respond(oldHistory.requestId, oldHistory.payload);
    await until(`!state.historyLoading`);
    check('Late pre-confirmation History response cannot mark stale list current', await evaluate(`!state.historyLoaded || state.history.some(distribution => String(distribution.id) === '8')`));
    await navigate('history'); await until(`state.history.length === 1 && !state.historyLoading`);
    check('successful confirmation refreshes cached History', count('/api/distributions') >= 3);
    people[0].name = 'Changed current employee'; people[0].role = 'Changed role'; people[0].locations[0].name = 'Changed Location';
    await click('.history-open'); await until(`state.historyDetail && !document.querySelector('#history-detail').hidden`);
    check('History uses immutable saved employee role Location and duration', await evaluate(`(() => { const text = document.querySelector('#history-detail-rows').textContent; return text.includes('Alice Attendance') && text.includes('Server') && text.includes('Sky Bar') && text.includes('2h 30m') && !text.includes('Changed'); })()`));
    people[0].name = 'Alice Attendance'; people[0].role = 'Server'; people[0].locations[0].name = 'Sky Bar';
    attendanceMode = 'empty'; await load();
    check('zero attendance has no participants and explanatory nonerror state', await evaluate(`getParticipants().length === 0 && !!document.querySelector('#attendance-state').textContent.trim() && !state.attendanceError`));
    await input('#tips', '10'); const emptyCount = count('/api/distributions/preview'); await click('#calculate-button');
    check('nonzero pool without participants cannot calculate', await evaluate(`!state.preview`));
    check('empty attendance sends no financial request', count('/api/distributions/preview'), emptyCount);
    attendanceMode = 'error'; await load();
    check('attendance API unavailable blocks calculation and offers retry', await evaluate(`!!state.attendanceError && document.querySelector('#attendance-retry').checkVisibility() && document.querySelector('#calculate-button').disabled && !state.preview`));
    check('failure never generates demo employee attendance', await evaluate(`state.distributionEmployees.length === 0`));
    attendanceMode = 'success'; await click('#attendance-retry'); await until(`!state.loadingAttendance && !state.attendanceError && state.distributionEmployees.length === 3`);
    check('retry recovers actual API attendance in same selected month', await evaluate(`getParticipants().length === 2 && !document.querySelector('#attendance-retry').checkVisibility()`));
    attendanceMode = 'invalid'; await load();
    check('malformed attendance safely blocks financial work', await evaluate(`!!state.attendanceError && document.querySelector('#calculate-button').disabled && !state.preview && state.distributionEmployees.length === 0`));
    attendanceMode = 'success'; await click('#attendance-retry'); await until(`!state.loadingAttendance && !state.attendanceError`);
    await input('#tips', '1.01'); previewMode = 'invalid'; await click('#calculate-button'); await until(`!state.calculating`);
    check('malformed preview cannot become financial result', await evaluate(`!state.preview && !!document.querySelector('#workflow-error').textContent.trim()`));
    previewMode = 'error'; await click('#calculate-button'); await until(`!state.calculating`);
    check('preview API error is recoverable without confirmation', await evaluate(`!state.preview && !document.querySelector('#calculate-button').disabled && !!document.querySelector('#workflow-error').textContent.trim()`));
    previewMode = 'hold'; await click('#calculate-button'); await until(`state.calculating`);
    const beforeDuplicate = count('/api/distributions/preview'); await click('#calculate-button');
    check('pending preview blocks duplicate calculation requests', count('/api/distributions/preview'), beforeDuplicate);
    await until(`state.calculating`);
    for (let index = 0; index < 100 && !heldPreviews.length; index++) await pause(20);
    const pendingPreview = heldPreviews.shift(); await respond(pendingPreview.requestId, pendingPreview.payload); previewMode = 'success'; await until(`state.preview && !state.calculating`);
    confirmationMode = 'stale'; await click('#calculate-button'); await until(`document.querySelector('#confirm-dialog').open`); await click('#confirm-distribution'); await until(`!state.confirming && !!document.querySelector('#confirm-error').textContent.trim()`);
    check('changed authoritative attendance prevents false confirmation and requires recalculation', await evaluate(`!state.confirmed && state.previewStale && !document.querySelector('#confirm-dialog').open && !!document.querySelector('#workflow-error').textContent.trim()`));
    confirmationMode = 'success';
    await input('#tips', '2.02');
    previewMode = 'hold';
    await click('#calculate-button');
    await until(`state.calculating`);
    for (let index = 0; index < 100 && !heldPreviews.length; index++) await pause(20);
    await navigate('employees');
    await until(`state.employeesLoaded && !state.employeesLoading`);
    await click('#employees-rows [data-employee-id="42"]');
    await until(`document.querySelector('#employee-dialog').open`);
    await input('#employee-form-name', 'Alice Updated During Preview');
    await click('#save-employee');
    await until(`!state.savingEmployee && !document.querySelector('#employee-dialog').open`);
    check('Employee mutation during pending preview queues authoritative attendance refresh', await evaluate(`state.calculating && state.attendanceRefreshNeeded && !currentPreview()`));
    const staleHeldPreview = heldPreviews.shift();
    const attendanceBeforeEmployeeRefresh = count('/api/attendance');
    previewMode = 'success';
    await respond(staleHeldPreview.requestId, staleHeldPreview.payload);
    await until(`!state.calculating && !state.loadingAttendance && !state.attendanceRefreshNeeded && state.attendanceReady`);
    check('Late preview cannot overwrite newer Employee state and refreshes attendance', count('/api/attendance') > attendanceBeforeEmployeeRefresh && await evaluate(`!state.preview && state.distributionEmployees.find(person => person.id === 42).name === 'Alice Updated During Preview' && getParticipants().length === 2`));
    check('Employee mutation does not rewrite already persisted History snapshot', confirmedSnapshot.items.find(item => item.employeeId === 42).employeeName, 'Alice Attendance');
    await navigate('distribution');
    attendanceMode = 'hold';
    const olderLoad = evaluate(`selectPeriod(2026, 8)`); await until(`state.loadingAttendance`);
    const newerLoad = evaluate(`selectPeriod(2026, 7)`);
    for (let index = 0; index < 100 && heldAttendance.length < 2; index++) await pause(20);
    const old = heldAttendance.find(item => item.payload.period.month === 8), newer = heldAttendance.find(item => item.payload.period.month === 7);
    check('period loading locks financial calculation', await evaluate(`document.querySelector('#calculate-button').disabled`));
    await respond(newer.requestId, newer.payload); await newerLoad; await respond(old.requestId, old.payload); await olderLoad;
    check('out-of-order attendance response cannot overwrite newer selected period', await evaluate(`document.querySelector('#period').value === '2026-07' && state.distributionEmployees.every(person => person.attendance.every(record => record.date.startsWith('2026-07-')))`));
    attendanceMode = 'success';
    await input('#tips', '1.01'); await click('#calculate-button'); await until(`state.preview && !state.calculating`);
    for (const theme of ['light', 'dark']) for (const language of ['en', 'pt']) {
        await evaluate(`TipSplitTheme.setPreference(${JSON.stringify(theme)}); TipSplitI18n.setLanguage(${JSON.stringify(language)})`);
        check(theme + '/' + language + ' remains automatic and translated', await evaluate(`document.documentElement.dataset.theme === ${JSON.stringify(theme)} && document.documentElement.lang === ${JSON.stringify(language)} && !document.querySelector('#employee-rows input[type="checkbox"]') && !document.querySelector('#included-count').textContent.includes('/')`));
        for (const width of [1440, 1366, 1280, 1024, 768, 320]) {
            await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
            check(theme + '/' + language + '/' + width + ' page has no document horizontal overflow', await evaluate(`document.documentElement.scrollWidth <= innerWidth`));
            const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(path.join(out, `distribution-${theme}-${language}-${width}.png`), Buffer.from(image.data, 'base64'));
            if (width === 320) {
                check(theme + '/' + language + ' narrow payout table remains focusable and locally scrollable', await evaluate(`(() => { const region = document.querySelector('#distribution-view .table-container'); region.focus(); region.scrollLeft = region.scrollWidth; return document.activeElement === region && region.scrollLeft > 0 && region.getBoundingClientRect().right <= innerWidth; })()`));
                const payoutImage = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(path.join(out, `distribution-${theme}-${language}-${width}-payout-scroll.png`), Buffer.from(payoutImage.data, 'base64'));
            }
        }
    }
    await navigate('settings'); await until(`document.querySelector('#settings-workspace-name').textContent === 'Attendance QA'`);
    check('Settings language and theme preferences remain functional', await evaluate(`document.querySelector('#settings-language input[value="pt"]').checked && document.querySelector('#settings-theme input[value="dark"]').checked`));
    check('no unexpected JavaScript exceptions', errors, []);
    check('no DELETE or attendance writes; only explicit Employee edit and financial endpoints mutate fixtures', requests.every(request => request.method === 'GET' || request.method === 'POST' && ['/api/distributions', '/api/distributions/preview'].includes(request.path) || request.method === 'PATCH' && request.path === '/api/employees/42'));
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ passed: checks.length, checks, requests, errors }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, out }));
    await send('Browser.close'); socket.close(); server.close();
})().catch(error => { console.error(error); fs.writeFileSync(path.join(out, 'failure.txt'), error.stack || String(error)); socket?.close(); child?.kill(); server?.close(); process.exitCode = 1; });
