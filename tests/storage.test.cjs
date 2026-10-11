const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTipStore } = require('../src/services/storage.js');
const { distributeTips } = require('../src/distribution.js');
const { createDemoAttendance } = require('../src/data/attendance.js');
const { buildDistributionSnapshot } = require('../src/distribution-state.js');

const defaults = [
    { id: 1, name: 'David', role: 'Barman', outlet: 'Sky Bar' },
    { id: 2, name: 'José', role: 'Chef', outlet: 'Kitchen' }
];
function memoryStorage() {
    const data = new Map();
    return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
function setup() {
    const storage = memoryStorage();
    return { storage, store: createTipStore(storage, defaults) };
}
function result() {
    return { period: 'SEPTEMBER 2026', periodYear: 2026, periodMonth: 9,
        ...distributeTips(10000, defaults.map((e, i) => ({ ...e, daysWorked: i ? 10 : 20 }))) };
}

test('first load preserves defaults and relationships; subsequent load preserves edits', () => {
    const { storage, store } = setup();
    const catalog = store.loadCatalog();
    assert.equal(catalog.employees.length, 2);
    assert.equal(catalog.outlets.length, 2);
    assert.equal(catalog.employees[0].id, 1);
    assert.equal(catalog.employees[0].role, 'Barman');
    const outletId = catalog.employees[0].outletId;
    store.saveOutlet({ id: outletId, name: '  Rooftop   Bar  ' });
    const reloaded = createTipStore(storage, defaults).loadCatalog();
    assert.equal(reloaded.outlets.find(o => o.id === outletId).name, 'Rooftop Bar');
    assert.equal(reloaded.employees[0].outletId, outletId);
    assert.equal(reloaded.employees[0].outlet, undefined);
});

test('outlet validation and employee relationships prevent unsafe deletion', () => {
    const { store } = setup();
    assert.throws(() => store.saveOutlet({ name: ' ' }), /name/i);
    assert.throws(() => store.saveOutlet({ name: ' sky BAR ' }), /exists/i);
    const id = store.loadCatalog().outlets[0].id;
    assert.throws(() => store.deleteOutlet(id), /assigned/i);
    const added = store.saveOutlet({ name: 'Lobby Bar' });
    store.deleteOutlet(added.id);
    assert.equal(store.loadCatalog().outlets.length, 2);
});

test('employees validate names/outlets, keep IDs through edits, and never reuse deleted IDs', () => {
    const { storage, store } = setup();
    const outletId = store.loadCatalog().outlets[0].id;
    assert.throws(() => store.saveEmployee({ name: ' ', outletId }), /name/i);
    assert.throws(() => store.saveEmployee({ name: 'Test', outletId: 'missing' }), /outlet/i);
    assert.throws(() => store.saveEmployee({ name: ' david ', outletId }), /exists/i);
    const added = store.saveEmployee({ name: ' Test   Employee ', outletId });
    assert.equal(added.name, 'Test Employee');
    const otherOutlet = store.loadCatalog().outlets[1].id;
    store.saveEmployee({ ...added, name: 'Updated', outletId: otherOutlet });
    assert.equal(store.loadCatalog().employees.find(e => e.id === added.id).outletId, otherOutlet);
    store.deleteEmployee(added.id);
    const next = createTipStore(storage, defaults).saveEmployee({ name: 'Next', outletId });
    assert.ok(next.id > added.id);
});

test('empty catalogs are valid and are not reseeded on reload', () => {
    const { storage, store } = setup();
    store.loadCatalog().employees.forEach(e => store.deleteEmployee(e.id));
    store.loadCatalog().outlets.forEach(o => store.deleteOutlet(o.id));
    const catalog = createTipStore(storage, defaults).loadCatalog();
    assert.deepEqual(catalog.employees, []);
    assert.deepEqual(catalog.outlets, []);
});

test('history stores exact independent snapshots, deduplicates IDs, and deletes only one record', () => {
    const { storage, store } = setup();
    const calculated = result();
    const record = store.addHistoryRecord('distribution-1', calculated);
    assert.deepEqual(record.payments.map(p => p.amountCents), [6667, 3333]);
    assert.ok(Date.parse(record.createdAt));
    calculated.payments[0].name = 'Mutated result';
    record.payments[0].name = 'Mutated return';
    store.addHistoryRecord('distribution-1', result());
    assert.equal(store.loadHistory().length, 1);
    const original = store.loadHistory()[0];
    const catalog = store.loadCatalog();
    store.saveOutlet({ ...catalog.outlets[0], name: 'Renamed outlet' });
    store.saveEmployee({ ...catalog.employees[0], name: 'Renamed employee' });
    store.deleteEmployee(1);
    store.deleteOutlet(catalog.outlets[0].id);
    assert.deepEqual(createTipStore(storage, defaults).loadHistory()[0], original);
    store.addHistoryRecord('distribution-2', result());
    store.deleteHistoryRecord('distribution-1');
    assert.deepEqual(store.loadHistory().map(r => r.id), ['distribution-2']);
});

test('malformed stored data is reported and never overwritten', () => {
    for (const key of ['tipSplitterCatalog', 'tipSplitterHistory']) {
        const storage = memoryStorage();
        storage.setItem(key, '{broken');
        assert.throws(() => createTipStore(storage, defaults), /saved data/i);
        assert.equal(storage.getItem(key), '{broken');
    }
    const { storage } = setup();
    const catalog = JSON.parse(storage.getItem('tipSplitterCatalog'));
    catalog.employees[0].outletId = 'missing';
    storage.setItem('tipSplitterCatalog', JSON.stringify(catalog));
    assert.throws(() => createTipStore(storage, defaults), /saved data/i);
});

test('failed writes do not commit catalog mutations or completion records', () => {
    const { storage, store } = setup();
    const original = store.loadCatalog();
    storage.setItem = () => { throw new Error('QuotaExceededError'); };
    assert.throws(() => store.saveOutlet({ name: 'Lobby' }), /save/i);
    assert.deepEqual(store.loadCatalog(), original);
    assert.throws(() => store.addHistoryRecord('failed', result()), /save/i);
    assert.equal(store.loadHistory().length, 0);
});

test('mutations read current storage rather than overwriting another open view', () => {
    const { storage, store } = setup();
    const other = createTipStore(storage, defaults);
    store.saveOutlet({ name: 'Lobby' });
    other.saveOutlet({ name: 'Garden' });
    assert.equal(store.loadCatalog().outlets.length, 4);
});

test('conserved payouts must still follow deterministic worked-day allocation', () => {
    const { store } = setup();
    const calculated = result();
    calculated.payments[0].amountCents -= 1;
    calculated.payments[1].amountCents += 1;
    assert.throws(() => store.addHistoryRecord('wrong-allocation', calculated), /invalid|allocation/i);
    assert.equal(store.loadHistory().length, 0);
});

test('malformed conserved history is rejected on reload without replacement', () => {
    const { storage, store } = setup();
    store.addHistoryRecord('distribution-1', result());
    const history = JSON.parse(storage.getItem('tipSplitterHistory'));
    history.records[0].payments[0].amountCents -= 1;
    history.records[0].payments[1].amountCents += 1;
    const saved = JSON.stringify(history);
    storage.setItem('tipSplitterHistory', saved);
    assert.throws(() => createTipStore(storage, defaults), /saved data/i);
    assert.equal(storage.getItem('tipSplitterHistory'), saved);
});

test('new demo records retain coherent attendance evidence and reject altered snapshots', () => {
    const employees = createDemoAttendance(defaults, '2026-09');
    const preview = distributeTips(10000, employees.filter(employee => employee.included));
    const snapshot = buildDistributionSnapshot('2026-09', 'TS-DEMO-2026-09', employees, preview);
    const { store } = setup();
    assert.equal(store.addHistoryRecord('valid-evidence', snapshot).attendanceSnapshot.length, 2);
    const mutations = [
        record => { record.attendanceSnapshot[0].daysWorked += 1; },
        record => { record.attendanceSnapshot[0].included = false; },
        record => { record.attendanceSnapshot[0].attendance[0].date = '2026-10-01'; },
        record => { record.attendanceSnapshot[0].attendance[0].status = 'unknown'; },
        record => { record.attendanceSnapshot[0].workedMinutes += 1; },
        record => { record.attendanceSnapshot = []; }
    ];
    for (const mutate of mutations) {
        const altered = structuredClone(snapshot);
        mutate(altered);
        const isolated = setup().store;
        assert.throws(() => isolated.addHistoryRecord('altered-evidence', altered), /invalid|attendance|snapshot/i);
        assert.equal(isolated.loadHistory().length, 0);
    }
});
