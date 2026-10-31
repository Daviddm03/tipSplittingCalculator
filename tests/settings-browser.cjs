const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tip-settings-browser-'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const locations = [
    { id: 11, name: 'Sky Bar', active: true },
    { id: 12, name: 'Wine & Jazz', active: true },
    { id: 13, name: 'Inactive Terrace', active: false },
    { id: 14, name: '<img src=x onerror="window.locationInjected=true">', active: true },
    { id: 15, name: 'Restaurante ' + 'LongLocationName'.repeat(8), active: true }
];
const displayLocations = [
    'Sky Bar', 'Wine Bar 1638', 'Wine & Jazz', 'Pool Bar', 'Restaurante 1638',
    'Restaurante Boa Vista', 'Cozinha 1638', 'Cozinha Central', 'Housekeeping', 'Eventos'
].map((name, index) => ({ id: index + 1, name, active: true }));
const employees = [
    { id: 1, employeeCode: 'QA001', name: 'Alice Test', role: 'Server', email: 'alice@example.test', active: true, locations: [locations[0]] },
    { id: 2, employeeCode: 'QA002', name: 'Bruno Test', role: 'Bartender', email: '', active: true, locations: [locations[1]] }
];
const workspace = { id: 1, name: 'Tivoli Porto', locationsEnabled: true };
const distribution = {
    id: 7, reference: 'DIST-QA-7', periodStart: '2026-09-01', employeeCount: 2,
    poolCents: 12000, allocatedCents: 12000, differenceCents: 0,
    status: 'confirmed',
    confirmedAt: '2026-10-01T12:00:00Z', allocationMethod: 'worked_days',
    attendanceSource: 'demo_hr', items: employees.map((employee, index) => ({
        employeeId: employee.id,
        employeeName: employee.name, employeeCode: employee.employeeCode,
        role: employee.role, locations: employee.locations.map(location => location.name),
        workedDays: index + 1, workedMinutes: (index + 1) * 480, payoutCents: (index + 1) * 4000
    }))
};
let child, socket, server;

(async () => {
    console.log('Evidence:', out);
    server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            response.writeHead(404).end();
            return;
        }
        response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
        response.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const profile = path.join(out, 'chrome-profile');
    child = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
        '--headless=new', '--disable-gpu', '--disable-software-rasterizer', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile,
        '--no-first-run', '--no-default-browser-check', 'about:blank'
    ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', error => { stderr += error.message; });
    let port;
    for (let attempt = 0; attempt < 100; attempt++) {
        try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; }
        catch { await pause(100); }
    }
    if (!port) throw new Error('Chrome failed: ' + stderr.slice(-1500));
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = () => reject(new Error('Chrome connection failed: ' + stderr.slice(-1500))); });
    let messageId = 0;
    const pending = new Map();
    const errors = [];
    const requests = [];
    const checks = [];
    const metrics = [];
    let locationMode = 'hold';
    let workspaceMode = 'hold';
    let mutationMode = 'success';
    let employeeMode = 'success';
    const heldEmployeeWrites = [];
    let nextLocationId = 20;
    const heldLocations = [];
    const heldWorkspaces = [];
    const heldWorkspaceWrites = [];
    const heldLocationWrites = [];
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++messageId;
        const timeout = setTimeout(() => {
            pending.delete(id);
            reject(new Error('CDP timeout: ' + method + '\n' + stderr.slice(-1500)));
        }, 15000);
        pending.set(id, {
            resolve: value => { clearTimeout(timeout); resolve(value); },
            reject: error => { clearTimeout(timeout); reject(error); }
        });
        socket.send(JSON.stringify({ id, method, params }));
    });
    const respond = (requestId, data, status = 200) => send('Fetch.fulfillRequest', {
        requestId, responseCode: status,
        responseHeaders: [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Access-Control-Allow-Origin', value: '*' },
            { name: 'Access-Control-Allow-Headers', value: 'Content-Type' },
            { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PATCH, OPTIONS' }
        ],
        body: Buffer.from(JSON.stringify(data)).toString('base64')
    });
    const intercept = async event => {
        const { requestId, request } = event;
        const url = new URL(request.url);
        if (url.hostname !== 'localhost') return send('Fetch.fulfillRequest', {
            requestId, responseCode: 200,
            responseHeaders: [{ name: 'Content-Type', value: 'text/css' }], body: ''
        });
        if (request.method === 'OPTIONS') return respond(requestId, {});
        const body = request.postData ? JSON.parse(request.postData) : null;
        requests.push({ method: request.method, path: url.pathname, query: url.search, body });
        if (url.pathname === '/api/workspace') {
            if (workspaceMode === 'hold' && request.method === 'GET') { heldWorkspaces.push(requestId); return; }
            if (workspaceMode === 'error') return respond(requestId, { error: 'Workspace temporarily unavailable.', code: 'WORKSPACE_UNAVAILABLE' }, 503);
            if (request.method === 'PATCH') {
                if (mutationMode === 'hold') { heldWorkspaceWrites.push({ requestId, body }); return; }
                if (mutationMode === 'error') return respond(requestId, { error: 'Save failed.', code: 'INVALID_NAME' }, 400);
                Object.assign(workspace, body);
            }
            return respond(requestId, { workspace });
        }
        if (request.method === 'POST' && url.pathname === '/api/locations') {
            if (mutationMode === 'hold') { heldLocationWrites.push({ requestId, body }); return; }
            if (mutationMode === 'error') return respond(requestId, { error: 'Save failed.', code: 'INVALID_NAME' }, 400);
            if (locations.some(item => item.name.toLowerCase() === body.name.trim().toLowerCase())) return respond(requestId, { error: 'Location already exists.', code: 'LOCATION_NAME_EXISTS' }, 409);
            const location = { id: nextLocationId++, name: body.name.trim(), active: true };
            locations.push(location);
            return respond(requestId, { location }, 201);
        }
        if (request.method === 'PATCH' && /^\/api\/locations\/\d+$/.test(url.pathname)) {
            const location = locations.find(item => item.id === Number(url.pathname.split('/').pop()));
            if (mutationMode === 'error') return respond(requestId, { error: 'Save failed.', code: 'INVALID_NAME' }, 400);
            if (locations.some(item => item.id !== location.id && item.name.toLowerCase() === body.name.trim().toLowerCase())) return respond(requestId, { error: 'Location already exists.', code: 'LOCATION_NAME_EXISTS' }, 409);
            Object.assign(location, body);
            employees.forEach(employee => { employee.locations = employee.locations.map(item => item.id === location.id ? { ...location } : item); });
            return respond(requestId, { location });
        }
        if (['POST', 'PATCH'].includes(request.method) && /^\/api\/employees(?:\/\d+)?$/.test(url.pathname)) {
            if (employeeMode === 'hold') { heldEmployeeWrites.push({ requestId, body, method: request.method, path: url.pathname }); return; }
            if (employeeMode === 'error') return respond(requestId, { error: 'Employee save unavailable.', code: 'INTERNAL_ERROR' }, 503);
            const creating = request.method === 'POST';
            const employee = creating ? { id: Math.max(...employees.map(item => item.id)) + 1, locations: [] } : employees.find(item => item.id === Number(url.pathname.split('/').pop()));
            const { locationIds, ...fields } = body;
            Object.assign(employee, fields);
            if (locationIds !== undefined) employee.locations = locationIds.map(id => ({ ...locations.find(item => item.id === id) }));
            if (creating) employees.push(employee);
            return respond(requestId, { employee }, creating ? 201 : 200);
        }
        if (request.method === 'POST' && url.pathname === '/api/distributions/preview') {
            return respond(requestId, {
                ...attendanceResponse(body.year, body.month),
                previewFingerprint: 'b'.repeat(64),
                calculation: { poolCents: body.poolCents, totalWorkedDays: 3, allocatedCents: body.poolCents, differenceCents: 0, allocations: [
                    { employeeId: 1, workedDays: 1, payoutCents: Math.round(body.poolCents / 3) },
                    { employeeId: 2, workedDays: 2, payoutCents: body.poolCents - Math.round(body.poolCents / 3) }
                ] }
            });
        }
        if (request.method !== 'GET') throw new Error('Unexpected API mutation: ' + request.method + ' ' + request.url);
        if (url.pathname === '/api/locations') {
            if (locationMode === 'hold') { heldLocations.push(requestId); return; }
            if (locationMode === 'error') return respond(requestId, { error: 'Locations temporarily unavailable.' }, 503);
            if (locationMode === 'invalid') return respond(requestId, { locations: null });
            return respond(requestId, { locations: locationMode === 'empty' ? [] : locationMode === 'display' ? displayLocations : locations });
        }
        if (url.pathname === '/api/employees') return respond(requestId, { employees });
        if (url.pathname === '/api/attendance') {
            return respond(requestId, attendanceResponse(Number(url.searchParams.get('year')), Number(url.searchParams.get('month'))));
        }
        if (url.pathname === '/api/distributions') return respond(requestId, { distributions: [distribution] });
        if (url.pathname === '/api/distributions/7') return respond(requestId, distribution);
        throw new Error('Unexpected API endpoint: ' + request.url);
    };
    function attendanceResponse(year, monthNumber) {
        const month = String(monthNumber).padStart(2, '0');
        return { period: { year, month: monthNumber }, source: 'postgresql_attendance', employees: employees.filter(employee => employee.active).map((employee, index) => ({
                ...employee, reference: employee.employeeCode, daysWorked: index + 1,
                eligible: true,
                workedMinutes: (index + 1) * 480, absences: 0, vacationDays: 0, daysOff: 0,
                attendance: Array.from({ length: index + 1 }, (_, day) => ({
                    date: `${year}-${month}-${String(day + 1).padStart(2, '0')}`, status: 'worked',
                    clockIn: '09:00', clockOut: '17:00', clockOutNextDay: false, workedMinutes: 480
                }))
            })) };
    }
    socket.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.id) {
            const item = pending.get(message.id);
            pending.delete(message.id);
            message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result);
        } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
        else if (message.method === 'Log.entryAdded' && message.params.entry.source === 'javascript' && message.params.entry.level === 'error') errors.push(message.params.entry);
        else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args);
        else if (message.method === 'Fetch.requestPaused') intercept(message.params).catch(error => {
            errors.push(error.message);
            respond(message.params.requestId, { error: error.message }, 500).catch(() => {});
        });
    };
    socket.onclose = () => {
        for (const item of pending.values()) item.reject(new Error('Chrome connection closed. ' + stderr.slice(-1500)));
        pending.clear();
    };
    const evaluate = async expression => {
        const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
    };
    const until = async expression => {
        for (let attempt = 0; attempt < 100; attempt++) {
            if (await evaluate(expression)) return;
            await pause(50);
        }
        const diagnostics = await evaluate(`({ url: location.href, readyState: document.readyState, title: document.title, text: document.body?.innerText.slice(0, 500) })`);
        throw new Error('Timeout: ' + expression + '\n' + JSON.stringify({ diagnostics, errors, requests }));
    };
    const waitForRequests = async (count, pathname = '/api/locations') => {
        for (let attempt = 0; attempt < 100; attempt++) {
            if (requests.filter(request => request.path === pathname).length >= count) return;
            await pause(50);
        }
        throw new Error('Expected ' + count + ' requests for ' + pathname);
    };
    const waitHeld = async queue => {
        for (let attempt = 0; attempt < 100; attempt++) {
            if (queue.length) return;
            await pause(50);
        }
        throw new Error('Expected held mutation request');
    };
    const check = (name, actual, expected = true) => {
        assert.deepEqual(actual, expected, name);
        checks.push(name);
        console.log('PASS', name);
    };
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const key = async (value, code, virtualKeyCode, modifiers = 0) => {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: value, code, windowsVirtualKeyCode: virtualKeyCode, modifiers });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: value, code, windowsVirtualKeyCode: virtualKeyCode, modifiers });
    };
    const input = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const navigate = async view => {
        await click('.main-navigation [data-view="' + view + '"]');
        await until(`!document.querySelector('#${view}-view').hidden && location.hash === '#${view}'`);
    };
    let pageLoad = 0;
    const load = async (view = 'settings') => {
        await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/?scenario=' + (++pageLoad) + '#' + view });
        await until(`document.readyState === 'complete' && Boolean(document.querySelector('#${view}-view')) && !document.querySelector('#${view}-view').hidden`);
    };
    const screenshot = async name => {
        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(shot.data, 'base64'));
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Fetch.enable', { patterns: [
        { urlPattern: 'http://localhost:3000/api/*', requestStage: 'Request' },
        { urlPattern: 'https://fonts.googleapis.com/*', requestStage: 'Request' },
        { urlPattern: 'https://fonts.gstatic.com/*', requestStage: 'Request' },
        { urlPattern: 'https://cdn.jsdelivr.net/*', requestStage: 'Request' }
    ] });
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    const choose = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (el.matches('fieldset')) { const option = [...el.querySelectorAll('input[type="radio"]')].find(input => input.value === ${JSON.stringify(value)}); option.click(); } else { el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
    const setChecked = (selector, checked) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.checked = ${checked}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    const writes = () => requests.filter(request => request.method !== 'GET').length;
    const waitLocations = () => until(`document.querySelector('#settings-locations-content').getAttribute('aria-busy') === 'false' && document.querySelectorAll('#settings-location-list li').length === ${locations.filter(item => item.active).length}`);
    const editLocation = async id => { await click(`[data-location-id="${id}"]`); await until(`document.querySelector('#settings-location-dialog').open`); };
    const saveLocation = async () => { await click('#settings-location-save'); await until(`!document.querySelector('#settings-location-dialog').open`); };
    const darkSurface = async selector => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el?.checkVisibility()) return false; for (let node = el; node; node = node.parentElement) { const parts = getComputedStyle(node).backgroundColor.match(/[0-9.]+/g)?.map(Number); if (parts?.length >= 3 && (parts.length < 4 || parts[3] > 0)) return Math.max(...parts.slice(0, 3)) < 170; } return false; })()`);
    await load();
    await waitForRequests(1, '/api/workspace');
    check('Workspace loading exposes status and disables editing', await evaluate(`document.querySelector('#settings-workspace-feedback').textContent.includes('Loading') && document.querySelector('#settings-workspace-edit').disabled && document.querySelector('#settings-workspace-feedback').getAttribute('role') === 'status'`));
    workspaceMode = 'success';
    while (heldWorkspaces.length) await respond(heldWorkspaces.shift(), { workspace });
    await until(`document.querySelector('#settings-workspace-name').textContent === 'Tivoli Porto'`);
    check('Settings four semantic sections', await evaluate(`Array.from(document.querySelectorAll('#settings-view .settings-section h2'), el => el.textContent.trim())`), ['Workspace', 'Distribution', 'Locations', 'Preferences']);
    check('unique page IDs', await evaluate(`(() => { const ids = [...document.querySelectorAll('[id]')].map(el => el.id); return ids.length === new Set(ids).size; })()`));
    check('new browser defaults English and System', await evaluate(`[document.documentElement.lang, document.querySelector('#settings-language input:checked')?.value ?? document.querySelector('#settings-language').value, document.querySelector('#settings-theme input:checked')?.value ?? document.querySelector('#settings-theme').value]`), ['en', 'en', 'system']);
    await waitForRequests(1);
    check('Locations accessible loading and unknown count', await evaluate(`document.querySelector('#settings-locations-content').getAttribute('aria-busy') === 'true' && document.querySelector('#settings-locations-feedback').getAttribute('role') === 'status' && /loading/i.test(document.querySelector('#settings-locations-feedback').textContent) && document.querySelector('#settings-location-count').hidden`));
    await navigate('employees');
    await waitForRequests(1, '/api/employees');
    await navigate('settings');
    check('Employees and Settings share in-flight request', requests.filter(request => request.path === '/api/locations').length, 1);
    locationMode = 'success';
    while (heldLocations.length) await respond(heldLocations.shift(), { locations });
    await waitLocations();
    check('default list active only', await evaluate(`Array.from(document.querySelectorAll('#settings-location-list li'), el => el.firstElementChild.textContent.trim()).sort()`), locations.filter(item => item.active).map(item => item.name).sort());
    check('count includes inactive', await evaluate(`parseInt(document.querySelector('#settings-location-count').textContent, 10)`), locations.length);
    check('HTML-like names safe text', await evaluate(`!window.locationInjected && !document.querySelector('#settings-location-list img, #settings-location-list script') && document.querySelector('#settings-location-list').textContent.includes('<img src=x')`));
    await setChecked('#settings-show-inactive', true);
    check('show inactive exposes preserved locations', await evaluate(`document.querySelectorAll('#settings-location-list li').length`), locations.length);
    await setChecked('#settings-show-inactive', false);
    const beforeCancel = writes();
    await click('#settings-workspace-edit');
    await input('#settings-workspace-input', 'Discarded');
    await click('#settings-workspace-cancel');
    check('Workspace cancel no write and restores discarded input', await evaluate(`document.querySelector('#settings-workspace-name').textContent === 'Tivoli Porto' && document.querySelector('#settings-workspace-form').hidden && document.querySelector('#settings-workspace-input').value === 'Tivoli Porto'`) && writes() === beforeCancel);
    await click('#settings-workspace-edit');
    check('Workspace cancel restores persisted input on reopen', await evaluate(`document.querySelector('#settings-workspace-input').value`), 'Tivoli Porto');
    await input('#settings-workspace-input', '   ');
    await click('#settings-workspace-save');
    check('Workspace validation prevents write', await evaluate(`document.querySelector('#settings-workspace-input').getAttribute('aria-invalid') === 'true'`) && writes() === beforeCancel);
    await input('#settings-workspace-input', 'Invalid\u0001name');
    await click('#settings-workspace-save');
    check('Workspace control characters rejected without API write', await evaluate(`document.querySelector('#settings-workspace-input').getAttribute('aria-invalid') === 'true'`) && writes() === beforeCancel);
    mutationMode = 'error';
    await input('#settings-workspace-input', 'QA Hospitality');
    await click('#settings-workspace-save');
    await until(`!document.querySelector('#settings-workspace-save').disabled && document.querySelector('#settings-workspace-feedback').classList.contains('is-error')`);
    check('Workspace API failure preserves edit', workspace.name === 'Tivoli Porto' && await evaluate(`!document.querySelector('#settings-workspace-form').hidden && document.querySelector('#settings-workspace-input').value === 'QA Hospitality'`));
    await pause(4200);
    check('Workspace error remains visible beyond success lifetime', await evaluate(`document.querySelector('#settings-workspace-feedback').classList.contains('is-error') && !!document.querySelector('#settings-workspace-feedback').textContent && !document.querySelector('#settings-workspace-form').hidden`));
    mutationMode = 'hold';
    await click('#settings-workspace-save');
    await until(`document.querySelector('#settings-workspace-form').getAttribute('aria-busy') === 'true'`);
    check('Workspace saving disables duplicate and cancel actions', workspace.name === 'Tivoli Porto' && await evaluate(`document.querySelector('#settings-workspace-save').disabled && document.querySelector('#settings-workspace-cancel').disabled && document.querySelector('#settings-workspace-input').disabled && document.querySelector('#settings-workspace-feedback').textContent.includes('Saving')`));
    await waitHeld(heldWorkspaceWrites);
    for (const held of heldWorkspaceWrites.splice(0)) { Object.assign(workspace, held.body); await respond(held.requestId, { workspace }); }
    mutationMode = 'success';
    await until(`document.querySelector('#settings-workspace-form').hidden`);
    check('Workspace saved API state and sidebar', workspace.name === 'QA Hospitality' && await evaluate(`document.querySelector('#sidebar-workspace-name').textContent === 'QA Hospitality' && document.querySelector('#settings-workspace-name').textContent === 'QA Hospitality'`));
    check('Workspace success is inline confirmation', await evaluate(`!!document.querySelector('#settings-workspace-feedback').textContent && !document.querySelector('#settings-workspace-feedback').classList.contains('is-error')`));
    await until(`!document.querySelector('#settings-workspace-feedback').textContent`);
    check('Workspace success confirmation expires', await evaluate(`document.querySelector('#settings-workspace-name').textContent`), 'QA Hospitality');
    await load();
    await until(`document.querySelector('#settings-workspace-name').textContent === 'QA Hospitality'`);
    check('Workspace reload backend source of truth', await evaluate(`document.querySelector('#sidebar-workspace-name').textContent`), workspace.name);
    await waitLocations();
    await click('#settings-add-location');
    check('Location dialog semantic label and focus', await evaluate(`document.querySelector('#settings-location-dialog').open && document.querySelector('#settings-location-dialog').getAttribute('aria-labelledby') === 'settings-location-dialog-heading' && document.activeElement.id === 'settings-location-input'`));
    await input('#settings-location-input', ' ');
    const beforeInvalid = writes();
    await click('#settings-location-save');
    check('Location validation no write', await evaluate(`document.querySelector('#settings-location-input').getAttribute('aria-invalid') === 'true'`) && writes() === beforeInvalid);
    await input('#settings-location-input', 'Invalid\u0001name');
    await click('#settings-location-save');
    check('Location control characters rejected without API write', await evaluate(`document.querySelector('#settings-location-input').getAttribute('aria-invalid') === 'true'`) && writes() === beforeInvalid);
    await input('#settings-location-input', '  sKy bAr  ');
    await click('#settings-location-save');
    await until(`document.querySelector('#settings-location-form-feedback').textContent.includes('already exists') && !document.querySelector('#settings-location-save').disabled`);
    check('Duplicate Location create preserves dialog and configured entries', locations.length === 5 && await evaluate(`document.querySelector('#settings-location-dialog').open && document.querySelector('#settings-location-input').value === '  sKy bAr  '`));
    mutationMode = 'error';
    await input('#settings-location-input', 'Garden QA');
    await click('#settings-location-save');
    await until(`document.querySelector('#settings-location-form-feedback').classList.contains('is-error')`);
    check('Location API error preserves dialog', await evaluate(`document.querySelector('#settings-location-dialog').open && document.querySelector('#settings-location-input').value === 'Garden QA'`));
    mutationMode = 'hold';
    await click('#settings-location-save');
    await until(`document.querySelector('#settings-location-form').getAttribute('aria-busy') === 'true'`);
    check('Location saving prevents duplicate submission and cancel', await evaluate(`document.querySelector('#settings-location-save').disabled && document.querySelector('#settings-location-cancel').disabled && document.querySelector('#settings-location-close').disabled && document.querySelector('#settings-location-input').disabled`));
    await waitHeld(heldLocationWrites);
    for (const held of heldLocationWrites.splice(0)) {
        const location = { id: nextLocationId++, name: held.body.name.trim(), active: true };
        locations.push(location);
        await respond(held.requestId, { location }, 201);
    }
    mutationMode = 'success';
    await until(`!document.querySelector('#settings-location-dialog').open`);
    check('Location create updates shared cache', locations.some(item => item.name === 'Garden QA') && await evaluate(`document.querySelector('#settings-location-list').textContent.includes('Garden QA') && state.locations.some(item => item.name === 'Garden QA')`));
    await until(`document.activeElement.id === 'settings-add-location'`);
    check('Created Location restores Add button focus', await evaluate(`document.activeElement.id`), 'settings-add-location');
    await pause(2400);
    await choose('#settings-language', 'pt');
    check('Location success survives language rerender in translated form', await evaluate(`document.querySelector('#settings-locations-feedback').textContent`), await evaluate(`TipSplitI18n.t('settings.locationsSaved')`));
    await pause(1800);
    check('Language change does not restart Location success expiry', await evaluate(`document.querySelector('#settings-locations-feedback').textContent`), '');
    await choose('#settings-language', 'en');
    await editLocation(11);
    await input('#settings-location-input', 'Wine & Jazz');
    await setChecked('#settings-location-active', false);
    await click('#settings-location-save');
    await until(`document.querySelector('#settings-location-form-feedback').textContent.includes('already exists') && !document.querySelector('#settings-location-save').disabled`);
    check('Duplicate Location edit preserves input, active selection and original cache', locations.find(item => item.id === 11).name === 'Sky Bar' && locations.find(item => item.id === 11).active && await evaluate(`document.querySelector('#settings-location-dialog').open && document.querySelector('#settings-location-input').value === 'Wine & Jazz' && !document.querySelector('#settings-location-active').checked && state.locations.find(item => item.id === 11).name === 'Sky Bar'`));
    mutationMode = 'error';
    await input('#settings-location-input', 'Sky QA');
    await click('#settings-location-save');
    await until(`document.querySelector('#settings-location-form-feedback').textContent.includes('between') && !document.querySelector('#settings-location-save').disabled`);
    check('Location PATCH failure retains original assignments and edited values', locations.find(item => item.id === 11).name === 'Sky Bar' && employees[0].locations[0].name === 'Sky Bar' && await evaluate(`document.querySelector('#settings-location-dialog').open && document.querySelector('#settings-location-input').value === 'Sky QA' && !document.querySelector('#settings-location-active').checked`));
    mutationMode = 'success';
    await setChecked('#settings-location-active', true);
    await input('#settings-location-input', 'Sky QA');
    await saveLocation();
    await navigate('employees');
    await until(`document.querySelectorAll('#employees-rows .employee-edit-button').length === 2`);
    check('rename updates employee and filter caches', await evaluate(`document.querySelector('#employees-rows').textContent.includes('Sky QA') && document.querySelector('#employees-location-menu').textContent.includes('Sky QA') && !document.querySelector('#employees-rows').textContent.includes('Sky Bar')`));
    await click('#employees-rows .employee-edit-button');
    await until(`document.querySelector('#employee-dialog').open`);
    check('Created and renamed Locations immediately update employee assignment options', await evaluate(`document.querySelector('#employee-form-locations').textContent.includes('Garden QA') && document.querySelector('#employee-form-locations').textContent.includes('Sky QA') && !document.querySelector('#employee-form-locations').textContent.includes('Sky Bar')`));
    await click('#cancel-employee-form');
    await input('#employees-search', 'Alice');
    check('employee search regression', await evaluate(`document.querySelectorAll('#employees-rows .employee-edit-button').length === 1 && document.querySelector('#employees-rows').textContent.includes('Alice Test')`));
    await input('#employees-search', '');
    await navigate('settings');
    await editLocation(11);
    await setChecked('#settings-location-active', false);
    await saveLocation();
    check('deactivate preserves relationship and hides active row', !locations.find(item => item.id === 11).active && employees[0].locations.some(item => item.id === 11) && await evaluate(`!document.querySelector('[data-location-id="11"]')`));
    await navigate('employees');
    await click('#employees-rows .employee-edit-button');
    await until(`document.querySelector('#employee-dialog').open`);
    check('inactive Location unavailable for new assignment', await evaluate(`!document.querySelector('#employee-form-locations input[value="11"]:not(:disabled)')`));
    await input('#employee-form-role', 'QA Server');
    await click('#save-employee');
    await until(`!document.querySelector('#employee-dialog').open`);
    check('unrelated employee edit retains inactive relationship', employees[0].role === 'QA Server' && employees[0].locations.some(item => item.id === 11));
    await navigate('settings');
    await setChecked('#settings-show-inactive', true);
    await editLocation(11);
    await setChecked('#settings-location-active', true);
    await saveLocation();
    check('reactivate retains IDs and assignments', locations.find(item => item.id === 11).active && employees[0].locations.some(item => item.id === 11));
    await setChecked('#settings-show-inactive', false);
    await navigate('distribution');
    await until(`typeof state !== 'undefined' && !state.loadingAttendance && document.querySelectorAll('#employee-rows .employee-details-button').length === 2`);
    await input('#tips', '120.00');
    await click('#calculate-button');
    await until(`state.preview && !state.calculating`);
    check('worked days exact pool conservation', await evaluate(`state.preview && [state.preview.totalTipsCents, state.preview.totalDistributedCents, state.preview.payments.map(payment => payment.amountCents)]`), [12000, 12000, [4000, 8000]]);
    await input('#employee-search', 'Alice');
    check('distribution filtering preserves payout population', await evaluate(`document.querySelectorAll('#employee-rows .employee-details-button').length === 1 && state.preview.totalDistributedCents === 12000 && state.preview.payments.length === 2`));
    await input('#employee-search', '');
    const payoutSnapshot = await evaluate(`JSON.stringify(state.preview)`);
    const historySnapshot = JSON.stringify(distribution);
    await navigate('settings');
    mutationMode = 'error';
    await setChecked('#settings-locations-enabled', false);
    await until(`document.querySelector('#settings-locations-toggle-feedback').classList.contains('is-error') && !document.querySelector('#settings-locations-enabled').disabled`);
    check('Locations toggle API failure restores saved state and preserves assignments', workspace.locationsEnabled && employees[0].locations.some(item => item.id === 11) && await evaluate(`document.documentElement.dataset.locationsEnabled === 'true' && document.querySelector('#settings-locations-enabled').checked`));
    mutationMode = 'success';
    await setChecked('#settings-locations-enabled', false);
    await until(`document.documentElement.dataset.locationsEnabled === 'false' && !document.querySelector('#settings-locations-enabled').disabled`);
    check('Disabled Locations explanation remains visible while management available', await evaluate(`document.querySelector('#settings-locations-disabled-note').checkVisibility() && !!document.querySelector('#settings-locations-disabled-note').textContent.trim() && !document.querySelector('#settings-add-location').disabled && document.querySelector('#settings-location-list').checkVisibility()`));
    await navigate('distribution');
    check('disabled distribution Location controls hidden', await evaluate(`!document.querySelector('#location-filter').checkVisibility() && !document.querySelector('#distribution-view .employee-table .location-column').checkVisibility()`));
    check('disabled Locations preserve preview exactly', await evaluate(`JSON.stringify(state.preview)`), payoutSnapshot);
    await navigate('employees');
    check('disabled employee Location filter hidden', await evaluate(`!document.querySelector('#employees-location-filter').checkVisibility()`));
    await click('#employees-rows .employee-edit-button');
    await until(`document.querySelector('#employee-dialog').open`);
    check('disabled employee Location assignment hidden', await evaluate(`!document.querySelector('#employee-form-locations').checkVisibility()`));
    await input('#employee-form-role', 'QA Lead');
    await click('#save-employee');
    await until(`!document.querySelector('#employee-dialog').open`);
    const employeeWrite = requests.filter(request => request.path === '/api/employees/1' && request.method === 'PATCH').at(-1);
    check('disabled employee edit omits locationIds preserving assignments', !Object.hasOwn(employeeWrite.body, 'locationIds') && employees[0].locations.some(item => item.id === 11));
    await navigate('history');
    await until(`document.querySelector('#history-rows .history-open')`);
    await click('#history-rows .history-open');
    await until(`!document.querySelector('#history-detail').hidden`);
    check('History Location snapshots visible while disabled', await evaluate(`document.querySelector('#history-detail').textContent.includes('Sky Bar')`));
    await navigate('settings');
    check('Settings header navigation focus after History detail', await evaluate(`document.querySelector('.settings-page-header').checkVisibility() && document.querySelector('#history-view').hidden && document.activeElement.id === 'settings-heading' && document.querySelectorAll('.main-navigation [aria-current="page"]').length === 1`));
    await setChecked('#settings-locations-enabled', true);
    await until(`document.documentElement.dataset.locationsEnabled === 'true' && !document.querySelector('#settings-locations-enabled').disabled`);
    await navigate('employees');
    check('reenable restores filters and relationships', await evaluate(`document.querySelector('#employees-location-filter').checkVisibility() && document.querySelector('#employees-rows').textContent.includes('Sky QA')`));
    await navigate('distribution');
    await until(`state.attendanceReady && !state.loadingAttendance && !state.calculating`);
    await click('#calculate-button');
    await until(`currentPreview() && !state.calculating`);
    await navigate('settings');
    const beforePreferences = writes();
    const preferencePreview = await evaluate(`JSON.stringify(state.preview)`);
    check('Preferences use labeled native radio groups', await evaluate(`['language', 'theme'].every(kind => { const group = document.querySelector('#settings-' + kind); return group.matches('fieldset') && document.getElementById(group.getAttribute('aria-labelledby'))?.textContent.trim() && !group.querySelector('select') && [...group.querySelectorAll('input')].every(input => input.type === 'radio' && input.name === 'tipSplit-' + kind); })`));
    await choose('#settings-language', 'en');
    await choose('#settings-theme', 'light');
    await evaluate(`document.querySelector('#settings-language input[value="en"]').focus()`);
    await key('ArrowRight', 'ArrowRight', 39);
    check('Language native arrow key changes preference and retains radio focus', await evaluate(`document.documentElement.lang === 'pt' && document.activeElement.matches('#settings-language input[value="pt"]:checked')`));
    await key('Tab', 'Tab', 9);
    check('Tab advances from Language to Theme selected radio', await evaluate(`document.activeElement.matches('#settings-theme input[value="light"]:checked')`));
    await key('ArrowRight', 'ArrowRight', 39);
    check('Theme native arrow key changes preference and retains radio focus', await evaluate(`document.documentElement.dataset.theme === 'dark' && document.activeElement.matches('#settings-theme input[value="dark"]:checked')`));
    check('Preference keyboard focus is visible', await evaluate(`(() => { const el = document.activeElement; const style = getComputedStyle(el); const labelStyle = getComputedStyle(el.closest('label')); return el.matches(':focus-visible') && ((style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || (labelStyle.outlineStyle !== 'none' && parseFloat(labelStyle.outlineWidth) > 0) || labelStyle.boxShadow !== 'none'); })()`));
    await choose('#settings-language', 'en');
    await choose('#settings-theme', 'light');
    check('English currency keeps maximum safe cents exact', await evaluate(`[formatCurrencyFromCents(Number.MAX_SAFE_INTEGER), formatCurrencyFromCents(-1)].map(value => value.replace(/[^0-9.,-]/g, ''))`), ['90,071,992,547,409.91', '-0.01']);
    await choose('#settings-language', 'pt');
    check('Portuguese currency keeps maximum safe cents exact', await evaluate(`[formatCurrencyFromCents(Number.MAX_SAFE_INTEGER), formatCurrencyFromCents(-1)].map(value => value.replace(/[^0-9.,-]/g, ''))`), ['90071992547409,91', '-0,01']);
    check('Portuguese immediate HTML lang and persisted preference', await evaluate(`document.documentElement.lang === 'pt' && document.querySelector('#settings-heading').textContent.trim() === 'Definições' && localStorage.getItem('tipSplit.language') === 'pt' && document.querySelector('.main-navigation').textContent.includes('Colaboradores')`));
    check('business names untranslated', await evaluate(`document.querySelector('#sidebar-workspace-name').textContent === 'QA Hospitality' && document.querySelector('#settings-location-list').textContent.includes('Sky QA')`));
    await click('#settings-add-location');
    check('Location dialog translates', await evaluate(`document.querySelector('#settings-location-dialog-heading').textContent`), 'Adicionar local');
    await input('#settings-location-input', 'Wine & Jazz');
    await click('#settings-location-save');
    await until(`document.querySelector('#settings-location-form-feedback').textContent.includes('Já existe') && !document.querySelector('#settings-location-save').disabled`);
    check('Duplicate Location API conflict translates in Portuguese and retains dialog', await evaluate(`document.querySelector('#settings-location-dialog').open && document.querySelector('#settings-location-form-feedback').textContent === TipSplitI18n.t('errors.LOCATION_NAME_EXISTS')`));
    await input('#settings-location-input', ' ');
    await click('#settings-location-save');
    check('dynamic validation Portuguese', await evaluate(`document.querySelector('#settings-location-form-feedback').textContent.includes('nome') && !document.querySelector('#settings-location-form-feedback').textContent.includes('Enter')`));
    await click('#settings-location-cancel');
    await navigate('employees');
    await click('#employees-rows .employee-edit-button');
    await until(`document.querySelector('#employee-dialog').open`);
    check('Employee dialog and dynamic status translate', await evaluate(`document.querySelector('#employee-dialog-title').textContent === 'Editar colaborador' && document.querySelector('#employees-rows').textContent.includes('Ativo')`));
    await evaluate(`TipSplitI18n.setLanguage('en')`);
    check('Open Edit Employee retains edit title when language changes to English', await evaluate(`document.querySelector('#employee-dialog').open && state.editingEmployeeId !== null && document.querySelector('#employee-dialog-title').textContent === TipSplitI18n.t('employees.edit')`));
    await evaluate(`TipSplitI18n.setLanguage('pt')`);
    check('Open Edit Employee retains edit title when language changes to Portuguese', await evaluate(`document.querySelector('#employee-dialog').open && state.editingEmployeeId !== null && document.querySelector('#employee-dialog-title').textContent === TipSplitI18n.t('employees.edit')`));
    await click('#cancel-employee-form');
    await navigate('distribution');
    check('dynamic distribution translates without recalculation', await evaluate(`document.querySelector('#calculate-button').textContent.includes('Confirmar distribuição') && JSON.stringify(state.preview) === ${JSON.stringify(preferencePreview)}`));
    await navigate('history');
    check('dynamic History translates preserving business references', await evaluate(`document.querySelector('#history-count').textContent.includes('distribuição confirmada') && document.querySelector('#history-rows .history-open').getAttribute('aria-label').includes('Abrir distribuição') && document.querySelector('#history-rows').textContent.includes('DIST-QA-7')`));
    await navigate('settings');
    await choose('#settings-theme', 'dark');
    check('Dark immediate and persistent', await evaluate(`document.documentElement.dataset.theme === 'dark' && localStorage.getItem('tipSplit.theme') === 'dark'`));
    for (const view of ['distribution', 'employees', 'history', 'settings']) {
        await navigate(view);
        check('Dark ' + view + ' main surface', await darkSurface('#main-content'));
        await screenshot('dark-pt-' + view + '-1440');
    }
    await click('#settings-add-location');
    check('Dark Location dialog', await darkSurface('#settings-location-dialog'));
    await screenshot('dark-pt-location-dialog');
    await click('#settings-location-cancel');
    await navigate('employees');
    await click('#employees-rows .employee-edit-button');
    await until(`document.querySelector('#employee-dialog').open`);
    check('Dark Employee dialog', await darkSurface('#employee-dialog'));
    await click('#cancel-employee-form');
    await navigate('distribution');
    await evaluate(`document.querySelector('#location-filter').focus()`);
    await click('#location-filter');
    check('Dark custom Location menu', await darkSurface('#location-menu'));
    await click('#location-filter');
    check('Dark action bar', await darkSurface('.action-bar'));
    await navigate('settings');
    check('preferences no business API mutations beyond explicit duplicate-name probe', writes(), beforePreferences + 1);
    check('preferences preserve confirmed snapshot', JSON.stringify(distribution), historySnapshot);
    await load();
    await until(`document.querySelector('#settings-workspace-name').textContent === 'QA Hospitality'`);
    await waitLocations();
    check('Language/theme survive reload', await evaluate(`[document.documentElement.lang, document.documentElement.dataset.theme, document.querySelector('#settings-language input:checked')?.value ?? document.querySelector('#settings-language').value, document.querySelector('#settings-theme input:checked')?.value ?? document.querySelector('#settings-theme').value]`), ['pt', 'dark', 'pt', 'dark']);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await choose('#settings-theme', 'system');
    await until(`document.documentElement.dataset.theme === 'light'`);
    check('System follows light OS', await evaluate(`document.documentElement.dataset.themePreference`), 'system');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await until(`document.documentElement.dataset.theme === 'dark'`);
    check('System reacts live OS dark change', await evaluate(`document.querySelector('#settings-theme input:checked')?.value ?? document.querySelector('#settings-theme').value`), 'system');
    await choose('#settings-theme', 'light');
    check('explicit Light overrides dark OS', await evaluate(`document.documentElement.dataset.theme`), 'light');
    const beforeStorageFailures = writes();
    await evaluate(`window.qaStorageSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key === 'tipSplit.language' || key === 'tipSplit.theme') throw new Error('Storage unavailable for isolated QA'); return window.qaStorageSetItem.call(this, key, value); };`);
    await choose('#settings-theme', 'dark');
    check('Theme storage failure retains effective theme and selected preference with error', await evaluate(`document.documentElement.dataset.theme === 'light' && document.querySelector('#settings-theme input:checked').value === 'light' && document.querySelector('#settings-preferences-feedback').textContent === TipSplitI18n.t('settings.preferencesFailed')`));
    await choose('#settings-language', 'en');
    check('Language storage failure still applies session language with clear warning', await evaluate(`document.documentElement.lang === 'en' && document.querySelector('#settings-language input:checked').value === 'en' && localStorage.getItem('tipSplit.language') === 'pt' && document.querySelector('#settings-preferences-feedback').textContent === TipSplitI18n.t('settings.preferencesSessionOnly')`));
    await pause(4200);
    check('Preference persistence error remains until resolved', await evaluate(`document.querySelector('#settings-preferences-feedback').textContent === TipSplitI18n.t('settings.preferencesSessionOnly')`));
    await evaluate(`Storage.prototype.setItem = window.qaStorageSetItem; delete window.qaStorageSetItem;`);
    await choose('#settings-language', 'pt');
    check('Preference storage retry recovers without API writes', writes(), beforeStorageFailures);
    await until(`!document.querySelector('#settings-preferences-feedback').textContent`);
    check('Preference success confirmation expires', await evaluate(`document.querySelector('#settings-language input:checked').value === 'pt' && document.querySelector('#settings-theme input:checked').value === 'light'`));
    for (const theme of ['light', 'dark']) {
        await choose('#settings-theme', theme);
        for (const language of ['en', 'pt']) {
            await choose('#settings-language', language);
            for (const width of [320, 768, 1024, 1280, 1366, 1440]) {
                await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width === 320 });
                await evaluate(`window.scrollTo(0, 0)`);
                const geometry = await evaluate(`(() => { const page = document.querySelector('#settings-view'); const bounds = page.getBoundingClientRect(); return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bounds: bounds.toJSON(), allNamesFit: [...page.querySelectorAll('#settings-location-list li')].every(el => { const r = el.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && el.scrollWidth <= el.clientWidth + 1; }) }; })()`);
                metrics.push({ theme, language, ...geometry });
                check(theme + '/' + language + '/' + width + 'px Settings fits and wraps', geometry.scrollWidth <= geometry.width + 1 && geometry.bounds.left >= -1 && geometry.bounds.right <= geometry.width + 1 && geometry.allNamesFit);
                check(theme + '/' + language + '/' + width + 'px navigation usable', await evaluate(`Array.from(document.querySelectorAll('.main-navigation a')).every(el => { const r = el.getBoundingClientRect(); return r.width >= 24 && r.height >= 24; })`));
                if (width === 320 || width === 1440) await screenshot('settings-' + theme + '-' + language + '-' + width);
                for (const view of ['distribution', 'employees', 'history']) {
                    await navigate(view);
                    check(theme + '/' + language + '/' + width + 'px ' + view + ' fits document', await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector('#${view}-view').getBoundingClientRect().right <= innerWidth + 1`));
                    check(theme + '/' + language + '/' + width + 'px ' + view + ' table remains accessible', await evaluate(`(() => { const page = document.querySelector('#${view}-view'); const table = [...page.querySelectorAll('table')].find(table => table.checkVisibility()); if (!table) return false; let region = table.parentElement; while (region && region !== page && !['auto', 'scroll'].includes(getComputedStyle(region).overflowX)) region = region.parentElement; if (!region || region === page) return table.getBoundingClientRect().right <= innerWidth + 1; region.focus(); region.scrollLeft = region.scrollWidth; return region.getBoundingClientRect().right <= innerWidth + 1 && (region.scrollWidth <= region.clientWidth + 1 || document.activeElement === region && region.scrollLeft > 0); })()`));
                    if (view === 'history') check(theme + '/' + language + '/' + width + 'px History headings do not overlap', await evaluate(`(() => { const table = [...document.querySelectorAll('#history-view table')].find(table => table.checkVisibility()); return [...table.querySelectorAll('thead th')].filter(cell => !cell.querySelector('.sr-only')).flatMap(cell => { const bounds = cell.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(cell); const overflow = [...range.getClientRects()].filter(rect => rect.left < bounds.left - 1 || rect.right > bounds.right + 1); return overflow.length ? [{ heading: cell.textContent.trim(), width: bounds.width, overflow: overflow.map(rect => ({ left: rect.left - bounds.left, right: rect.right - bounds.right })) }] : []; }); })()`), []);
                    if (width === 1440 || width === 1024 || width === 320) {
                        await evaluate(`document.querySelectorAll('#${view}-view *').forEach(node => { if (node.scrollLeft) node.scrollLeft = 0; }); document.activeElement.blur(); window.scrollTo(0, 0);`);
                        await screenshot(view + '-' + theme + '-' + language + '-' + width);
                    }
                }
                await navigate('settings');
            }
        }
    }
    await evaluate(`localStorage.setItem('tipSplit.language', 'invalid'); localStorage.setItem('tipSplit.theme', 'invalid');`);
    await load();
    await until(`document.querySelector('#settings-workspace-name').textContent === 'QA Hospitality'`);
    check('invalid preferences fall back English and System', await evaluate(`[document.documentElement.lang, document.querySelector('#settings-language input:checked')?.value ?? document.querySelector('#settings-language').value, document.querySelector('#settings-theme input:checked')?.value ?? document.querySelector('#settings-theme').value, document.documentElement.dataset.theme]`), ['en', 'en', 'system', 'dark']);
    locationMode = 'empty';
    await load();
    await until(`document.querySelector('#settings-locations-content').getAttribute('aria-busy') === 'false'`);
    check('empty Locations zero explicit no retry', await evaluate(`parseInt(document.querySelector('#settings-location-count').textContent, 10) === 0 && document.querySelectorAll('#settings-location-list li').length === 0 && /no .*locations|no locations/i.test(document.querySelector('#settings-locations-feedback').textContent) && document.querySelector('#settings-locations-retry').hidden`));
    locationMode = 'error';
    workspaceMode = 'error';
    await load();
    await until(`!document.querySelector('#settings-locations-retry').hidden && !document.querySelector('#settings-workspace-retry').hidden`);
    check('Workspace/Locations errors accessible retries', await evaluate(`document.querySelector('#settings-workspace-edit').disabled && document.querySelector('#settings-locations-content').getAttribute('aria-busy') === 'false' && document.querySelector('#settings-location-count').hidden`));
    await choose('#settings-language', 'pt');
    check('API error and retry translate live', await evaluate(`document.querySelector('#settings-locations-retry').textContent.trim() === 'Tentar novamente' && !document.querySelector('#settings-locations-feedback').textContent.includes('temporarily unavailable') && !document.querySelector('#settings-workspace-feedback').textContent.includes('temporarily unavailable')`));
    locationMode = 'hold';
    const beforeRetry = requests.filter(request => request.path === '/api/locations').length;
    await click('#settings-locations-retry');
    await waitForRequests(beforeRetry + 1);
    check('retry translated accessible loading', await evaluate(`document.querySelector('#settings-locations-content').getAttribute('aria-busy') === 'true' && document.querySelector('#settings-locations-feedback').textContent.includes('A carregar')`));
    locationMode = 'success';
    while (heldLocations.length) await respond(heldLocations.shift(), { locations });
    await waitLocations();
    workspaceMode = 'success';
    await click('#settings-workspace-retry');
    await until(`document.querySelector('#settings-workspace-name').textContent === 'QA Hospitality'`);
    check('retry recovers without reload', await evaluate(`document.querySelector('#settings-locations-retry').hidden && document.querySelector('#settings-workspace-retry').hidden && !document.querySelector('#settings-workspace-edit').disabled`));
    locationMode = 'invalid';
    await load();
    await until(`!document.querySelector('#settings-locations-retry').hidden`);
    check('malformed API translated recoverable error', await evaluate(`document.querySelectorAll('#settings-location-list li').length === 0 && !!document.querySelector('#settings-locations-feedback').textContent && !document.querySelector('#settings-locations-feedback').textContent.includes('invalid location data')`));
    locationMode = 'display';
    await load();
    await until(`document.querySelectorAll('#settings-location-list li').length === ${displayLocations.length}`);
    for (const theme of ['light', 'dark']) {
        await choose('#settings-theme', theme);
        for (const language of ['en', 'pt']) {
            await choose('#settings-language', language);
            for (const width of [320, 1440]) {
                await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width === 320 });
                await evaluate(`window.scrollTo(0, 0)`);
                await screenshot('settings-display-' + theme + '-' + language + '-' + width);
            }
        }
    }
    displayLocations.push({ id: 99, name: 'Garden Terrace', active: false });
    await load();
    await until(`document.querySelectorAll('#settings-location-list li').length === 10`);
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    for (const theme of ['light', 'dark']) {
        await choose('#settings-theme', theme);
        for (const language of ['en', 'pt']) {
            await choose('#settings-language', language);
            const prefix = `settings-states-${theme}-${language}-1440-`;
            await evaluate(`window.scrollTo(0, 0)`);
            await screenshot(prefix + 'main');
            await click('#settings-workspace-edit');
            await screenshot(prefix + 'workspace-edit');
            await click('#settings-workspace-cancel');
            await setChecked('#settings-locations-enabled', false);
            await until(`document.documentElement.dataset.locationsEnabled === 'false' && !document.querySelector('#settings-locations-enabled').disabled`);
            await screenshot(prefix + 'locations-disabled');
            await setChecked('#settings-locations-enabled', true);
            await until(`document.documentElement.dataset.locationsEnabled === 'true' && !document.querySelector('#settings-locations-enabled').disabled`);
            await setChecked('#settings-show-inactive', true);
            await screenshot(prefix + 'show-inactive');
            await click('#settings-add-location');
            check(theme + '/' + language + ' Add dialog has concise creation copy', await evaluate(`document.querySelector('#settings-location-dialog-context').textContent === TipSplitI18n.t('settings.addLocationContext') && !document.querySelector('#settings-location-active-field').checkVisibility()`));
            await screenshot(prefix + 'add-location');
            await key('Escape', 'Escape', 27);
            await until(`!document.querySelector('#settings-location-dialog').open`);
            await until(`document.activeElement.id === 'settings-add-location'`);
            check(theme + '/' + language + ' Add dialog Escape restores focus', await evaluate(`document.activeElement.id`), 'settings-add-location');
            await editLocation(1);
            check(theme + '/' + language + ' Edit active dialog has edit copy and real active control', await evaluate(`document.querySelector('#settings-location-dialog-context').textContent === TipSplitI18n.t('settings.editLocationContext') && document.querySelector('#settings-location-active').checked && document.querySelector('#settings-location-active-field').checkVisibility()`));
            await screenshot(prefix + 'edit-active');
            await click('#settings-location-cancel');
            await editLocation(99);
            check(theme + '/' + language + ' Edit inactive dialog retains real inactive state', await evaluate(`!document.querySelector('#settings-location-active').checked && document.querySelector('#settings-location-input').value === 'Garden Terrace'`));
            await screenshot(prefix + 'edit-inactive');
            await click('#settings-location-cancel');
            await setChecked('#settings-show-inactive', false);
            await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1000, deviceScaleFactor: 1, mobile: false });
            await evaluate(`window.scrollTo(0, 0)`);
            await screenshot(`settings-states-${theme}-${language}-1024-main`);
            await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
        }
    }
    await setChecked('#settings-locations-enabled', false);
    await until(`document.documentElement.dataset.locationsEnabled === 'false' && !document.querySelector('#settings-locations-enabled').disabled`);
    await load();
    await until(`document.querySelector('#settings-workspace-name').textContent === 'QA Hospitality' && document.querySelectorAll('#settings-location-list li').length === 10`);
    check('Locations disabled setting survives reload without deleting records', !workspace.locationsEnabled && displayLocations.length === 11 && await evaluate(`!document.querySelector('#settings-locations-enabled').checked && document.querySelector('#settings-locations-disabled-note').checkVisibility() && document.querySelector('#settings-location-list').checkVisibility()`));
    await setChecked('#settings-locations-enabled', true);
    await until(`document.documentElement.dataset.locationsEnabled === 'true' && !document.querySelector('#settings-locations-enabled').disabled`);
    await load();
    await until(`document.querySelector('#settings-workspace-name').textContent === 'QA Hospitality' && document.querySelectorAll('#settings-location-list li').length === 10`);
    check('Locations re-enabled setting survives reload and hides disabled explanation', workspace.locationsEnabled && await evaluate(`document.querySelector('#settings-locations-enabled').checked && !document.querySelector('#settings-locations-disabled-note').checkVisibility()`));
    locationMode = 'success';
    await load('employees');
    await until(`state.employeesLoaded && !state.employeesLoading && document.querySelectorAll('#employees-rows .employee-edit-button').length === 2`);
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await evaluate(`document.querySelector('#add-employee').focus()`);
    await click('#add-employee');
    await until(`document.querySelector('#employee-dialog').open`);
    check('Add Employee starts with labeled fields, no assignments and initial focus', await evaluate(`document.activeElement.id === 'employee-form-code' && document.querySelectorAll('#employee-form input:not([type="checkbox"]):not([type="hidden"])').length === 4 && [...document.querySelectorAll('#employee-form input:not([type="hidden"])')].every(input => input.labels.length > 0) && !document.querySelector('#employee-form-locations input:checked')`));
    await evaluate(`document.querySelector('#save-employee').focus()`);
    await key('Tab', 'Tab', 9);
    check('Employee modal keyboard navigation never enters background controls', await evaluate(`document.activeElement === document.body || document.querySelector('#employee-dialog').contains(document.activeElement)`));
    if (await evaluate(`document.activeElement === document.body`)) await key('Tab', 'Tab', 9);
    check('Native Employee modal traps forward keyboard focus', await evaluate(`document.activeElement.id`), 'close-employee-dialog');
    await key('Tab', 'Tab', 9, 8);
    check('Employee modal reverse keyboard navigation never enters background controls', await evaluate(`document.activeElement === document.body || document.querySelector('#employee-dialog').contains(document.activeElement)`));
    if (await evaluate(`document.activeElement === document.body`)) await key('Tab', 'Tab', 9, 8);
    check('Native Employee modal traps reverse keyboard focus', await evaluate(`document.activeElement.id`), 'save-employee');
    const employeeWritesBeforeValidation = writes();
    await click('#save-employee');
    check('Employee required-field validation blocks API and focuses missing code', writes() === employeeWritesBeforeValidation && await evaluate(`document.activeElement.id === 'employee-form-code' && !!document.querySelector('#employee-form-error').textContent.trim()`));
    await input('#employee-form-code', 'QA003');
    await input('#employee-form-name', 'Celia QA');
    await input('#employee-form-role', 'Host');
    await input('#employee-form-email', 'invalid-email');
    await click('#save-employee');
    check('Employee email validation blocks API and focuses email', writes() === employeeWritesBeforeValidation && await evaluate(`document.activeElement.id === 'employee-form-email'`));
    await input('#employee-form-email', 'celia@example.test');
    employeeMode = 'error';
    await click('#save-employee');
    await until(`!state.savingEmployee && !!document.querySelector('#employee-form-error').textContent.trim()`);
    check('Employee create API error preserves entered values and allows retry', await evaluate(`document.querySelector('#employee-dialog').open && document.querySelector('#employee-form-name').value === 'Celia QA' && !document.querySelector('#save-employee').disabled && !state.employeeDirectory.some(employee => employee.employeeCode === 'QA003')`));
    employeeMode = 'hold';
    await click('#save-employee');
    await until(`state.savingEmployee`);
    for (let attempt = 0; attempt < 100 && !heldEmployeeWrites.length; attempt++) await pause(20);
    const beforeDuplicateEmployee = writes();
    await click('#save-employee');
    await click('#cancel-employee-form');
    await click('#close-employee-dialog');
    await key('Escape', 'Escape', 27);
    check('Pending Employee save prevents duplicates, close buttons and Escape', writes() === beforeDuplicateEmployee && await evaluate(`state.savingEmployee && document.querySelector('#employee-dialog').open && document.querySelector('#save-employee').disabled && document.querySelector('#employee-form').getAttribute('aria-busy') === 'true'`));
    employeeMode = 'success';
    const heldEmployee = heldEmployeeWrites.shift();
    const addedEmployee = { id: 3, ...heldEmployee.body, locations: [] };
    delete addedEmployee.locationIds;
    employees.push(addedEmployee);
    await respond(heldEmployee.requestId, { employee: addedEmployee }, 201);
    await until(`!state.savingEmployee && !document.querySelector('#employee-dialog').open`);
    check('Add Employee persists zero Location assignments and updates directory once', employees.filter(employee => employee.employeeCode === 'QA003').length === 1 && addedEmployee.locations.length === 0 && await evaluate(`state.employeeDirectory.length === 3 && document.querySelector('#employees-rows').textContent.includes('Celia QA')`));
    await until(`document.activeElement.id === 'add-employee'`);
    check('Employee save returns focus to Add Employee', await evaluate(`document.activeElement.id`), 'add-employee');
    await evaluate(`document.querySelector('#employees-rows [data-employee-id="3"]').focus()`);
    await click('#employees-rows [data-employee-id="3"]');
    await until(`document.querySelector('#employee-dialog').open`);
    await setChecked('#employee-form-locations input[value="11"]', true);
    await setChecked('#employee-form-locations input[value="12"]', true);
    await setChecked('#employee-form-active', false);
    await click('#save-employee');
    await until(`!document.querySelector('#employee-dialog').open && !state.savingEmployee`);
    check('Employee edit persists multiple Locations and inactive state', addedEmployee.locations.map(location => location.id).sort(), [11, 12]);
    check('Inactive Employee remains in directory', !addedEmployee.active && await evaluate(`state.employeeDirectory.find(employee => employee.id === 3).active === false`));
    await evaluate(`document.querySelector('#employees-status-filter').focus()`);
    await key('ArrowDown', 'ArrowDown', 40);
    await key('End', 'End', 35);
    check('Employee custom status select exposes keyboard active descendant', await evaluate(`document.querySelector('#employees-status-filter').getAttribute('aria-expanded') === 'true' && document.getElementById(document.querySelector('#employees-status-filter').getAttribute('aria-activedescendant')).dataset.value === 'inactive'`));
    await key('Enter', 'Enter', 13);
    check('Employee custom status select commits and retains visible keyboard focus', await evaluate(`document.querySelector('#employees-status-menu').hidden && document.activeElement.id === 'employees-status-filter' && document.activeElement.matches(':focus-visible') && getComputedStyle(document.activeElement).outlineStyle !== 'none'`));
    check('Employee inactive filter isolates saved inactive employee', await evaluate(`document.querySelectorAll('#employees-rows .employee-edit-button').length === 1 && document.querySelector('#employees-rows').textContent.includes('Celia QA')`));
    await key('ArrowDown', 'ArrowDown', 40);
    await key('Home', 'Home', 36);
    await key('Escape', 'Escape', 27);
    check('Employee custom status select Escape keeps committed filter', await evaluate(`document.querySelector('#employees-status-menu').hidden && document.querySelectorAll('#employees-rows .employee-edit-button').length === 1`));
    await input('#employees-search', 'QA003');
    check('Employee search matches persisted code within active filters', await evaluate(`document.querySelectorAll('#employees-rows .employee-edit-button').length === 1`));
    await input('#employees-search', 'missing employee');
    check('Employee unmatched search has explicit empty state', await evaluate(`!document.querySelector('#employees-rows .employee-edit-button') && !!document.querySelector('#employees-rows').textContent.trim()`));
    await input('#employees-search', '');
    await click('#employees-status-filter'); await click('#employees-status-menu [data-value="all"]');
    await click('#employees-location-filter'); await click('#employees-location-menu [data-value="11"]');
    check('Employee Location filter includes multi-assigned employees', await evaluate(`document.querySelectorAll('#employees-rows .employee-edit-button').length === 2 && document.querySelector('#employees-rows').textContent.includes('Celia QA')`));
    await click('#employees-location-filter'); await click('#employees-location-menu [data-value="all"]');
    await evaluate(`document.querySelector('#employees-rows [data-employee-id="3"]').focus()`);
    await click('#employees-rows [data-employee-id="3"]');
    await until(`document.querySelector('#employee-dialog').open`);
    await setChecked('#employee-form-locations input[value="11"]', false);
    await setChecked('#employee-form-locations input[value="12"]', false);
    await setChecked('#employee-form-active', true);
    await click('#save-employee');
    await until(`!document.querySelector('#employee-dialog').open && !state.savingEmployee`);
    check('Employee reactivation and explicit empty Locations save both persist', addedEmployee.active && addedEmployee.locations.length === 0);
    await evaluate(`document.querySelector('#employees-rows [data-employee-id="3"]').focus()`);
    await click('#employees-rows [data-employee-id="3"]');
    await until(`document.querySelector('#employee-dialog').open`);
    await input('#employee-form-name', 'Unsaved name');
    await key('Escape', 'Escape', 27);
    await until(`!document.querySelector('#employee-dialog').open`);
    await until(`document.activeElement.matches('#employees-rows [data-employee-id="3"]')`);
    check('Employee Escape discards unsaved edits and restores Edit focus', addedEmployee.name === 'Celia QA' && await evaluate(`state.editingEmployeeId === null`));
    await load('employees');
    await until(`state.employeesLoaded && state.employeeDirectory.length === 3`);
    check('Employee mutations survive API reload without browser financial storage', await evaluate(`state.employeeDirectory.find(employee => employee.id === 3).name === 'Celia QA' && state.employeeDirectory.find(employee => employee.id === 3).active && state.employeeDirectory.find(employee => employee.id === 3).locations.length === 0 && !localStorage.getItem('tipSplitterCatalog') && !localStorage.getItem('tipSplitterHistory')`));
    check('no unexpected JavaScript exceptions', errors, []);
    check('no DELETE or financial mutations', requests.every(request => request.method !== 'DELETE' && (request.method === 'GET' || request.method === 'POST' && request.path === '/api/distributions/preview' || /^\/api\/(workspace|locations(?:\/\d+)?|employees(?:\/\d+)?)$/.test(request.path))));
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ checks, metrics, requests, errors, visualLimitations: 'External Google Fonts and Lucide CSS fulfilled empty; fallback fonts, external icons omitted. Mutable isolated API fixtures; no real business data written.' }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, out }, null, 2));
    await send('Browser.close');
    socket.close();
    server.close();
})().catch(error => {
    console.error(error);
    fs.writeFileSync(path.join(out, 'failure.txt'), error.stack || String(error));
    socket?.close();
    child?.kill();
    server?.close();
    process.exitCode = 1;
});
