const assert = require('node:assert/strict');
const test = require('node:test');
const { createThemeManager, STORAGE_KEY } = require('../src/theme.js');

function browser({ stored = null, dark = false, deniedRead = false, deniedWrite = false, legacy = false } = {}) {
    const events = [];
    const listeners = {};
    let mediaListener;
    const media = { matches: dark };
    if (legacy) media.addListener = listener => { mediaListener = listener; };
    else media.addEventListener = (_, listener) => { mediaListener = listener; };
    return {
        document: { documentElement: { dataset: {} } },
        localStorage: {
            getItem() {
                if (deniedRead) throw new Error('Storage unavailable');
                return stored;
            },
            setItem(key, value) {
                assert.equal(key, STORAGE_KEY);
                if (deniedWrite) throw new Error('Storage unavailable');
                stored = value;
            }
        },
        matchMedia: () => media,
        CustomEvent: class { constructor(type, { detail }) { Object.assign(this, { type, detail }); } },
        dispatchEvent: event => events.push(event),
        addEventListener: (name, listener) => { listeners[name] = listener; },
        changeSystem(value) { media.matches = value; mediaListener(); },
        storage(value) { listeners.storage({ key: STORAGE_KEY, newValue: value }); },
        events
    };
}

test('an unset preference immediately follows the system', () => {
    for (const dark of [false, true]) {
        const environment = browser({ dark });
        const theme = createThemeManager(environment);
        assert.equal(theme.getPreference(), 'system');
        assert.equal(theme.getEffectiveTheme(), dark ? 'dark' : 'light');
        assert.equal(environment.document.documentElement.dataset.theme, theme.getEffectiveTheme());
    }
});

test('invalid saved preferences fall back to the system', () => {
    assert.equal(createThemeManager(browser({ stored: 'sepia', dark: true })).getEffectiveTheme(), 'dark');
});

test('a saved explicit preference takes precedence over the system', () => {
    assert.equal(createThemeManager(browser({ stored: 'light', dark: true })).getEffectiveTheme(), 'light');
});

test('system changes update the theme live and notify listeners', () => {
    const environment = browser();
    const theme = createThemeManager(environment);
    environment.changeSystem(true);
    assert.equal(theme.getEffectiveTheme(), 'dark');
    assert.equal(environment.document.documentElement.dataset.theme, 'dark');
    assert.equal(environment.events.at(-1).detail.effectiveTheme, 'dark');
});

test('explicit themes ignore system changes', () => {
    const environment = browser({ stored: 'dark' });
    const theme = createThemeManager(environment);
    environment.changeSystem(false);
    assert.equal(theme.getEffectiveTheme(), 'dark');
    assert.equal(environment.events.length, 0);
});

test('all valid preferences are persisted and applied', () => {
    const environment = browser({ dark: true });
    const theme = createThemeManager(environment);
    for (const value of ['light', 'dark', 'system']) {
        assert.equal(theme.setPreference(value).ok, true);
        assert.equal(theme.getPreference(), value);
        assert.equal(environment.localStorage.getItem(STORAGE_KEY), value);
    }
});

test('invalid API input is rejected without changing the preference', () => {
    const theme = createThemeManager(browser({ stored: 'dark' }));
    assert.deepEqual(theme.setPreference('sepia'), { ok: false, error: 'invalid' });
    assert.equal(theme.getPreference(), 'dark');
});

test('denied storage reads fall back to a usable system theme', () => {
    assert.equal(createThemeManager(browser({ dark: true, deniedRead: true })).getEffectiveTheme(), 'dark');
});

test('failed saves retain the current preference and report failure', () => {
    const environment = browser({ stored: 'light', deniedWrite: true });
    const theme = createThemeManager(environment);
    assert.deepEqual(theme.setPreference('dark'), { ok: false, error: 'storage' });
    assert.equal(theme.getPreference(), 'light');
    assert.equal(environment.document.documentElement.dataset.theme, 'light');
    assert.equal(environment.events.at(-1).type, 'tipsplit:themeerror');
});

test('legacy media listeners still update system themes', () => {
    const environment = browser({ legacy: true });
    const theme = createThemeManager(environment);
    environment.changeSystem(true);
    assert.equal(theme.getEffectiveTheme(), 'dark');
});

test('preferences update across tabs, with invalid values falling back to system', () => {
    const environment = browser({ stored: 'dark' });
    const theme = createThemeManager(environment);
    environment.storage('light');
    assert.equal(theme.getPreference(), 'light');
    environment.storage('invalid');
    assert.equal(theme.getPreference(), 'system');
});

test('removing the saved preference across tabs restores the system theme', () => {
    const environment = browser({ stored: 'light', dark: true });
    const theme = createThemeManager(environment);
    environment.storage(null);
    assert.equal(theme.getPreference(), 'system');
    assert.equal(environment.document.documentElement.dataset.theme, 'dark');
});

test('missing media and unavailable storage do not prevent initialization', () => {
    const environment = browser();
    delete environment.matchMedia;
    delete environment.localStorage;
    const theme = createThemeManager(environment);
    assert.equal(theme.getEffectiveTheme(), 'light');
    assert.equal(theme.setPreference('dark').ok, false);
});
