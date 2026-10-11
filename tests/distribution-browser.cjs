const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'tip-workspace-audit-'));
const baseline = process.argv.includes('--baseline');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let child, socket, server;
let deferInitialAttendance = false;

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
        let contents = fs.readFileSync(file);
        if (deferInitialAttendance && file === path.join(root, 'src', 'script.js')) {
            contents = contents.toString('utf8').replace(/initialize\(\);\s*$/, `
                const initialRepositoryFactory = createDistributionRepository;
                createDistributionRepository = (...args) => {
                    const adapter = initialRepositoryFactory(...args);
                    const load = adapter.loadAttendance;
                    window.initialAttendanceLoads = [];
                    adapter.loadAttendance = period => new Promise(resolve => {
                        initialAttendanceLoads.push({ period, resolve: () => resolve(load(period)) });
                    });
                    return adapter;
                };
                initialize();
            `);
        }
        response.end(contents);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const profile = path.join(out, 'chrome-profile');
    child = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
        '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
        '--no-first-run', '--no-default-browser-check', 'about:blank'
    ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', data => { stderr += data; });
    let port;
    for (let attempt = 0; attempt < 100; attempt++) {
        try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; }
        catch { await pause(100); }
    }
    if (!port) throw new Error('Chrome failed: ' + stderr.slice(-1500));
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    const pending = new Map();
    const errors = [];
    const networkErrors = [];
    let messageId = 0;
    socket.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.id) {
            const item = pending.get(message.id);
            pending.delete(message.id);
            message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result);
        } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
        else if (message.method === 'Network.loadingFailed') networkErrors.push(message.params.errorText);
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++messageId;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
    });
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
        throw new Error('Timeout: ' + expression);
    };
    const checks = [];
    const check = (name, actual, expected = true) => {
        assert.deepEqual(actual, expected, name);
        checks.push(name);
        console.log('PASS', name);
    };
    const click = selector => evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()');
    const input = (selector, value, event = 'input') => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true })); })()`);
    const key = async (keyName, code, modifiers = 0) => {
        const windowsVirtualKeyCode = { Enter: 13, Tab: 9, Escape: 27, ' ': 32, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35 }[keyName];
        const text = keyName === 'Enter' ? '\r' : keyName === ' ' ? ' ' : undefined;
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, modifiers, windowsVirtualKeyCode, text });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, modifiers, windowsVirtualKeyCode });
    };
    const mouse = async selector => {
        const point = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    };
    const filter = async (selector, value) => {
        const values = await evaluate(`(() => { const trigger = document.querySelector(${JSON.stringify(selector)}); trigger.focus(); return [...document.getElementById(trigger.getAttribute('aria-controls')).querySelectorAll('[role="option"]')].map(option => option.dataset.value); })()`);
        const index = values.indexOf(value);
        assert.ok(index >= 0, selector + ' contains ' + value);
        await key('ArrowDown', 'ArrowDown');
        await key('Home', 'Home');
        for (let step = 0; step < index; step++) await key('ArrowDown', 'ArrowDown');
        await key('Enter', 'Enter');
    };
    const screenshot = async name => {
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(shot.data, 'base64'));
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port });
    await until('typeof state !== "undefined" && state.employees.length > 0');
    if (baseline) {
        await click('#calculate-button');
        const finitePayouts = await evaluate('[...document.querySelectorAll(".payout-cell")].filter(cell => cell.textContent !== "—").every(cell => !cell.textContent.includes("NaN")) && !elements.footerPayout.textContent.includes("NaN")');
        await click('#calculate-button');
        const centered = await evaluate('(() => { const r = document.querySelector("#confirm-dialog").getBoundingClientRect(); return Math.abs(r.x + r.width / 2 - innerWidth / 2) < 2 && Math.abs(r.y + r.height / 2 - innerHeight / 2) < 2; })()');
        await screenshot('baseline-confirm');
        console.log(JSON.stringify({ finitePayouts, centered, errors }, null, 2));
        assert.ok(finitePayouts && centered, 'baseline reproduces invalid payouts and uncentered confirmation');
    } else {
        await until('document.fonts.status === "loaded"');
        check('initial employees and attention exclusions', await evaluate('[state.employees.length, getIncludedEmployees().length, getAttentionEmployees().length]'), [63, 61, 2]);
        check('initial totals agree across table note and action bar', await evaluate('elements.tableNoteEmployees.textContent.includes("61") && elements.actionEmployees.textContent.includes("61") && elements.tableNoteDays.textContent.includes(elements.actionDays.textContent)'));
        check('synthetic attendance provenance is explicit', await evaluate('elements.attendanceSource.textContent.includes("Generated locally")'));
        await screenshot('desktop-prepare');

        await evaluate('elements.employeeRows.children[elements.employeeRows.children.length - 2].querySelector(".employee-details-button").focus()');
        await key('Tab', 'Tab');
        check('final employee checkbox keyboard focus is above fixed action bar', await evaluate('(() => { const r = document.activeElement.getBoundingClientRect(); return document.activeElement.dataset.employeeId === "63" && r.bottom <= document.querySelector(".action-bar").getBoundingClientRect().top; })()'));
        await key('Tab', 'Tab');
        check('final employee details keyboard focus is above fixed action bar', await evaluate('document.activeElement.classList.contains("employee-details-button") && document.activeElement.getBoundingClientRect().bottom <= document.querySelector(".action-bar").getBoundingClientRect().top'));
        await evaluate('window.scrollTo(0,0); document.querySelector(".table-container").scrollTop = 0');

        for (const [id, menu] of [['outlet-filter', 'outlet-menu'], ['status-filter', 'status-menu']]) {
            check(id + ' is an accessible custom combobox with labeled listbox', await evaluate(`(() => { const t = document.getElementById('${id}'); const m = document.getElementById('${menu}'); return t.tagName === 'BUTTON' && t.getAttribute('role') === 'combobox' && t.getAttribute('aria-expanded') === 'false' && t.getAttribute('aria-controls') === '${menu}' && t.getAttribute('aria-haspopup') === 'listbox' && Boolean(t.getAttribute('aria-labelledby') || t.getAttribute('aria-label')) && m.getAttribute('role') === 'listbox' && m.hidden; })()`));
            await mouse('#' + id);
            check(id + ' mouse opens custom menu', await evaluate(`document.getElementById('${id}').getAttribute('aria-expanded') === 'true' && !document.getElementById('${menu}').hidden`));
            check(id + ' selected option and active descendant agree', await evaluate(`(() => { const t = document.getElementById('${id}'); const active = document.getElementById(t.getAttribute('aria-activedescendant')); return document.activeElement === t && active?.getAttribute('aria-selected') === 'true' && active.dataset.value === 'all'; })()`));
            await screenshot(id + '-open');
            await key('End', 'End');
            check(id + ' End reaches final option without committing', await evaluate(`(() => { const t = document.getElementById('${id}'); const options = document.getElementById('${menu}').querySelectorAll('[role="option"]'); return t.getAttribute('aria-activedescendant') === options[options.length - 1].id && state.${id === 'outlet-filter' ? 'outlet' : 'status'} === 'all'; })()`));
            await key('Home', 'Home');
            await key('ArrowDown', 'ArrowDown');
            await key('ArrowUp', 'ArrowUp');
            check(id + ' Home and arrows move active option', await evaluate(`document.getElementById(document.getElementById('${id}').getAttribute('aria-activedescendant')).dataset.value`), 'all');
            await key('Escape', 'Escape');
            check(id + ' Escape cancels and retains trigger focus', await evaluate(`document.getElementById('${menu}').hidden && document.activeElement.id === '${id}' && state.${id === 'outlet-filter' ? 'outlet' : 'status'} === 'all'`));
            await key(' ', 'Space');
            check(id + ' Space opens menu', await evaluate(`!document.getElementById('${menu}').hidden`));
            await key('Tab', 'Tab');
            check(id + ' Tab closes and advances naturally', await evaluate(`document.getElementById('${menu}').hidden && document.activeElement.id !== '${id}'`));
        }
        check('status labels and counts are separate and state derived', await evaluate('[...document.querySelectorAll("#status-menu [role=option]")].map(option => [option.dataset.value,option.querySelector(".option-count")?.textContent])'), [['all','63'], ['included','61'], ['excluded','2'], ['attention','2']]);
        check('closed status shows label without parenthesized count', await evaluate('document.getElementById("status-trigger-label").textContent'), 'All employees');
        await mouse('#outlet-filter');
        await mouse('#status-filter');
        check('only one custom menu opens at a time', await evaluate('document.getElementById("outlet-menu").hidden && !document.getElementById("status-menu").hidden'));
        await mouse('#employee-search');
        check('outside pointer closes filter without stealing target focus', await evaluate('document.getElementById("status-menu").hidden && document.activeElement.id === "employee-search"'));
        await evaluate('elements.statusFilter.focus()');
        await key('ArrowDown', 'ArrowDown');
        await key('Home', 'Home');
        await key('ArrowDown', 'ArrowDown');
        await key('Tab', 'Tab');
        check('Tab commits active status and advances without trapping focus', await evaluate('state.status === "included" && document.getElementById("status-menu").hidden && document.activeElement.id !== "status-filter"'));
        await filter('#status-filter', 'all');
        await mouse('#outlet-filter');
        await mouse('#outlet-menu [data-value="Sky Bar"]');
        check('mouse outlet selection filters and restores focus', await evaluate('state.outlet === "Sky Bar" && getVisibleEmployees().length === 7 && document.activeElement.id === "outlet-filter" && document.getElementById("outlet-menu").hidden'));
        await filter('#outlet-filter', 'all');

        deferInitialAttendance = true;
        await send('Page.reload');
        await until('typeof initialAttendanceLoads !== "undefined" && initialAttendanceLoads.length === 1');
        await evaluate('selectPeriod(2026,9); void 0');
        await evaluate('initialAttendanceLoads.forEach(load => load.resolve())');
        await until('!state.loadingAttendance');
        check('selecting current period during async initialization still loads employees', await evaluate('[elements.period.value,state.employees.length,getIncludedEmployees().length]'), ['2026-09',63,61]);
        deferInitialAttendance = false;
        await send('Page.reload');
        await until('typeof state !== "undefined" && state.employees.length === 63 && !state.loadingAttendance');

        await click('#period-trigger');
        check('month selector opens with real focused month', await evaluate('!elements.periodMenu.hidden && document.activeElement.classList.contains("month-option")'));
        await key('ArrowRight', 'ArrowRight');
        check('month arrow moves actual focus', await evaluate('document.activeElement.dataset.month'), '10');
        await key('Enter', 'Enter');
        await until('elements.period.value === "2026-10"');
        check('keyboard changes period', await evaluate('elements.period.value'), '2026-10');
        check('month choice restores focus', await evaluate('document.activeElement.id'), 'period-trigger');
        await click('#period-trigger');
        await key('Escape', 'Escape');
        check('Escape closes month selector', await evaluate('elements.periodMenu.hidden && document.activeElement.id === "period-trigger"'));
        await click('#period-trigger');
        await evaluate('elements.tips.focus()');
        check('leaving month selector closes it', await evaluate('elements.periodMenu.hidden'));
        await click('#period-trigger');
        await click('#next-year');
        await click('.month-option[data-month="2"]');
        await until('elements.period.value === "2027-02"');
        check('year navigation changes period and attendance', await evaluate('[elements.period.value,state.employees[0].attendance.length]'), ['2027-02', 28]);
        await evaluate('selectPeriod(2026, 9)');

        await evaluate('window.originalAttendanceLoad = repository.loadAttendance; window.pendingAttendance = {}; repository.loadAttendance = period => new Promise((resolve,reject) => { pendingAttendance[period] = { resolve,reject }; }); selectPeriod(2026,10); selectPeriod(2026,11); void 0;');
        check('pending attendance blocks calculation and financial edits', await evaluate('elements.calculateButton.disabled && elements.tips.readOnly && [...elements.employeeRows.querySelectorAll("input")].every(input => input.disabled)'));
        await evaluate('pendingAttendance["2026-11"].resolve(originalAttendanceLoad("2026-11"))');
        await until('elements.period.value === "2026-11"');
        await evaluate('pendingAttendance["2026-10"].resolve(originalAttendanceLoad("2026-10"))');
        check('late older attendance result cannot overwrite latest period', await evaluate('[elements.period.value,state.employees[0].attendance.length]'), ['2026-11',30]);
        await evaluate('repository.loadAttendance = originalAttendanceLoad; selectPeriod(2026,9)');
        await until('elements.period.value === "2026-09" && !elements.calculateButton.disabled');
        await click('#calculate-button');
        await evaluate('window.preservedPreview = state.preview; window.preservedEmployees = state.employees; repository.loadAttendance = () => Promise.reject(new Error("Attendance unavailable. Try again.")); selectPeriod(2026,12);');
        await until('elements.workflowError.textContent.includes("Attendance unavailable")');
        check('rejected attendance load preserves period population and ready preview', await evaluate('elements.period.value === "2026-09" && state.employees === preservedEmployees && state.preview === preservedPreview && !state.previewStale && !elements.calculateButton.disabled && !elements.tips.readOnly'));
        await evaluate('repository.loadAttendance = originalAttendanceLoad; selectPeriod(2026,10)');
        await until('elements.period.value === "2026-10"');
        check('successful period change removes previous payouts', await evaluate('state.preview === null && state.confirmed === null && elements.footerPayout.textContent === "—" && [...elements.employeeRows.querySelectorAll(".payout-cell")].every(cell => cell.textContent === "—")'));
        await evaluate('selectPeriod(2026,9)');
        await until('elements.period.value === "2026-09"');

        await input('#employee-search', 'Jose Ferro');
        check('accent-insensitive search', await evaluate('[...elements.employeeRows.querySelectorAll("tr")].length'), 1);
        for (const [search, expected] of [['EMP-002', 1], ['Chefe de bar', 2], ['Sky Bar', 7]]) {
            await input('#employee-search', search);
            check('search matches ' + search, await evaluate('getVisibleEmployees().length'), expected);
        }
        await input('#employee-search', 'no-such-employee');
        check('empty state has recovery and disabled bulk action', await evaluate('Boolean(document.querySelector("#clear-filters")) && elements.includeVisibleButton.disabled'));
        await click('#clear-filters');
        await filter('#outlet-filter', 'Sky Bar');
        check('outlet changes visible scope only', await evaluate('[getVisibleEmployees().length,getIncludedEmployees().length]'), [7, 61]);
        await filter('#status-filter', 'excluded');
        check('combined filters can have no matches', await evaluate('getVisibleEmployees().length'), 0);
        await click('#clear-filters');
        await click('#attendance-details-button');
        check('View details reveals attention records', await evaluate('[state.status,getVisibleEmployees().length]'), ['attention', 2]);
        check('unreviewed records cannot be bulk included', await evaluate('elements.includeVisibleButton.disabled'));
        await click('.employee-details-button');
        check('attendance dialog labeled and focused', await evaluate('elements.attendanceDialog.open && document.activeElement.id === "close-attendance-dialog" && elements.attendanceDialog.hasAttribute("aria-labelledby")'));
        check('attendance dialog starts at first record', await evaluate('elements.attendanceTableWrapper.scrollTop'), 0);
        check('overnight shifts include next-day explanation', await evaluate('elements.attendanceRecords.textContent.includes("+1 day")'));
        await screenshot('desktop-attendance');
        await click('#review-attendance');
        check('review acknowledgment enables inclusion without silently selecting employee', await evaluate('[getAttentionEmployees().length,getIncludedEmployees().length]'), [1, 61]);
        await click('#attendance-dialog-done');
        await until('document.activeElement.id === "status-filter"');
        check('closing returns focus to status filter when the reviewed row is no longer visible', await evaluate('document.activeElement.id'), 'status-filter');
        await filter('#status-filter', 'all');
        await click('#include-visible-button');
        check('bulk includes reviewed records but excludes unresolved flags', await evaluate('getIncludedEmployees().length'), 62);
        check('status counts update after attendance review and bulk inclusion', await evaluate('[...document.querySelectorAll("#status-menu .option-count")].map(count => count.textContent)'), ['63','62','1','1']);

        await input('#tips', 'invalid');
        await click('#calculate-button');
        check('invalid money focuses input and announces error', await evaluate('document.activeElement.id === "tips" && elements.tips.getAttribute("aria-invalid") === "true" && elements.summaryTips.textContent === "—"'));
        await input('#tips', '8420.50');
        await click('#calculate-button');
        check('calculation is exact and preview-only', await evaluate('[state.preview.totalDistributedCents,state.preview.payments.reduce((sum,p)=>sum+p.amountCents,0), repository.loadHistory().length]'), [842050, 842050, 0]);
        check('displayed payouts and footer are finite', await evaluate('[...document.querySelectorAll(".payout-cell")].every(cell => !cell.textContent.includes("NaN")) && elements.footerPayout.textContent === elements.summaryAllocated.textContent'));
        await filter('#outlet-filter', 'Sky Bar');
        check('filtering preserves ready preview and global reconciliation', await evaluate('state.preview !== null && !state.previewStale && elements.summaryDifference.textContent === "€0.00" && getVisibleEmployees().length === 7'));
        await evaluate('document.querySelector(".employee-details-button").focus()');
        await key('Enter', 'Enter');
        for (let index = 0; index < 5; index++) {
            await key('Tab', 'Tab');
            check('native modal contains keyboard focus ' + index, await evaluate('elements.attendanceDialog.contains(document.activeElement)'));
        }
        await key('Escape', 'Escape');
        await until('!elements.attendanceDialog.open && state.attendanceEmployeeId === null && document.activeElement.classList.contains("employee-details-button")');
        check('attendance Escape restores employee focus', await evaluate('!elements.attendanceDialog.open && document.activeElement.classList.contains("employee-details-button")'));
        await filter('#outlet-filter', 'all');
        await evaluate('document.querySelector("input[data-employee-id]").focus()');
        await key(' ', 'Space');
        check('keyboard exclusion retains focus and invalidates preview', await evaluate('state.previewStale && document.activeElement.dataset.employeeId === "1" && !document.activeElement.checked'));
        check('stale payout and reconciliation are hidden', await evaluate('elements.allocatedSummary.hidden && elements.differenceSummary.hidden && elements.footerPayout.textContent === "—"'));
        await click('#calculate-button');
        await input('#tips', '9000');
        check('tip change invalidates preview', await evaluate('state.previewStale'));
        check('tip change returns record status to Draft', await evaluate('elements.recordStatus.textContent'), 'Draft');
        await click('#calculate-button');
        await click('#calculate-button');
        check('confirmation derives counts and days from preview', await evaluate('Number(elements.confirmEmployees.textContent.replaceAll(",","")) === state.preview.employeeCount && Number(elements.confirmDays.textContent.replaceAll(",","")) === state.preview.totalWorkedDays'));
        check('confirmation starts on safe return action', await evaluate('document.activeElement.id'), 'cancel-confirmation');
        check('confirmation is centered', await evaluate('(() => { const r = elements.confirmDialog.getBoundingClientRect(); return Math.abs(r.x + r.width / 2 - innerWidth / 2) < 2 && Math.abs(r.y + r.height / 2 - innerHeight / 2) < 2; })()'));
        await screenshot('desktop-confirm');
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 470, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 470, button: 'left', clickCount: 1 });
        check('clicking dialog content does not dismiss it', await evaluate('elements.confirmDialog.open'));
        await click('#cancel-confirmation');
        await until('document.activeElement.id === "calculate-button"');
        check('Return to review keeps preview and restores action focus', await evaluate('!elements.confirmDialog.open && !state.previewStale && document.activeElement.id === "calculate-button"'));
        await click('#calculate-button');
        await key('Escape', 'Escape');
        check('confirmation Escape closes without saving', await evaluate('!elements.confirmDialog.open && repository.loadHistory().length === 0'));

        const metrics = [];
        for (const width of [320, 375, 768, 1024, 1440]) {
            await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
            await pause(100);
            check('page does not overflow at ' + width, await evaluate('document.documentElement.scrollWidth <= innerWidth'));
            check('reconciliation remains visible at ' + width, await evaluate('elements.summaryAllocated.getBoundingClientRect().width > 0 && elements.summaryDifference.getBoundingClientRect().width > 0'));
            await click('#calculate-button');
            check('confirmation fits viewport at ' + width, await evaluate('(() => { const r = elements.confirmDialog.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; })()'));
            await screenshot(width + '-confirm');
            await key('Escape', 'Escape');
            await click('.employee-details-button');
            check('attendance fits viewport at ' + width, await evaluate('(() => { const r = elements.attendanceDialog.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; })()'));
            await evaluate('elements.attendanceTableWrapper.scrollTop = 800');
            check('attendance header stays in scrolling table at ' + width, await evaluate('(() => { const h = document.querySelector(".attendance-table th").getBoundingClientRect(); const w = elements.attendanceTableWrapper.getBoundingClientRect(); return Math.abs(h.top - w.top) < 2; })()'));
            await screenshot(width + '-attendance');
            await key('Escape', 'Escape');
            await until('!elements.attendanceDialog.open && state.attendanceEmployeeId === null');
            await screenshot(width + '-review');
            await filter('#outlet-filter', 'Cozinha Central (Boa Vista)');
            check('long selected outlet label retains full accessible text at ' + width, await evaluate('document.getElementById("outlet-trigger-label").textContent === "Cozinha Central (Boa Vista)" && elements.outletFilter.title === "Cozinha Central (Boa Vista)" && document.documentElement.scrollWidth <= innerWidth'));
            await screenshot(width + '-long-outlet');
            await filter('#outlet-filter', 'all');
            await mouse('#outlet-filter');
            await key('End', 'End');
            check('outlet menu fits and scrolls active option into view at ' + width, await evaluate('(() => { const menu = document.getElementById("outlet-menu"); const r = menu.getBoundingClientRect(); const active = document.getElementById(elements.outletFilter.getAttribute("aria-activedescendant")).getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && active.top >= r.top && active.bottom <= r.bottom + 1; })()'));
            await screenshot(width + '-outlet');
            await key('Escape', 'Escape');
            await mouse('#status-filter');
            check('status menu fits viewport at ' + width, await evaluate('(() => { const r = document.getElementById("status-menu").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; })()'));
            await screenshot(width + '-status');
            await key('Escape', 'Escape');
            metrics.push(width);
        }
        await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
        await click('#calculate-button');
        await key('Tab', 'Tab', 8);
        await key('Tab', 'Tab', 8);
        check('confirmation contains reverse keyboard focus', await evaluate('elements.confirmDialog.contains(document.activeElement)'));
        await key('Escape', 'Escape');
        await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 1, mobile: true });
        await click('#calculate-button');
        check('confirmation fits short mobile viewport', await evaluate('(() => { const r = elements.confirmDialog.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()'));
        await key('Escape', 'Escape');
        await click('.employee-details-button');
        check('attendance footer fits short mobile viewport', await evaluate('(() => { const r = document.querySelector(".attendance-dialog-footer").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()'));
        await screenshot('320-short-attendance');
        await key('Escape', 'Escape');
        await until('!elements.attendanceDialog.open && state.attendanceEmployeeId === null && document.activeElement.classList.contains("employee-details-button")');
        await mouse('#outlet-filter');
        await until('!document.getElementById("outlet-menu").hidden && document.activeElement.id === "outlet-filter"');
        await key('Home', 'Home');
        await screenshot('320-short-outlet-home');
        const shortMenuGeometry = await evaluate('(() => { const r = document.getElementById("outlet-menu").getBoundingClientRect(); const h = document.querySelector(".app-header").getBoundingClientRect(); const active = document.getElementById(elements.outletFilter.getAttribute("aria-activedescendant")).getBoundingClientRect(); return {menuTop:r.top,menuBottom:r.bottom,headerBottom:h.bottom,activeTop:active.top,activeBottom:active.bottom}; })()');
        console.log('Short menu geometry:', JSON.stringify(shortMenuGeometry));
        check('short-mobile outlet menu and first option stay below sticky navigation', shortMenuGeometry.menuTop >= shortMenuGeometry.headerBottom && shortMenuGeometry.activeTop >= shortMenuGeometry.headerBottom && shortMenuGeometry.menuBottom <= 568);
        await key('End', 'End');
        await screenshot('320-short-outlet-end');
        check('short-mobile End keeps last outlet option visible', await evaluate('(() => { const active = document.getElementById(elements.outletFilter.getAttribute("aria-activedescendant")).getBoundingClientRect(); const r = document.getElementById("outlet-menu").getBoundingClientRect(); return active.top >= r.top && active.bottom <= r.bottom + 1; })()'));
        await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
        const touchArea = await evaluate('(() => { const menu = document.getElementById("outlet-menu"); menu.scrollTop = 0; const r = menu.getBoundingClientRect(); return {x:r.x + r.width / 2,start:r.bottom - 20,end:r.top + 20}; })()');
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x:touchArea.x,y:touchArea.start }] });
        await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x:touchArea.x,y:(touchArea.start + touchArea.end) / 2 }] });
        await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x:touchArea.x,y:touchArea.end }] });
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await pause(100);
        check('short-mobile outlet menu scrolls with touch', await evaluate('document.getElementById("outlet-menu").scrollTop > 0'));
        await send('Emulation.setTouchEmulationEnabled', { enabled: false });
        await key('Escape', 'Escape');
        await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
        await click('#calculate-button');
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 10, y: 100, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 10, y: 100, button: 'left', clickCount: 1 });
        await until('!elements.confirmDialog.open');
        check('backdrop closes confirmation without saving', await evaluate('repository.loadHistory().length'), 0);
        await click('#calculate-button');
        await evaluate('window.originalConfirm = repository.confirm; window.confirmCalls = 0; repository.confirm = (id,snapshot) => { confirmCalls++; window.capturedConfirmation = {id,snapshot}; return new Promise((resolve,reject) => { window.resolveConfirmation = resolve; window.rejectConfirmation = reject; }); }');
        await click('#confirm-distribution');
        check('pending confirmation locks record controls and marks dialog busy', await evaluate('elements.confirmDistribution.disabled && elements.cancelConfirmation.disabled && elements.closeDialog.disabled && elements.periodTrigger.disabled && elements.tips.readOnly && elements.confirmDialog.getAttribute("aria-busy") === "true"'));
        await evaluate('confirmDistribution(); selectPeriod(2026,12)');
        check('pending confirmation prevents duplicates and period changes', await evaluate('[confirmCalls,elements.period.value,repository.loadHistory().length]'), [1,'2026-09',0]);
        check('pending confirmation captures independent attendance evidence', await evaluate('capturedConfirmation.snapshot.attendanceSnapshot[0].attendance !== state.employees[0].attendance'));
        await key('Escape', 'Escape');
        check('Escape cannot dismiss an in-flight confirmation', await evaluate('elements.confirmDialog.open'));
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 10, y: 100, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 10, y: 100, button: 'left', clickCount: 1 });
        check('backdrop cannot dismiss an in-flight confirmation', await evaluate('elements.confirmDialog.open'));
        await evaluate('rejectConfirmation(new Error("Storage unavailable. Try again."))');
        await until('elements.confirmError.textContent.includes("Try again") && !elements.confirmDistribution.disabled');
        check('save failure keeps preview/dialog and reports recovery', await evaluate('elements.confirmDialog.open && elements.confirmError.textContent.includes("Try again") && state.confirmed === null'));
        check('failed async confirmation unlocks review and leaves history empty', await evaluate('!elements.cancelConfirmation.disabled && !elements.periodTrigger.disabled && !elements.tips.readOnly && repository.loadHistory().length === 0'));
        for (const [name, mutation] of [
            ['invalid date', 'record.createdAt = "invalid"'],
            ['missing total', 'delete record.totalTipsCents'],
            ['empty payments', 'record.payments = []'],
            ['invalid attendance', 'record.attendanceSnapshot = {}']
        ]) {
            await evaluate(`repository.confirm = () => { const record = {...structuredClone(capturedConfirmation.snapshot), id:capturedConfirmation.id, createdAt:new Date().toISOString()}; ${mutation}; return Promise.resolve(record); }`);
            await click('#confirm-distribution');
            await until('!state.confirming');
            check('malformed async response (' + name + ') preserves review and retry', await evaluate('state.confirmed === null && elements.confirmDialog.open && state.preview !== null && !state.previewStale && elements.confirmError.textContent.length > 0 && !elements.confirmDistribution.disabled && repository.loadHistory().length === 0'));
        }
        await evaluate('repository.confirm = (id,snapshot) => { confirmCalls++; window.capturedConfirmation = {id,snapshot}; return new Promise((resolve,reject) => { window.resolveConfirmation = resolve; window.rejectConfirmation = reject; }); }');
        await click('#confirm-distribution');
        check('failed confirmation can be retried exactly once', await evaluate('confirmCalls'), 2);
        await evaluate('(() => { const snapshot = structuredClone(capturedConfirmation.snapshot); const removedId = snapshot.payments[snapshot.payments.length - 1].id; snapshot.attendanceSnapshot.forEach(employee => { if(employee.id === removedId) { employee.included = false; employee.exclusionReason = "Excluded in returned record"; } }); Object.assign(snapshot,distributeTips(900123,snapshot.payments.filter(payment => payment.id !== removedId)),{reference:"TS-RETURNED-RECORD"}); window.authoritativeRecord = originalConfirm(capturedConfirmation.id,snapshot); resolveConfirmation(authoritativeRecord); })()');
        await until('state.confirmed !== null && !elements.confirmDialog.open');
        await evaluate('repository.confirm = window.originalConfirm');
        check('confirmation saves one exact snapshot and locks editing', await evaluate('[repository.loadHistory().length,state.confirmed.totalDistributedCents,elements.tips.readOnly,elements.calculateButton.disabled]'), [1, 900123, true, true]);
        check('confirmed UI uses returned record amounts reference and population', await evaluate('elements.recordReference.textContent === "TS-RETURNED-RECORD" && elements.summaryTips.textContent === "€9,001.23" && elements.summaryAllocated.textContent === "€9,001.23" && elements.summaryDifference.textContent === "€0.00" && getIncludedEmployees().length === authoritativeRecord.employeeCount && elements.actionEmployees.textContent === authoritativeRecord.employeeCount + " employees" && elements.actionDays.textContent === formatNumber(authoritativeRecord.totalWorkedDays) && elements.footerPayout.textContent === "€9,001.23"'));
        check('every confirmed displayed payout matches returned record', await evaluate('authoritativeRecord.payments.every(payment => elements.employeeRows.querySelector(`[data-employee-id="${payment.id}"] .payout-cell`).textContent === formatCurrencyFromCents(payment.amountCents))'));
        check('confirmed snapshot includes attendance and inclusion evidence', await evaluate('state.confirmed.attendanceSnapshot.length === 63 && state.confirmed.attendanceSnapshot.some(e => !e.included)'));
        await evaluate('confirmDistribution()');
        check('repeat confirmation does not duplicate record', await evaluate('repository.loadHistory().length'), 1);
        await screenshot('desktop-confirmed');
        await click('[data-view="history"]');
        await until('elements.distributionView.hidden');
        await click('.skip-link');
        check('skip link focuses current workspace without changing routes', await evaluate('elements.distributionView.hidden && location.hash === "#history" && document.activeElement.id === "main-content"'));
        await click('[data-view="distribution"]');
        await until('!elements.distributionView.hidden');
        check('navigation preserves confirmed workspace', await evaluate('!elements.distributionView.hidden && state.confirmed !== null'));
        await evaluate('selectPeriod(2026, 8)');
        check('new period resets preview and confirmation', await evaluate('[state.preview,state.confirmed,elements.tips.readOnly]'), [null, null, false]);
        await evaluate('state.employees.forEach(e => e.included = false); render()');
        await click('#calculate-button');
        check('no included employees gives workflow error', await evaluate('elements.workflowError.textContent.includes("Select at least")'));
        await evaluate('state.employees.forEach(e => { e.included = true; e.daysWorked = 0; }); render()');
        await click('#calculate-button');
        check('zero eligible days blocks calculation', await evaluate('elements.workflowError.textContent.includes("greater than zero")'));
        await send('Page.reload');
        await until('typeof state !== "undefined" && state.employees.length > 0');
        check('saved record survives reload', await evaluate('repository.loadHistory().length'), 1);
        await input('#tips', '0');
        await click('#calculate-button');
        check('zero tip pool produces exact zero payouts', await evaluate('state.preview.totalDistributedCents === 0 && state.preview.payments.every(p => p.amountCents === 0) && elements.summaryDifference.textContent === "€0.00"'));
        await evaluate('window.savedCatalog = localStorage.getItem("tipSplitterCatalog"); localStorage.setItem("tipSplitterCatalog", JSON.stringify({version:1,nextEmployeeId:1,outlets:[],employees:[]}))');
        await send('Page.reload');
        await until('typeof state !== "undefined" && typeof repository !== "undefined" && repository !== null');
        check('empty catalog remains empty with clear UI recovery', await evaluate('state.employees.length === 0 && elements.employeeRows.textContent.includes("No employees available") && elements.includeVisibleButton.disabled'));
        await evaluate('localStorage.setItem("tipSplitterCatalog", "malformed")');
        await send('Page.reload');
        await until('typeof elements !== "undefined" && !elements.storageNotice.hidden');
        check('corrupt storage is reported without replacing saved data', await evaluate('localStorage.getItem("tipSplitterCatalog") === "malformed" && repository === null && elements.storageNotice.textContent.includes("Existing data has not been replaced")'));
        await click('#calculate-button');
        await click('#calculate-button');
        await click('#confirm-distribution');
        check('unavailable storage cannot claim confirmation', await evaluate('state.confirmed === null && elements.confirmDialog.open && elements.confirmError.textContent.includes("unavailable")'));
        check('no runtime exceptions', errors, []);
        fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ checks, metrics, errors, networkErrors }, null, 2));
        console.log(JSON.stringify({ passed: checks.length, out, networkErrors }, null, 2));
    }
    await send('Browser.close');
    socket.close();
    server.close();
})().catch(error => {
    console.error(error);
    socket?.close();
    child?.kill();
    server?.close();
    process.exitCode = 1;
});
