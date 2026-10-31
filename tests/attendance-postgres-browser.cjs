// Explicit opt-in: real API and local attendance cloned into session TEMP tables.
// No operational writes: all SQL mutations use pg_temp and are rolled back.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
if (process.env.RUN_ATTENDANCE_PG_TESTS !== '1') {
    console.log('SKIP: set RUN_ATTENDANCE_PG_TESTS=1 for rollback-only real PostgreSQL browser verification.');
    process.exit(0);
}
const root = path.resolve(__dirname, '..');
require(path.join(root, 'server/node_modules/dotenv')).config({ path: path.join(root, 'server/.env'), quiet: true });
const pool = require('../server/src/db/pool');
const app = require('../server/src/app');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tip-attendance-pg-browser-'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], errors = [], requests = [];
let client, apiServer, fileServer, child, socket;
const original = { query: pool.query, connect: pool.connect };

async function checksum() {
    return (await client.query(`SELECT
        (SELECT md5(COALESCE(string_agg(row_to_json(w)::text,'' ORDER BY id),'')) FROM public.workspaces w) AS workspaces,
        (SELECT md5(COALESCE(string_agg(row_to_json(l)::text,'' ORDER BY id),'')) FROM public.locations l) AS locations,
        (SELECT md5(COALESCE(string_agg(row_to_json(e)::text,'' ORDER BY id),'')) FROM public.employees e) AS employees,
        (SELECT md5(COALESCE(string_agg(row_to_json(el)::text,'' ORDER BY employee_id,location_id),'')) FROM public.employee_locations el) AS assignments,
        (SELECT md5(COALESCE(string_agg(row_to_json(a)::text,'' ORDER BY id),'')) FROM public.attendance a) AS attendance,
        (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY id),'')) FROM public.distributions d) AS distributions,
        (SELECT md5(COALESCE(string_agg(row_to_json(i)::text,'' ORDER BY id),'')) FROM public.distribution_items i) AS items`)).rows[0];
}

(async () => {
    console.log('Evidence:', out);
    client = await original.connect.call(pool);
    const before = await checksum();
    await client.query('BEGIN');
    await client.query('SET LOCAL search_path TO pg_temp');
    const schema = fs.readFileSync(path.join(root, 'server/src/db/migrations/001_initial_schema.sql'), 'utf8').replace(/\bBEGIN;|\bCOMMIT;/g, '').replace(/CREATE TABLE /g, 'CREATE TEMP TABLE ');
    await client.query(schema);
    await client.query('CREATE TEMP TABLE workspaces (LIKE public.workspaces INCLUDING ALL)');
    await client.query('INSERT INTO pg_temp.workspaces SELECT * FROM public.workspaces');
    await client.query('INSERT INTO pg_temp.locations(id,name,active) OVERRIDING SYSTEM VALUE SELECT id,name,active FROM public.locations');
    await client.query('INSERT INTO pg_temp.employees(id,employee_code,name,email,role,active) OVERRIDING SYSTEM VALUE SELECT id,employee_code,name,email,role,active FROM public.employees');
    await client.query('INSERT INTO pg_temp.employee_locations(employee_id,location_id) SELECT employee_id,location_id FROM public.employee_locations');
    await client.query('INSERT INTO pg_temp.attendance(employee_id,work_date,status,clock_in,clock_out,source) SELECT employee_id,work_date,status,clock_in,clock_out,source FROM public.attendance');
    const period = (await client.query(`SELECT EXTRACT(YEAR FROM work_date)::int AS year, EXTRACT(MONTH FROM work_date)::int AS month FROM attendance WHERE status='worked' ORDER BY work_date DESC LIMIT 1`)).rows[0];
    assert.ok(period, 'Existing local attendance is required for real-data verification.');
    pool.query = (...args) => client.query(...args);
    pool.connect = async () => ({
        query(sql, params) {
            if (sql.startsWith('BEGIN')) return client.query('SAVEPOINT browser_distribution_request');
            if (sql === 'COMMIT') return client.query('RELEASE SAVEPOINT browser_distribution_request');
            if (sql === 'ROLLBACK') return client.query('ROLLBACK TO SAVEPOINT browser_distribution_request');
            return client.query(sql, params);
        }, release() {}
    });
    apiServer = app.listen(0, '127.0.0.1');
    await new Promise(resolve => apiServer.once('listening', resolve));
    const apiBase = 'http://127.0.0.1:' + apiServer.address().port;
    const actual = await (await fetch(`${apiBase}/api/attendance?year=${period.year}&month=${period.month}`)).json();
    const participants = actual.employees.filter(employee => employee.daysWorked > 0);
    const totalDays = participants.reduce((sum, employee) => sum + employee.daysWorked, 0);
    assert.ok(participants.length > 0 && totalDays > 0);
    fileServer = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return response.writeHead(404).end();
        response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
        response.end(fs.readFileSync(file));
    });
    await new Promise(resolve => fileServer.listen(0, '127.0.0.1', resolve));
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
    const intercept = async ({ requestId, request }) => {
        const url = new URL(request.url);
        if (url.hostname !== 'localhost') return send('Fetch.fulfillRequest', { requestId, responseCode: 200, body: '' });
        if (request.method === 'OPTIONS') return respond(requestId, {});
        // Forward to the real Express API connected exclusively to TEMP tables.
        assert.ok(request.method === 'GET' || request.method === 'POST' && ['/api/distributions', '/api/distributions/preview'].includes(url.pathname), 'Unexpected browser mutation: ' + request.method + ' ' + url.pathname);
        const response = await fetch(apiBase + url.pathname + url.search, { method: request.method, headers: { 'Content-Type': 'application/json' }, ...(request.postData ? { body: request.postData } : {}) });
        const data = await response.json();
        requests.push({ method: request.method, path: url.pathname, query: url.search, status: response.status });
        return respond(requestId, data, response.status);
    };
    socket.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.id) { const item = pending.get(message.id); pending.delete(message.id); if (item) message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result); }
        else if (message.method === 'Fetch.requestPaused') intercept(message.params).catch(error => { errors.push(error.message); respond(message.params.requestId, { error: 'Test API forwarding failed.' }, 500).catch(() => {}); });
        else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
        else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(arg => arg.value || arg.description));
    };
    const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
    const until = async expression => { for (let index = 0; index < 150; index++) { if (await evaluate(expression)) return; await pause(40); } throw new Error('Timeout: ' + expression + '\n' + JSON.stringify({ errors, requests })); };
    const check = (name, actual, expected = true) => { assert.deepEqual(actual, expected, name); checks.push(name); console.log('PASS', name); };
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const screenshot = async name => { const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(image.data, 'base64')); };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Fetch.enable', { patterns: [{ urlPattern: 'http://localhost:3000/api/*' }, { urlPattern: 'https://fonts.googleapis.com/*' }, { urlPattern: 'https://fonts.gstatic.com/*' }, { urlPattern: 'https://cdn.jsdelivr.net/*' }] });
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'http://127.0.0.1:' + fileServer.address().port + '/#distribution' });
    await until(`typeof state !== 'undefined' && !state.loadingAttendance && state.attendanceReady`);
    await evaluate(`selectPeriod(${period.year}, ${period.month})`);
    await until(`!state.loadingAttendance && state.attendanceReady && !state.attendanceError`);
    check('browser loads real PostgreSQL active employees', await evaluate(`state.distributionEmployees.length`), actual.employees.length);
    check('browser automatically participates every real eligible employee', await evaluate(`getParticipants().map(person => person.id)`), participants.map(person => person.id));
    check('real Worked Days match API aggregates', await evaluate(`getParticipants().reduce((sum,person) => sum + person.daysWorked,0)`), totalDays);
    check('real UI has no manual participant controls', await evaluate(`!document.querySelector('#employee-rows input[type="checkbox"]') && !document.querySelector('#include-visible-button')`));
    await evaluate(`document.querySelector('#tips').value = '1234.57'; document.querySelector('#tips').dispatchEvent(new Event('input',{bubbles:true}))`);
    await click('#calculate-button'); await until(`state.preview && !state.calculating`);
    const preview = await evaluate(`({ totalTipsCents:state.preview.totalTipsCents,totalWorkedDays:state.preview.totalWorkedDays,payments:state.preview.payments.map(payment=>[payment.id,payment.daysWorked,payment.workedMinutes,payment.amountCents]) })`);
    check('real backend preview exactly conserves 123457 cents', await evaluate(`state.preview.totalTipsCents === 123457 && state.preview.totalDistributedCents === 123457 && state.preview.payments.reduce((sum,payment)=>sum+payment.amountCents,0) === 123457`));
    check('real preview preserves automatic participant count and day total', await evaluate(`state.preview.employeeCount === ${participants.length} && state.preview.totalWorkedDays === ${totalDays}`));
    check('preview does not persist a TEMP distribution', (await client.query('SELECT COUNT(*)::int AS count FROM pg_temp.distributions')).rows[0].count, 0);
    await screenshot('real-postgres-preview-1440');
    await click('#calculate-button'); await until(`document.querySelector('#confirm-dialog').open`); await click('#confirm-distribution'); await until(`state.confirmed && !state.confirming`);
    const confirmed = await evaluate(`({id:state.confirmed.id,payments:state.confirmed.payments.map(payment=>[payment.id,payment.daysWorked,payment.workedMinutes,payment.amountCents])})`);
    check('real confirmed allocations equal reviewed preview by database employee ID', confirmed.payments.slice().sort((a,b)=>a[0]-b[0]), preview.payments.slice().sort((a,b)=>a[0]-b[0]));
    check('real confirmation writes one TEMP header', (await client.query('SELECT COUNT(*)::int AS count FROM pg_temp.distributions')).rows[0].count, 1);
    const saved = (await client.query('SELECT employee_id,worked_days,worked_minutes,payout_cents FROM pg_temp.distribution_items ORDER BY employee_id')).rows.map(item => [item.employee_id,item.worked_days,item.worked_minutes,Number(item.payout_cents)]);
    check('every real confirmed allocation persists exact employee identity days minutes and cents', saved, preview.payments.slice().sort((a,b)=>a[0]-b[0]));
    await click('.main-navigation [data-view="history"]'); await until(`state.historyLoaded && state.history.length === 1`); await click('.history-open'); await until(`state.historyDetail && !document.querySelector('#history-detail').hidden`);
    check('real History detail reads saved PostgreSQL allocation snapshot', await evaluate(`({id:state.historyDetail.id,count:state.historyDetail.items.length,allocated:state.historyDetail.allocatedCents,method:state.historyDetail.allocationMethod})`), { id:Number(confirmed.id),count:participants.length,allocated:123457,method:'worked_days' });
    const historyBefore = await evaluate(`JSON.stringify(state.historyDetail)`);
    await client.query('UPDATE pg_temp.employees SET name=$1,role=$2 WHERE id=$3', ['Changed TEMP employee','Changed TEMP role',participants[0].id]);
    await client.query("UPDATE pg_temp.attendance SET status='vacation' WHERE employee_id=$1 AND work_date=(SELECT MIN(work_date) FROM pg_temp.attendance WHERE employee_id=$1 AND status='worked')", [participants[0].id]);
    await evaluate(`openHistoryDistribution(${Number(confirmed.id)})`);
    check('real History immutable after later TEMP employee and attendance edits', await evaluate(`JSON.stringify(state.historyDetail)`), historyBefore);
    await screenshot('real-postgres-history-1440');
    check('real API network completed without errors', requests.every(request => request.status >= 200 && request.status < 300));
    check('browser console and runtime have no unexpected errors', errors, []);
    check('all operational PostgreSQL checksums unchanged', await checksum(), before);
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:checks.length,checks,period,activeEmployees:actual.employees.length,participants:participants.length,totalWorkedDays:totalDays,poolCents:123457,requests,errors,operationalChecksumsUnchanged:true,limitations:'Real local attendance cloned to TEMP; new confirmations and mutation checks rolled back. External fonts/icons stubbed.'},null,2));
    console.log(JSON.stringify({passed:checks.length,out,period,activeEmployees:actual.employees.length,participants:participants.length,totalWorkedDays:totalDays,operationalChecksumsUnchanged:true}));
    await send('Browser.close');
})().catch(error => { console.error(error); fs.writeFileSync(path.join(out,'failure.txt'),error.stack || String(error)); process.exitCode = 1; }).finally(async () => {
    socket?.close(); child?.kill();
    if (fileServer) await new Promise(resolve => fileServer.close(resolve));
    if (apiServer) await new Promise(resolve => apiServer.close(resolve));
    pool.query = original.query; pool.connect = original.connect;
    if (client) { await client.query('ROLLBACK'); client.release(); }
    await pool.end();
});
