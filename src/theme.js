(function (root) {
    'use strict';

    const STORAGE_KEY = 'tipSplit.theme';
    const isPreference = (value) => ['light', 'dark', 'system'].includes(value);

    function createThemeManager(environment) {
        const document = environment.document;
        let media = null;
        let preference = 'system';

        try {
            media = environment.matchMedia?.('(prefers-color-scheme: dark)') || null;
        } catch (_) {}

        try {
            const stored = environment.localStorage.getItem(STORAGE_KEY);
            if (isPreference(stored)) preference = stored;
        } catch (_) {}

        function getEffectiveTheme() {
            return preference === 'system' ? (media?.matches ? 'dark' : 'light') : preference;
        }

        function emit(name, detail) {
            if (typeof environment.CustomEvent === 'function') {
                environment.dispatchEvent(new environment.CustomEvent(name, { detail }));
            }
        }

        function apply(notify) {
            const effectiveTheme = getEffectiveTheme();
            document.documentElement.dataset.theme = effectiveTheme;
            document.documentElement.dataset.themePreference = preference;
            if (notify) emit('tipsplit:themechange', { preference, effectiveTheme });
        }

        function setPreference(value) {
            if (!isPreference(value)) return { ok: false, error: 'invalid' };
            try {
                environment.localStorage.setItem(STORAGE_KEY, value);
            } catch (_) {
                emit('tipsplit:themeerror', { error: 'storage' });
                return { ok: false, error: 'storage' };
            }
            preference = value;
            apply(true);
            return { ok: true, preference, effectiveTheme: getEffectiveTheme() };
        }

        const onSystemChange = () => {
            if (preference === 'system') apply(true);
        };
        if (media?.addEventListener) media.addEventListener('change', onSystemChange);
        else if (media?.addListener) media.addListener(onSystemChange);

        environment.addEventListener?.('storage', (event) => {
            if (event.key !== STORAGE_KEY && event.key !== null) return;
            preference = isPreference(event.newValue) ? event.newValue : 'system';
            apply(true);
        });

        apply(false);
        return Object.freeze({ getPreference: () => preference, getEffectiveTheme, setPreference });
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createThemeManager, isPreference, STORAGE_KEY };
    }
    if (root?.document) root.TipSplitTheme = createThemeManager(root);
}(typeof window !== 'undefined' ? window : null));
