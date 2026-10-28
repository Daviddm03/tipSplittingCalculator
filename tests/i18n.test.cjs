const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = () => fs.readFileSync(require.resolve('../src/i18n.js'), 'utf8');
function setup(stored, failWrite = false) {
    const events = [];
    const document = { documentElement: {}, querySelectorAll: () => [] };
    const context = { document, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        localStorage: { getItem: () => stored, setItem: (key, value) => { if (failWrite) throw Error('blocked'); stored = value; } },
        dispatchEvent: event => events.push(event) };
    context.window = context;
    vm.runInNewContext(source(), context);
    return { i18n: context.TipSplitI18n, events, document, stored: () => stored };
}
test('language defaults to English and invalid preferences fall back safely', () => {
    for (const value of [null, undefined, '', 'fr', '<script>']) {
        const { i18n, document } = setup(value);
        assert.equal(i18n.getLanguage(), 'en');
        assert.equal(document.documentElement.lang, 'en');
    }
});
test('language applies immediately, interpolates names as text, and persists only its UI key', () => {
    const { i18n, events, document, stored } = setup('en');
    const result = i18n.setLanguage('pt');
    assert.equal(result.persisted, true);
    assert.equal(stored(), 'pt');
    assert.equal(i18n.locale(), 'pt-PT');
    assert.equal(document.documentElement.lang, 'pt');
    assert.equal(i18n.t('employees.viewAttendance', { name: 'Alice <b>' }), 'Ver assiduidade de Alice <b>');
    assert.equal(events.at(-1).type, 'tipsplit:languagechange');
});
test('blocked storage is reported while the current-session preference still applies', () => {
    const { i18n, document } = setup('en', true);
    const result = i18n.setLanguage('pt');
    assert.equal(result.persisted, false);
    assert.ok(result.error);
    assert.equal(document.documentElement.lang, 'pt');
});
test('count messages use natural singular and plural forms in both languages', () => {
    const { i18n } = setup('en');
    assert.equal(i18n.t('common.employeeCount', { count: 1 }), '1 employee');
    assert.equal(i18n.t('common.employeeCount', { count: 0 }), '0 employees');
    i18n.setLanguage('pt');
    assert.equal(i18n.t('common.employeeCount', { count: 1 }), '1 colaborador');
    assert.equal(i18n.t('common.employeeCount', { count: 2 }), '2 colaboradores');
    assert.equal(i18n.t('distribution.eligibleDays', { count: 1 }), '1 dia trabalhado elegível');
});
test('all dictionary keys exist in both languages and backend codes have localized presentation', () => {
    const { i18n } = setup('pt');
    assert.deepEqual(Object.keys(i18n.translations.en).sort(), Object.keys(i18n.translations.pt).sort());
    assert.equal(i18n.error({ code: 'LOCATION_NAME_EXISTS' }), 'Já existe um local com este nome.');
    assert.equal(i18n.error(Error('Unexpected private backend details'), 'errors.loadEmployees'), 'Não foi possível carregar os colaboradores.');
});
test('static UI and rendering code reference keys defined in the shared dictionary', () => {
    const { i18n } = setup('en');
    for (const name of ['index.html', 'src/script.js', 'src/settings.js']) {
        const text = fs.readFileSync(require('node:path').join(__dirname, '..', name), 'utf8');
        const matches = name.endsWith('.html')
            ? text.matchAll(/data-i18n(?:-[-\w]+)?="([^"]+)"/g)
            : text.matchAll(/['"]((?:common|employees|distribution|attendance|history|settings|fields|nav|errors|a11y)\.[A-Za-z]\w*)['"]/g);
        for (const match of matches) assert.ok(Object.hasOwn(i18n.translations.en, match[1]), `${name}: ${match[1]}`);
    }
});
test('translation changes text and accessible attributes without changing field values', () => {
    const { i18n } = setup('pt');
    const attributes = { 'data-i18n-placeholder': 'employees.search', 'data-i18n-aria-label': 'employees.search' };
    const field = { dataset: {}, value: 'Alice', getAttribute: name => attributes[name], setAttribute: (name, value) => { attributes[name] = value; } };
    const text = { dataset: { i18n: 'nav.employees' }, getAttribute: () => null };
    i18n.translate({ querySelectorAll: () => [field, text] });
    assert.equal(text.textContent, 'Colaboradores');
    assert.equal(attributes.placeholder, 'Pesquisar colaboradores');
    assert.equal(attributes['aria-label'], 'Pesquisar colaboradores');
    assert.equal(field.value, 'Alice');
});
