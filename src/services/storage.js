function createStableId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    if (globalThis.crypto?.getRandomValues) {
        return Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, '0')).join('-');
    }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
}

function createDefaultCatalog(defaults) {
    const outlets = [...new Set(defaults.map(employee => employee.outlet))]
        .map(name => ({ id: createStableId(), name }));
    return {
        version: 1,
        nextEmployeeId: Math.max(0, ...defaults.map(employee => employee.id)) + 1,
        outlets,
        employees: defaults.map(({ outlet, ...employee }) => ({
            ...employee, outletId: outlets.find(item => item.name === outlet).id
        }))
    };
}

function createTipStore(storage, defaults) {
    const calculate = typeof module !== 'undefined' && module.exports ? require('../distribution.js').distributeTips : distributeTips;
    const catalogKey = 'tipSplitterCatalog';
    const historyKey = 'tipSplitterHistory';
    const clone = value => JSON.parse(JSON.stringify(value));
    const validName = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 120;
    const validId = value => typeof value === 'string' && /^[a-zA-Z0-9-]+$/.test(value);
    const whole = value => Number.isSafeInteger(value) && value >= 0;
    const unique = rows => new Set(rows.map(row => row.id)).size === rows.length;

    function validCatalog(data) {
        return data?.version === 1 && Array.isArray(data.outlets) && Array.isArray(data.employees)
            && whole(data.nextEmployeeId) && data.nextEmployeeId > 0
            && data.outlets.every(o => o && validId(o.id) && validName(o.name)) && unique(data.outlets)
            && data.employees.every(e => e && whole(e.id) && e.id > 0 && e.id < data.nextEmployeeId
                && validName(e.name) && (e.role === undefined || typeof e.role === 'string')
                && data.outlets.some(o => o.id === e.outletId)) && unique(data.employees);
    }

    function validRecord(record) {
        const valid = record?.version === 1 && validId(record.id) && validName(record.period)
            && whole(record.periodYear) && record.periodYear > 0 && record.periodYear <= 9999
            && whole(record.periodMonth) && record.periodMonth >= 1 && record.periodMonth <= 12
            && typeof record.createdAt === 'string' && Number.isFinite(Date.parse(record.createdAt))
            && whole(record.totalTipsCents) && whole(record.valuePerDayCents)
            && whole(record.totalWorkedDays) && record.totalWorkedDays > 0
            && record.totalDistributedCents === record.totalTipsCents
            && Array.isArray(record.payments) && record.payments.length > 0
            && record.employeeCount === record.payments.length
            && record.payments.every(p => p && whole(p.id) && p.id > 0 && validName(p.name)
                && validName(p.outlet) && whole(p.daysWorked) && whole(p.amountCents))
            && unique(record.payments)
            && record.payments.reduce((sum, p) => sum + BigInt(p.amountCents), 0n) === BigInt(record.totalTipsCents)
            && record.payments.reduce((sum, p) => sum + BigInt(p.daysWorked), 0n) === BigInt(record.totalWorkedDays)
            && (record.calculationModel === undefined || record.calculationModel === 'worked-days-largest-remainder-v1')
            && (record.currency === undefined || record.currency === 'EUR')
            && (record.scope === undefined || record.scope === 'hotel-wide')
            && (record.attendanceSource === undefined || record.attendanceSource === 'locally-generated-demo');
        if (!valid) return false;
        const expected = calculate(record.totalTipsCents, record.payments);
        const amounts = new Map(expected.payments.map(payment => [payment.id, payment.amountCents]));
        return expected.valuePerDayCents === record.valuePerDayCents
            && record.payments.every(payment => payment.amountCents === amounts.get(payment.id))
            && (record.attendanceSnapshot === undefined || validAttendanceSnapshot(record));
    }

    function validAttendanceSnapshot(record) {
        const employees = record.attendanceSnapshot;
        if (!Array.isArray(employees) || !employees.length || !employees.every(employee => employee
            && whole(employee.id) && employee.id > 0 && validName(employee.name) && validName(employee.outlet)
            && typeof employee.included === 'boolean' && whole(employee.daysWorked) && whole(employee.workedMinutes)
            && (employee.attendanceReviewed === undefined || typeof employee.attendanceReviewed === 'boolean')
            && (employee.exclusionReason === undefined || employee.exclusionReason === null || typeof employee.exclusionReason === 'string'))
            || !unique(employees)) return false;
        const period = String(record.periodYear).padStart(4, '0') + '-' + String(record.periodMonth).padStart(2, '0');
        const lastDay = new Date(0);
        lastDay.setUTCFullYear(record.periodYear, record.periodMonth, 0);
        const days = lastDay.getUTCDate();
        const payments = new Map(record.payments.map(payment => [payment.id, payment]));
        let included = 0;
        for (const employee of employees) {
            const attendance = employee.attendance;
            if (!Array.isArray(attendance) || attendance.length !== days) return false;
            const dates = new Set();
            let workedDays = 0;
            let workedMinutes = 0;
            for (const daily of attendance) {
                if (!daily || typeof daily.date !== 'string' || !daily.date.startsWith(period + '-')
                    || !/^\d{4}-\d{2}-\d{2}$/.test(daily.date) || dates.has(daily.date)
                    || Number(daily.date.slice(-2)) < 1 || Number(daily.date.slice(-2)) > days
                    || !['worked', 'day-off', 'absence'].includes(daily.status)
                    || !whole(daily.workedMinutes) || typeof daily.clockOutNextDay !== 'boolean') return false;
                dates.add(daily.date);
                if (daily.status === 'worked') {
                    const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
                    if (!validTime(daily.clockIn) || !validTime(daily.clockOut) || daily.workedMinutes === 0) return false;
                    const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
                    if (minutes(daily.clockOut) + (daily.clockOutNextDay ? 1440 : 0) - minutes(daily.clockIn) !== daily.workedMinutes) return false;
                    workedDays++;
                    workedMinutes += daily.workedMinutes;
                } else if (daily.workedMinutes !== 0 || daily.clockIn !== null || daily.clockOut !== null || daily.clockOutNextDay) return false;
            }
            if (workedDays !== employee.daysWorked || workedMinutes !== employee.workedMinutes) return false;
            const payment = payments.get(employee.id);
            if (employee.included) {
                included++;
                if (!payment || payment.name !== employee.name || payment.outlet !== employee.outlet || payment.daysWorked !== employee.daysWorked) return false;
            } else if (payment) return false;
        }
        return included === record.payments.length;
    }

    function read(key, validate) {
        try {
            const raw = storage.getItem(key);
            if (raw === null) return null;
            const data = JSON.parse(raw);
            if (!validate(data)) throw new Error('Invalid data');
            return data;
        } catch {
            throw new Error('Unable to read saved data (' + key + '). Existing data has not been replaced. Check browser storage and reload.');
        }
    }

    function write(key, data) {
        try { storage.setItem(key, JSON.stringify(data)); }
        catch { throw new Error('Unable to save changes. Browser storage may be full or unavailable. Free space or enable storage, then try again.'); }
    }

    const validHistory = data => data?.version === 1 && Array.isArray(data.records)
        && data.records.every(validRecord) && unique(data.records);
    // Validate both before seeding either; malformed saved data is never silently replaced.
    const initialCatalog = read(catalogKey, validCatalog);
    const initialHistory = read(historyKey, validHistory);
    if (initialCatalog === null) write(catalogKey, createDefaultCatalog(defaults));
    if (initialHistory === null) write(historyKey, { version: 1, records: [] });

    function loadCatalog() {
        const catalog = read(catalogKey, validCatalog);
        if (!catalog) throw new Error('Saved catalog is missing. Reload to initialize browser storage.');
        return catalog;
    }

    function loadHistory() {
        const data = read(historyKey, validHistory);
        if (!data) throw new Error('Saved history is missing. Reload to initialize browser storage.');
        return data.records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    function normalizeName(value) {
        const name = String(value ?? '').trim().replace(/\s+/gu, ' ').normalize('NFC');
        if (!validName(name)) throw new Error('Enter a name between 1 and 120 characters.');
        return name;
    }

    function sameName(a, b) { return a.toLowerCase() === b.toLowerCase(); }

    function saveOutlet({ id, name }) {
        const catalog = loadCatalog();
        name = normalizeName(name);
        if (catalog.outlets.some(o => o.id !== id && sameName(o.name, name))) {
            throw new Error('An outlet with this name already exists.');
        }
        const outlet = id ? catalog.outlets.find(o => o.id === id) : { id: createStableId() };
        if (!outlet) throw new Error('This outlet no longer exists.');
        outlet.name = name;
        if (!id) catalog.outlets.push(outlet);
        write(catalogKey, catalog);
        return clone(outlet);
    }

    function deleteOutlet(id) {
        const catalog = loadCatalog();
        if (catalog.employees.some(e => e.outletId === id)) {
            throw new Error('Employees are assigned to this outlet. Reassign or delete them before deleting the outlet.');
        }
        catalog.outlets = catalog.outlets.filter(o => o.id !== id);
        write(catalogKey, catalog);
    }

    function saveEmployee({ id, name, outletId }) {
        const catalog = loadCatalog();
        name = normalizeName(name);
        if (!catalog.outlets.some(o => o.id === outletId)) throw new Error('Select an existing outlet.');
        if (catalog.employees.some(e => e.id !== id && e.outletId === outletId && sameName(e.name, name))) {
            throw new Error('An employee with this name already exists in this outlet.');
        }
        if (!id && catalog.nextEmployeeId >= Number.MAX_SAFE_INTEGER) throw new Error('Employee ID limit reached.');
        // Preserve numeric IDs: the existing calculation engine uses them to break remainder ties.
        const employee = id ? catalog.employees.find(e => e.id === id) : { id: catalog.nextEmployeeId++ };
        if (!employee) throw new Error('This employee no longer exists.');
        Object.assign(employee, { name, outletId });
        if (!id) catalog.employees.push(employee);
        write(catalogKey, catalog);
        return clone(employee);
    }

    function deleteEmployee(id) {
        const catalog = loadCatalog();
        catalog.employees = catalog.employees.filter(e => e.id !== id);
        write(catalogKey, catalog);
    }

    function addHistoryRecord(id, result) {
        const records = loadHistory();
        const existing = records.find(record => record.id === id);
        if (existing) return existing;
        const record = clone({ ...result, version: 1, id, createdAt: new Date().toISOString(),
            calculationModel: 'worked-days-largest-remainder-v1', currency: 'EUR' });
        if (!validRecord(record)) throw new Error('Unable to save an invalid distribution. Review the calculation and try again.');
        records.unshift(record);
        write(historyKey, { version: 1, records });
        return clone(record);
    }

    function deleteHistoryRecord(id) {
        write(historyKey, { version: 1, records: loadHistory().filter(record => record.id !== id) });
    }

    return { loadCatalog, saveOutlet, deleteOutlet, saveEmployee, deleteEmployee,
        loadHistory, addHistoryRecord, deleteHistoryRecord };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createTipStore, createStableId, createDefaultCatalog };
}
