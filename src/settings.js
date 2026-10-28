(() => {
    const ids = [
        'sidebar-workspace-name', 'settings-workspace-name', 'settings-workspace-display',
        'settings-workspace-edit', 'settings-workspace-form', 'settings-workspace-input',
        'settings-workspace-cancel', 'settings-workspace-save', 'settings-workspace-feedback',
        'settings-workspace-retry', 'settings-locations-enabled', 'settings-locations-enabled-label',
        'settings-locations-disabled-note',
        'settings-locations-toggle-feedback', 'settings-add-location', 'settings-location-count',
        'settings-locations-content', 'settings-locations-feedback', 'settings-locations-retry',
        'settings-location-list', 'settings-show-inactive', 'settings-location-dialog',
        'settings-location-form', 'settings-location-dialog-heading', 'settings-location-input',
        'settings-location-active-field', 'settings-location-active', 'settings-location-form-feedback',
        'settings-location-close', 'settings-location-cancel', 'settings-location-save',
        'settings-location-dialog-context', 'settings-location-preservation',
        'settings-language', 'settings-theme', 'settings-system-context', 'settings-preferences-feedback'
    ];
    const ui = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
    const model = {
        workspace: null,
        workspaceLoading: false,
        workspaceSaving: false,
        editingWorkspace: false,
        locationsLoading: false,
        locationSaving: false,
        editingLocationId: null,
        dialogOrigin: null
    };
    const feedback = new Map();
    const feedbackTimers = new Map();
    const successMessages = new Set(['settings.workspaceSaved', 'settings.locationsSaved', 'settings.preferencesSaved']);
    const validationMessages = new Set(['settings.nameInvalid', 'settings.preferencesFailed']);
    const t = (key, params) => TipSplitI18n.t(key, params);

    function paintMessage(id, value) {
        const node = ui[id];

        node.textContent = value.error
            ? TipSplitI18n.error(value.error, value.key)
            : value.key ? t(value.key) : '';
        node.classList.toggle('is-error', Boolean(value.error) || validationMessages.has(value.key));
        node.classList.toggle('is-warning', value.key === 'settings.preferencesSessionOnly');
    }

    function emptyLocationsMessage() {
        if (!state.locationsLoaded || state.locations.some(location => ui['settings-show-inactive'].checked || location.active)) return '';
        return state.locations.length ? 'settings.noActiveLocations' : 'settings.noLocations';
    }

    function message(id, key = '', error = null) {
        clearTimeout(feedbackTimers.get(id));
        feedbackTimers.delete(id);
        const value = { key, error };

        feedback.set(id, value);
        paintMessage(id, value);
        if (successMessages.has(key)) {
            feedbackTimers.set(id, setTimeout(() => {
                if (feedback.get(id) === value) {
                    message(id, id === 'settings-locations-feedback' ? emptyLocationsMessage() : '');
                }
            }, 4000));
        }
    }

    function validName(value) {
        const name = value.trim();
        return name.length > 0 && name.length <= 100 && !/[\u0000-\u001f\u007f]/u.test(value);
    }

    function renderWorkspace() {
        const workspace = model.workspace;
        const busy = model.workspaceLoading || model.workspaceSaving;

        if (!model.editingWorkspace) {
            ui['settings-workspace-name'].textContent = workspace
                ? workspace.name
                : model.workspaceLoading ? t('settings.loadingWorkspace') : '—';
        }

        ui['sidebar-workspace-name'].textContent = workspace?.name || '—';
        ui['settings-workspace-display'].hidden = model.editingWorkspace;
        ui['settings-workspace-form'].hidden = !model.editingWorkspace;
        ui['settings-workspace-edit'].disabled = !workspace || busy;
        ui['settings-workspace-input'].disabled = busy;
        ui['settings-workspace-cancel'].disabled = busy;
        ui['settings-workspace-save'].disabled = busy;
        ui['settings-workspace-save'].textContent = t(model.workspaceSaving ? 'common.saving' : 'common.saveChanges');
        ui['settings-workspace-form'].setAttribute('aria-busy', String(model.workspaceSaving));
        ui['settings-locations-enabled'].disabled = !workspace || busy;
        ui['settings-locations-enabled'].checked = workspace?.locationsEnabled === true;
        ui['settings-locations-enabled-label'].textContent = workspace
            ? t(workspace.locationsEnabled ? 'common.enabled' : 'common.disabled')
            : t('settings.workspaceUnavailable');
        ui['settings-locations-disabled-note'].hidden = workspace?.locationsEnabled !== false;
        ui['settings-add-location'].disabled = !workspace || !state.locationsLoaded || model.locationsLoading;
        ui['settings-show-inactive'].disabled = !state.locationsLoaded || model.locationsLoading;
    }

    function applyWorkspace(workspace) {
        const previousEnabled = model.workspace?.locationsEnabled;

        model.workspace = workspace;
        document.documentElement.dataset.locationsEnabled = String(workspace.locationsEnabled);
        document.querySelector('.employee-table tfoot th').colSpan = workspace.locationsEnabled ? 2 : 1;
        const searchHelp = document.querySelector('.search-control .sr-only');
        const employeeDescription = document.querySelector('[data-i18n="employees.formDescription"], [data-i18n="employees.formDescriptionWithoutLocations"]');

        searchHelp.dataset.i18n = workspace.locationsEnabled
            ? 'employees.searchHelp'
            : 'employees.searchHelpWithoutLocations';
        employeeDescription.dataset.i18n = workspace.locationsEnabled
            ? 'employees.formDescription'
            : 'employees.formDescriptionWithoutLocations';
        TipSplitI18n.translate(searchHelp);
        TipSplitI18n.translate(employeeDescription);

        if (previousEnabled !== workspace.locationsEnabled) {
            state.location = 'all';
            employeesLocationValue = 'all';
            populateEmployeeLocationFilter();
            render();
            renderEmployees();
        }

        renderWorkspace();
    }

    async function loadWorkspace() {
        if (model.workspaceLoading || model.workspaceSaving) return;

        model.workspaceLoading = true;
        ui['settings-workspace-retry'].hidden = true;
        message('settings-workspace-feedback', 'settings.loadingWorkspace');
        renderWorkspace();

        try {
            applyWorkspace(await repository.loadWorkspace());
            message('settings-workspace-feedback');
        } catch (error) {
            message('settings-workspace-feedback', 'settings.loadWorkspaceFailed', error);
            ui['settings-workspace-retry'].hidden = false;
        } finally {
            model.workspaceLoading = false;
            renderWorkspace();
        }
    }

    async function saveWorkspace(changes, feedbackId) {
        if (model.workspaceSaving || !model.workspace) return false;

        model.workspaceSaving = true;
        let failure = null;
        message(feedbackId, 'common.saving');
        renderWorkspace();

        try {
            applyWorkspace(await repository.updateWorkspace(changes));
            message(feedbackId, 'settings.workspaceSaved');
            return true;
        } catch (error) {
            failure = error;
            if (error.code === 'INVALID_NAME') ui['settings-workspace-input'].setAttribute('aria-invalid', 'true');
            message(feedbackId, 'settings.saveWorkspaceFailed', error);
            return false;
        } finally {
            model.workspaceSaving = false;
            renderWorkspace();
            if (failure) {
                const target = feedbackId === 'settings-locations-toggle-feedback'
                    ? ui['settings-locations-enabled']
                    : failure.code === 'INVALID_NAME' ? ui['settings-workspace-input'] : ui['settings-workspace-save'];

                target.focus();
            }
        }
    }

    function renderLocations() {
        const locations = state.locations.filter(location =>
            ui['settings-show-inactive'].checked || location.active
        );
        const list = ui['settings-location-list'];

        list.replaceChildren();
        ui['settings-location-count'].hidden = !state.locationsLoaded;
        ui['settings-location-count'].textContent = state.locationsLoaded ? formatNumber(state.locations.length) : '';

        if (!state.locationsLoaded) return;

        locations.forEach(location => {
            const row = document.createElement('li');
            const name = document.createElement('span');
            const edit = document.createElement('button');

            name.textContent = location.name;
            row.append(name);

            if (!location.active) {
                const status = document.createElement('span');

                status.className = 'settings-location-status';
                status.textContent = t('common.inactive');
                row.append(status);
            }

            edit.type = 'button';
            edit.className = 'settings-location-edit settings-text-button';
            edit.dataset.locationId = String(location.id);
            edit.textContent = t('common.edit');
            edit.setAttribute('aria-label', t('settings.editLocation') + ': ' + location.name);
            edit.addEventListener('click', () => openLocation(location, edit));
            row.append(edit);
            list.append(row);
        });

        const currentFeedback = feedback.get('settings-locations-feedback');

        if (!model.locationsLoading && !currentFeedback?.error && !successMessages.has(currentFeedback?.key)) {
            message('settings-locations-feedback', emptyLocationsMessage());
        }
    }

    async function loadSettingsLocations() {
        if (model.locationsLoading) return;
        if (state.locationsLoaded) {
            message('settings-locations-feedback');
            renderLocations();
            renderWorkspace();
            return;
        }

        model.locationsLoading = true;
        ui['settings-locations-content'].setAttribute('aria-busy', 'true');
        ui['settings-locations-retry'].hidden = true;
        message('settings-locations-feedback', 'settings.loadingLocations');
        renderWorkspace();

        try {
            await loadLocations();
            message('settings-locations-feedback');
        } catch (error) {
            message('settings-locations-feedback', 'settings.loadLocationsFailed', error);
            ui['settings-locations-retry'].hidden = false;
        } finally {
            model.locationsLoading = false;
            ui['settings-locations-content'].setAttribute('aria-busy', 'false');
            renderLocations();
            renderWorkspace();
        }
    }

    function renderLocationDialog() {
        const editing = model.editingLocationId !== null;

        ui['settings-location-dialog-heading'].textContent = t(editing ? 'settings.editLocation' : 'settings.addLocation');
        const contextKey = editing ? 'settings.editLocationContext' : 'settings.addLocationContext';

        ui['settings-location-dialog-context'].dataset.i18n = contextKey;
        ui['settings-location-dialog-context'].textContent = t(contextKey);
        ui['settings-location-save'].textContent = t(model.locationSaving
            ? 'common.saving'
            : editing ? 'common.saveChanges' : 'settings.addLocation');
        ui['settings-location-active-field'].hidden = !editing;
        ui['settings-location-preservation'].hidden = !editing;
        ui['settings-location-form'].setAttribute('aria-busy', String(model.locationSaving));
        for (const id of ['settings-location-input', 'settings-location-active', 'settings-location-save', 'settings-location-cancel', 'settings-location-close']) {
            ui[id].disabled = model.locationSaving;
        }
    }

    function openLocation(location = null, origin = ui['settings-add-location']) {
        if (model.locationSaving || !model.workspace) return;

        model.editingLocationId = location?.id ?? null;
        model.dialogOrigin = origin;
        ui['settings-location-input'].value = location?.name || '';
        ui['settings-location-active'].checked = location?.active ?? true;
        ui['settings-location-input'].removeAttribute('aria-invalid');
        message('settings-location-form-feedback');
        renderLocationDialog();
        ui['settings-location-dialog'].showModal();
        ui['settings-location-input'].focus();
    }

    function closeLocation() {
        if (model.locationSaving) return;

        ui['settings-location-dialog'].close();
    }

    function updateLocationCaches(saved) {
        const existing = state.locations.some(location => location.id === saved.id);

        state.locations = (existing
            ? state.locations.map(location => location.id === saved.id ? saved : location)
            : [...state.locations, saved])
            .sort((a, b) => a.name.localeCompare(b.name));

        const employeeCollections = state.confirmed
            ? [state.employeeDirectory]
            : [state.employeeDirectory, state.distributionEmployees];

        for (const employees of employeeCollections) {
            employees.forEach(employee => {
                employee.locations = (employee.locations || []).map(location => location.id === saved.id
                    ? { ...location, name: saved.name, active: saved.active }
                    : location);
            });
        }

        if (!state.locations.some(location => location.name === state.location)) state.location = 'all';
        populateEmployeeLocationFilter();
        renderEmployees();
        render();
        renderLocations();
    }

    async function saveLocation(event) {
        event.preventDefault();
        if (model.locationSaving) return;

        const name = ui['settings-location-input'].value.trim();

        if (!validName(ui['settings-location-input'].value)) {
            message('settings-location-form-feedback', 'settings.nameInvalid');
            ui['settings-location-input'].setAttribute('aria-invalid', 'true');
            ui['settings-location-input'].focus();
            return;
        }

        model.locationSaving = true;
        let failure = null;
        ui['settings-location-input'].removeAttribute('aria-invalid');
        message('settings-location-form-feedback');
        renderLocationDialog();

        try {
            const saved = model.editingLocationId === null
                ? await repository.createLocation({ name })
                : await repository.updateLocation(model.editingLocationId, {
                    name,
                    active: ui['settings-location-active'].checked
                });

            updateLocationCaches(saved);
            message('settings-locations-feedback', 'settings.locationsSaved');
            ui['settings-location-dialog'].close();
        } catch (error) {
            failure = error;
            if (['INVALID_NAME', 'LOCATION_NAME_EXISTS'].includes(error.code)) {
                ui['settings-location-input'].setAttribute('aria-invalid', 'true');
            }
            message('settings-location-form-feedback', 'settings.saveLocationFailed', error);
        } finally {
            model.locationSaving = false;
            renderLocationDialog();
            if (failure) {
                (ui['settings-location-input'].getAttribute('aria-invalid') === 'true'
                    ? ui['settings-location-input'] : ui['settings-location-save']).focus();
            }
        }
    }

    function renderPreferences() {
        ui['settings-language'].querySelectorAll('input').forEach(input => {
            input.checked = input.value === TipSplitI18n.getLanguage();
        });
        ui['settings-theme'].querySelectorAll('input').forEach(input => {
            input.checked = input.value === TipSplitTheme.getPreference();
        });
        ui['settings-system-context'].hidden = TipSplitTheme.getPreference() !== 'system';
    }

    window.TipSplitSettings = {
        locationsEnabled: () => model.workspace?.locationsEnabled === true,
        loadLocations: loadSettingsLocations
    };

    ui['settings-workspace-edit'].addEventListener('click', () => {
        if (!model.workspace || model.workspaceSaving) return;
        model.editingWorkspace = true;
        ui['settings-workspace-input'].value = model.workspace.name;
        ui['settings-workspace-input'].removeAttribute('aria-invalid');
        message('settings-workspace-feedback');
        renderWorkspace();
        ui['settings-workspace-input'].focus();
    });
    ui['settings-workspace-cancel'].addEventListener('click', () => {
        model.editingWorkspace = false;
        ui['settings-workspace-input'].value = model.workspace.name;
        ui['settings-workspace-input'].removeAttribute('aria-invalid');
        message('settings-workspace-feedback');
        renderWorkspace();
        ui['settings-workspace-edit'].focus();
    });
    ui['settings-workspace-form'].addEventListener('submit', async event => {
        event.preventDefault();
        const name = ui['settings-workspace-input'].value.trim();

        if (!validName(ui['settings-workspace-input'].value)) {
            message('settings-workspace-feedback', 'settings.nameInvalid');
            ui['settings-workspace-input'].setAttribute('aria-invalid', 'true');
            ui['settings-workspace-input'].focus();
            return;
        }

        ui['settings-workspace-input'].removeAttribute('aria-invalid');
        if (await saveWorkspace({ name }, 'settings-workspace-feedback')) {
            model.editingWorkspace = false;
            renderWorkspace();
            ui['settings-workspace-edit'].focus();
        }
    });
    ui['settings-workspace-form'].addEventListener('keydown', event => {
        if (event.key === 'Escape' && !model.workspaceSaving) {
            event.preventDefault();
            ui['settings-workspace-cancel'].click();
        }
    });
    ui['settings-workspace-retry'].addEventListener('click', loadWorkspace);
    ui['settings-locations-enabled'].addEventListener('change', async () => {
        const locationsEnabled = ui['settings-locations-enabled'].checked;

        await saveWorkspace({ locationsEnabled }, 'settings-locations-toggle-feedback');
        renderWorkspace();
    });
    ui['settings-locations-retry'].addEventListener('click', loadSettingsLocations);
    ui['settings-show-inactive'].addEventListener('change', () => {
        message('settings-locations-feedback');
        renderLocations();
    });
    ui['settings-add-location'].addEventListener('click', () => openLocation());
    ui['settings-location-close'].addEventListener('click', closeLocation);
    ui['settings-location-cancel'].addEventListener('click', closeLocation);
    ui['settings-location-form'].addEventListener('submit', saveLocation);
    ui['settings-location-dialog'].addEventListener('cancel', event => {
        if (model.locationSaving) event.preventDefault();
    });
    ui['settings-location-dialog'].addEventListener('close', () => {
        const origin = model.dialogOrigin;
        const replacement = [...ui['settings-location-list'].querySelectorAll('button')]
            .find(button => button.dataset.locationId === String(model.editingLocationId));

        (origin?.isConnected ? origin : replacement || ui['settings-add-location']).focus();
    });
    ui['settings-language'].addEventListener('change', event => {
        if (!event.target.matches('input[type="radio"]:checked')) return;
        const result = TipSplitI18n.setLanguage(event.target.value);

        message('settings-preferences-feedback', result.persisted
            ? 'settings.preferencesSaved'
            : 'settings.preferencesSessionOnly');
        renderPreferences();
    });
    ui['settings-theme'].addEventListener('change', event => {
        if (!event.target.matches('input[type="radio"]:checked')) return;
        const result = TipSplitTheme.setPreference(event.target.value);

        message('settings-preferences-feedback', result.ok
            ? 'settings.preferencesSaved'
            : 'settings.preferencesFailed');
        renderPreferences();
    });
    window.addEventListener('tipsplit:languagechange', () => {
        for (const [id, value] of feedback) paintMessage(id, value);
        renderWorkspace();
        renderLocations();
        renderLocationDialog();
        renderPreferences();
    });
    window.addEventListener('tipsplit:themechange', renderPreferences);

    TipSplitI18n.translate();
    document.documentElement.dataset.locationsEnabled = 'false';
    renderWorkspace();
    renderPreferences();
    loadWorkspace();
    if (!elements.settingsView.hidden) loadSettingsLocations();
})();
