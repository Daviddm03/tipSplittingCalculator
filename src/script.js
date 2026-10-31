const i18n = window.TipSplitI18n;
const t = (key, params) => i18n.t(key, params);
const localizedMessages = new Map();

function setMessage(element, key, params = {}) {
    const value = t(key, params);
    element.textContent = value;
    localizedMessages.set(element, { key, params, last: value });
}

function setError(element, error, fallbackKey) {
    const value = i18n.error(error, fallbackKey);
    element.textContent = value;
    localizedMessages.set(element, { error, fallbackKey, last: value });
}

const state = {
    distributionEmployees: [],
    employeeDirectory: [],
    locations: [],
    employeesLoaded: false,
    employeesLoading: false,
    locationsLoaded: false,
    search: '',
    location: 'all',
    status: 'all',
    preview: null,
    previewStale: false,
    confirmed: null,
    monthPickerYear: 2026,
    attendanceEmployeeId: null,
    draftId: null,
    confirming: false,
    loadingAttendance: false,
    attendanceReady: false,
    attendanceError: null,
    attendanceRefreshNeeded: false,
    calculating: false,
    history: [],
    historyLoaded: false,
    historyLoading: false,
    historyDetail: null,
    historyError: null,
    editingEmployeeId: null,
    openingEmployee: false,
    savingEmployee: false,
};

const elementIds = {
    distributionView: 'distribution-view',
    settingsView: 'settings-view',
    settingsHeading: 'settings-heading',
    period: 'period',
    periodControl: 'period-control',
    periodTrigger: 'period-trigger',
    periodTriggerLabel: 'period-trigger-label',
    periodMenu: 'period-menu',
    monthPickerYear: 'month-picker-year',
    monthGrid: 'month-grid',
    previousYear: 'previous-year',
    nextYear: 'next-year',
    currentMonthButton: 'current-month-button',
    tips: 'tips',
    tipsError: 'tips-error',
    employeeRows: 'employee-rows',
    employeeSearch: 'employee-search',
    locationFilter: 'location-filter',
    statusFilter: 'status-filter',
    includedCount: 'included-count',
    visibleCount: 'visible-count',
    footerDays: 'footer-days',
    footerHours: 'footer-hours',
    footerPayout: 'footer-payout',
    actionEmployees: 'action-employees',
    actionDays: 'action-days',
    summaryTips: 'summary-tips',
    allocatedSummary: 'allocated-summary',
    differenceSummary: 'difference-summary',
    summaryAllocated: 'summary-allocated',
    summaryDifference: 'summary-difference',
    previewStatus: 'preview-status',
    attendanceState: 'attendance-state',
    attendanceRetry: 'attendance-retry',
    calculateButton: 'calculate-button',
    confirmDialog: 'confirm-dialog',
    closeDialog: 'close-dialog',
    cancelConfirmation: 'cancel-confirmation',
    confirmDistribution: 'confirm-distribution',
    confirmReference: 'confirm-reference',
    confirmPeriod: 'confirm-period',
    confirmTotal: 'confirm-total',
    confirmEmployees: 'confirm-employees',
    confirmDays: 'confirm-days',
    confirmError: 'confirm-error',
    attendanceDialog: 'attendance-dialog',
    closeAttendanceDialog: 'close-attendance-dialog',
    attendanceDialogDone: 'attendance-dialog-done',
    attendanceEmployeeName: 'attendance-employee-name',
    attendanceEmployeeReference: 'attendance-employee-reference',
    attendanceEmployeeContext: 'attendance-employee-context',
    attendancePeriodLabel: 'attendance-period-label',
    attendanceTotalDays: 'attendance-total-days',
    attendanceTotalHours: 'attendance-total-hours',
    attendanceRecords: 'attendance-records',
    attendanceReviewNote: 'attendance-review-note',
    pageTitle: 'distribution-heading',
    attendanceCoverage: 'attendance-coverage',
    attendanceSource: 'attendance-source',
    tableNoteEmployees: 'table-note-employees',
    tableNoteDays: 'table-note-days',
    workflowError: 'workflow-error',
    workflowNotice: 'workflow-notice',
    workspaceStatus: 'workspace-status',
    storageNotice: 'storage-notice',
    historyView: 'history-view',
    historyHeading: 'history-heading',
    historyCount: 'history-count',
    historyPageHeader: 'history-page-header',
    historyFeedback: 'history-feedback',
    historyList: 'history-list',
    historyRows: 'history-rows',
    historyDetail: 'history-detail',
    historyBack: 'history-back',
    historyDetailHeading: 'history-detail-heading',
    historyDetailReference: 'history-detail-reference',
    historyDetailPool: 'history-detail-pool',
    historyDetailPeriod: 'history-detail-period',
    historyDetailEmployees: 'history-detail-employees',
    historyDetailAllocated: 'history-detail-allocated',
    historyDetailDifference: 'history-detail-difference',
    historyDetailMethod: 'history-detail-method',
    historyDetailSource: 'history-detail-source',
    historyDetailRows: 'history-detail-rows',
    historySummaryLine: 'history-summary-line',
    employeesView: 'employees-view',
    employeesHeading: 'employees-heading',
    employeesCount: 'employees-count',
    employeesFeedback: 'employees-feedback',
    employeesSearch: 'employees-search',
    employeesLocationFilter: 'employees-location-filter',
    employeesLocationTriggerLabel: 'employees-location-trigger-label',
    employeesLocationMenu: 'employees-location-menu',
    employeesStatusFilter: 'employees-status-filter',
    employeesStatusTriggerLabel: 'employees-status-trigger-label',
    employeesStatusMenu: 'employees-status-menu',
    employeesRows: 'employees-rows',
    addEmployee: 'add-employee',
    employeeDialog: 'employee-dialog',
    employeeDialogTitle: 'employee-dialog-title',
    employeeForm: 'employee-form',
    employeeFormCode: 'employee-form-code',
    employeeFormName: 'employee-form-name',
    employeeFormEmail: 'employee-form-email',
    employeeFormRole: 'employee-form-role',
    employeeFormLocations: 'employee-form-locations',
    employeeFormActive: 'employee-form-active',
    employeeFormError: 'employee-form-error',
    closeEmployeeDialog: 'close-employee-dialog',
    cancelEmployeeForm: 'cancel-employee-form',
    saveEmployee: 'save-employee',
};

const elements = Object.fromEntries(Object.entries(elementIds).map(([name, id]) => [name, document.getElementById(id)]));
elements.recordReference = document.querySelector('.record-reference');
elements.recordStatus = document.querySelector('.record-status');
elements.attendanceTableWrapper = document.querySelector('.attendance-table-wrapper');
let monthNames = [];
function updateMonthNames() {
    monthNames = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat(i18n.locale(), { month: 'long' }).format(new Date(2026, month, 1)));
}
updateMonthNames();
let repository = null;
let locationsRequest = null;
let dialogOrigin = null;
let attendanceRequest = 0;
let historyRevision = 0;
let employeeDialogOrigin = null;
const filterControls = [];
const distributionFilters = {};

function closeOpenControls() {
    closeMonthPicker();
    filterControls.forEach(control => control.close());
}

function bindFilters() {
    const controls = [
        {
            stateKey: 'location',
            trigger: elements.locationFilter,
            label: document.getElementById('location-trigger-label'),
            menu: document.getElementById('location-menu')
        },
        {
            stateKey: 'status',
            trigger: elements.statusFilter,
            label: document.getElementById('status-trigger-label'),
            menu: document.getElementById('status-menu')
        }
    ];

    controls.forEach(({ stateKey, trigger, label, menu }) => {
        const control = createCustomSelect({
            trigger,
            label,
            menu,
            onOpen: closeOpenControls,
            onChange: value => {
                state[stateKey] = value;
                render();

                announce('employees.filterAnnouncement', { count: formatNumber(getVisibleEmployees().length) });
            }
        });

        distributionFilters[stateKey] = control;
        filterControls.push(control);
    });
}

let employeesLocationValue = 'all';
let employeesStatusValue = 'all';

const employeesLocationSelect = createCustomSelect({
    trigger: elements.employeesLocationFilter,
    label: elements.employeesLocationTriggerLabel,
    menu: elements.employeesLocationMenu,
    onOpen: closeOpenControls,
    onChange: value => {
        employeesLocationValue = value;
        populateEmployeeLocationFilter();
        renderEmployees();
    }
});

const employeesStatusSelect = createCustomSelect({
    trigger: elements.employeesStatusFilter,
    label: elements.employeesStatusTriggerLabel,
    menu: elements.employeesStatusMenu,
    onOpen: closeOpenControls,
    onChange: value => {
        employeesStatusValue = value;
        populateEmployeeStatusFilter();
        renderEmployees();
    }
});

filterControls.push(
    employeesLocationSelect,
    employeesStatusSelect
);

function formatNumber(value) {
    return new Intl.NumberFormat(i18n.locale()).format(value);
}

function formatCurrencyFromCents(cents) {
    const amount = BigInt(cents);
    const absolute = amount < 0n ? -amount : amount;
    const whole = Number(absolute / 100n) * (amount < 0n ? -1 : 1);
    const fraction = String(absolute % 100n).padStart(2, '0');

    return new Intl.NumberFormat(i18n.locale(), { style: 'currency', currency: 'EUR' })
        .formatToParts(whole)
        .map(part => part.type === 'fraction' ? fraction : part.value)
        .join('');
}

function formatHours(minutes) {
    return formatAttendanceDuration(minutes);
}

function formatPeriod(period) {
    const normalizedPeriod = /^\d{4}-\d{2}-\d{2}$/.test(period)
        ? period.slice(0, 7)
        : period;

    const { year, month } = parseAttendancePeriod(normalizedPeriod);

    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, 1);

    return new Intl.DateTimeFormat(i18n.locale(), {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC'
    }).format(date);
}

function getTipsCents() {
    return parseMoneyToCents(elements.tips.value);
}

function getEmployeeLocationNames(employee) {
    if (!Array.isArray(employee.locations)) {
        return [];
    }

    return employee.locations
        .map(location => {
            return typeof location === 'string'
                ? location
                : location.name;
        })
        .filter(Boolean);
}

function syncCurrentLocationNames(employees) {
    if (!state.locationsLoaded) return employees;

    return employees.map(employee => ({
        ...employee,
        locations: (employee.locations || []).map(location => {
            const current = state.locations.find(item => item.id === location.id);
            return current ? { ...location, name: current.name, active: current.active } : location;
        })
    }));
}

function getEmployeeLocationLabel(employee) {
    const locations = getEmployeeLocationNames(employee);

    return locations.length
        ? locations.join(', ')
        : '—';
}

function getVisibleEmployees() {
    const search = state.search.trim().toLowerCase();

    return state.distributionEmployees.filter(employee => {
        const locations = getEmployeeLocationNames(employee);

        const matchesSearch =
            !search ||
            employee.name.toLowerCase().includes(search) ||
            String(employee.reference || '')
                .toLowerCase()
                .includes(search) ||
            String(employee.role || '')
                .toLowerCase()
                .includes(search) ||
            (window.TipSplitSettings?.locationsEnabled() !== false && locations.some(location =>
                location.toLowerCase().includes(search)
            ));

        const matchesLocation =
            state.location === 'all' ||
            locations.includes(state.location);

        const matchesStatus =
            state.status === 'all' ||
            (
                state.status === 'participating' &&
                employee.daysWorked > 0
            ) ||
            (
                state.status === 'no-worked-days' &&
                employee.daysWorked === 0
            );

        return (
            matchesSearch &&
            matchesLocation &&
            matchesStatus
        );
    });
}

function getParticipants() {
    return state.distributionEmployees.filter(
        employee => employee.daysWorked > 0
    );
}

function currentPreview() {
    return state.confirmed || (state.previewStale ? null : state.preview);
}

function editingLocked() {
    return Boolean(state.confirmed) || state.confirming || state.loadingAttendance || state.calculating;
}

function announce(key, params = {}) {
    setMessage(elements.workspaceStatus, key, params);
}

function invalidatePreview() {
    if (state.preview) state.previewStale = true;
    elements.workflowError.textContent = '';
}

function createCell(value, className = '') {
    const cell = document.createElement('td');
    cell.textContent = value;
    cell.className = className;
    return cell;
}

function restoreEmployeeFocus(id, selector) {
    const row = elements.employeeRows.querySelector('[data-employee-id="' + id + '"]');
    if (row) row.querySelector(selector).focus({ preventScroll: true });
    else elements.statusFilter.focus({ preventScroll: true });
}

function createEmployeeRow(employee) {
    const row = document.createElement('tr');
    row.dataset.employeeId = employee.id;
    row.classList.toggle('excluded-row', employee.daysWorked === 0);
    const identity = document.createElement('td');
    const wrapper = document.createElement('div');
    wrapper.className = 'employee-identity';
    const details = document.createElement('button');
    details.type = 'button';
    details.className = 'employee-details-button';
    details.textContent = employee.name;
    details.title = employee.name;
    details.setAttribute('aria-label', t('employees.viewAttendance', { name: employee.name }));
    details.addEventListener('click', () => openAttendanceDialog(employee.id));
    const meta = document.createElement('span');
    meta.id = 'employee-meta-' + employee.id;
    const status = employee.daysWorked > 0 ? employee.role : t('attendance.noWorkedDays');
    meta.textContent = [employee.reference, status].filter(Boolean).join(' · ');
    wrapper.append(details, meta);
    identity.appendChild(wrapper);
    const payment = currentPreview()?.payments.find(item => item.id === employee.id);
    row.append(identity, createCell(getEmployeeLocationLabel(employee)), createCell(formatNumber(employee.daysWorked), 'numeric-cell'),
        createCell(formatHours(employee.workedMinutes), 'numeric-cell'),
        createCell(payment ? formatCurrencyFromCents(payment.amountCents)
            : currentPreview() && employee.daysWorked === 0 ? formatCurrencyFromCents(0) : '—', 'numeric-cell payout-cell'));
    return row;
}

function clearFilters() {
    state.search = '';
    state.location = 'all';
    state.status = 'all';
    elements.employeeSearch.value = '';
    render();
    elements.employeeSearch.focus();
    announce('employees.filtersCleared', { count: formatNumber(state.distributionEmployees.length) });
}

function renderDistributionEmployees(visible, summary) {
    const fragment = document.createDocumentFragment();
    visible.forEach(employee => fragment.appendChild(createEmployeeRow(employee)));
    if (!visible.length) {
        const row = document.createElement('tr');
        const cell = createCell(t(state.distributionEmployees.length ? 'employees.noMatches' : 'employees.noPeriodEmployees'), 'empty-state');
        cell.colSpan = window.TipSplitSettings?.locationsEnabled() === false ? 4 : 5;
        if (state.distributionEmployees.length) {
            const reset = document.createElement('button');
            reset.type = 'button';
            reset.id = 'clear-filters';
            reset.className = 'text-action';
            reset.textContent = t('employees.clearFilters');
            reset.addEventListener('click', clearFilters);
            cell.appendChild(reset);
        }
        row.appendChild(cell);
        fragment.appendChild(row);
    }
    elements.employeeRows.replaceChildren(fragment);
    elements.visibleCount.textContent = t('employees.visibleTotals', { visible: formatNumber(visible.length), total: formatNumber(state.distributionEmployees.length) });
    elements.footerDays.textContent = formatNumber(summary.visibleDays);
    elements.footerHours.textContent = formatHours(summary.visibleMinutes);
    elements.footerPayout.textContent = currentPreview() ? formatCurrencyFromCents(summary.visiblePayoutCents) : '—';
}

function renderFilters() {
    const locations = [
        ...new Set(
            state.distributionEmployees.flatMap(
                getEmployeeLocationNames
            )
        )
    ].sort((a, b) => a.localeCompare(b));

    distributionFilters.location.update(
        [
            {
                value: 'all',
                label: t('common.allLocations')
            },
            ...locations.map(location => ({
                value: location,
                label: location
            }))
        ],
        state.location
    );

    const options = [
        [
            'all',
            t('common.allEmployees'),
            state.distributionEmployees.length
        ],
        [
            'participating',
            t('distribution.participating'),
            getParticipants().length
        ],
        [
            'no-worked-days',
            t('attendance.noWorkedDays'),
            state.distributionEmployees.length -
                getParticipants().length
        ]
    ];

    distributionFilters.status.update(
        options.map(([value, label, count]) => ({
            value,
            label,
            count
        })),
        state.status
    );
}

function renderMonthPicker() {
    const { year, month } = parseAttendancePeriod(elements.period.value);
    elements.monthPickerYear.textContent = state.monthPickerYear;
    elements.previousYear.disabled = state.monthPickerYear <= 2000;
    elements.nextYear.disabled = state.monthPickerYear >= 2100;
    elements.monthGrid.replaceChildren(...monthNames.map((name, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'month-option';
        button.dataset.month = index + 1;
        button.textContent = name.slice(0, 3);
        const selected = state.monthPickerYear === year && index + 1 === month;
        button.setAttribute('aria-pressed', String(selected));
        button.setAttribute('aria-label', name + ' ' + state.monthPickerYear);
        button.classList.toggle('selected', selected);
        button.addEventListener('click', () => selectPeriod(state.monthPickerYear, index + 1));
        return button;
    }));
}

function closeMonthPicker(restoreFocus = false) {
    elements.periodMenu.hidden = true;
    elements.periodTrigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) elements.periodTrigger.focus();
}

function openMonthPicker() {
    if (state.confirming) return;
    closeOpenControls();
    state.monthPickerYear = parseAttendancePeriod(elements.period.value).year;
    renderMonthPicker();
    elements.periodMenu.hidden = false;
    elements.periodTrigger.setAttribute('aria-expanded', 'true');
    elements.monthGrid.querySelector('.selected').focus();
}

async function selectPeriod(year, month, retry = false) {
    if (state.confirming || state.calculating) return;
    const period = String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0');
    parseAttendancePeriod(period);
    if (period === elements.period.value && state.attendanceReady && !retry && !state.loadingAttendance) return;
    const request = ++attendanceRequest;
    closeMonthPicker();
    elements.period.value = period;
    state.loadingAttendance = true;
    state.attendanceReady = false;
    state.attendanceError = null;
    state.attendanceRefreshNeeded = false;
    state.distributionEmployees = [];
    state.preview = null;
    state.previewStale = false;
    state.confirmed = null;
    state.draftId = createStableId();
    state.search = ''; state.location = 'all'; state.status = 'all';
    elements.employeeSearch.value = '';
    elements.workflowError.textContent = '';
    elements.workflowNotice.textContent = '';
    render();
    try {
        if (!repository) throw new Error(t('errors.serviceUnavailable'));
        const employees = await repository.loadAttendance(period);
        if (request !== attendanceRequest) return;
        state.distributionEmployees = syncCurrentLocationNames(employees);
        state.attendanceReady = true;
        announce('attendance.periodLoaded', { period: formatPeriod(period) });
    } catch (error) {
        if (request !== attendanceRequest) return;
        state.attendanceError = error;
        setError(elements.workflowError, error, 'errors.loadAttendance');
    } finally {
        if (request === attendanceRequest) { state.loadingAttendance = false; render(); }
    }
}

function updateReconciliation() {
    const tips = state.confirmed?.totalTipsCents ?? getTipsCents();
    elements.summaryTips.textContent = tips === null ? '—' : formatCurrencyFromCents(tips);
    const preview = currentPreview();
    elements.allocatedSummary.hidden = !preview;
    elements.differenceSummary.hidden = !preview;
    elements.previewStatus.hidden = !state.previewStale;
    elements.summaryAllocated.textContent = preview ? formatCurrencyFromCents(preview.totalDistributedCents) : '—';
    elements.summaryDifference.textContent = preview ? formatCurrencyFromCents(preview.totalTipsCents - preview.totalDistributedCents) : '—';
    elements.calculateButton.replaceChildren(document.createTextNode(t(state.confirmed ? 'common.confirmed' : state.calculating ? 'distribution.calculating' : preview ? 'distribution.confirm' : state.previewStale ? 'distribution.recalculate' : 'distribution.calculate')));
    const icon = document.createElement('i');
    icon.className = 'icon ' + (state.confirmed ? 'icon-check' : state.previewStale ? 'icon-refresh-cw' : 'icon-arrow-right');
    icon.setAttribute('aria-hidden', 'true');
    elements.calculateButton.appendChild(icon);
    elements.calculateButton.disabled = editingLocked() || !state.attendanceReady || Boolean(state.attendanceError) || !getParticipants().length;
}

function render() {
    const visible = getVisibleEmployees();
    const summary = summarizeWorkspace(state.distributionEmployees, visible, currentPreview());
    if (state.confirmed) {
        summary.participantCount = state.confirmed.employeeCount;
        summary.participantDays = state.confirmed.totalWorkedDays;
    }
    const { year, month, days } = parseAttendancePeriod(elements.period.value);
    elements.pageTitle.textContent = formatPeriod(elements.period.value);
    elements.periodTriggerLabel.textContent = formatPeriod(elements.period.value);
    elements.recordReference.textContent = state.confirmed?.reference || 'TS-' + elements.period.value;
    elements.recordStatus.textContent = t(state.confirmed ? 'common.confirmed' : currentPreview() ? 'distribution.review' : 'distribution.draft');
    elements.attendanceCoverage.textContent = t('attendance.coverage', { days, month: monthNames[month - 1].slice(0, 3), year });
    elements.attendanceSource.textContent = t('attendance.source');
    elements.includedCount.textContent = t('distribution.participantCount', { count: formatNumber(summary.participantCount) });
    elements.actionEmployees.textContent = t('common.employeeCount', { count: formatNumber(summary.participantCount) });
    elements.actionDays.textContent = formatNumber(summary.participantDays);
    elements.tableNoteEmployees.textContent = t('distribution.participantCount', { count: formatNumber(summary.participantCount) });
    elements.tableNoteDays.textContent = t('distribution.eligibleDays', { count: formatNumber(summary.participantDays) });
    elements.tips.readOnly = editingLocked();
    elements.periodTrigger.disabled = state.confirming || state.calculating;
    elements.attendanceRetry.hidden = !state.attendanceError;
    elements.attendanceRetry.disabled = state.loadingAttendance;
    elements.attendanceState.textContent = state.loadingAttendance ? t('attendance.loading')
        : state.attendanceReady && !getParticipants().length ? t('attendance.empty') : '';
    elements.employeeRows.setAttribute('aria-busy', String(state.loadingAttendance));
    renderFilters();
    renderDistributionEmployees(visible, summary);
    updateReconciliation();
}

async function calculateDistribution() {
    if (editingLocked() || !state.attendanceReady || state.attendanceError) return;
    elements.workflowError.textContent = '';
    const tips = getTipsCents();
    if (tips === null || tips <= 0) {
        setMessage(elements.tipsError, 'distribution.positiveAmount');
        elements.tips.setAttribute('aria-invalid', 'true');
        elements.tips.focus();
        return;
    }
    elements.tipsError.textContent = '';
    elements.tips.removeAttribute('aria-invalid');
    if (!getParticipants().length) return;
    state.calculating = true;
    render();
    try {
        const preview = await repository.preview(elements.period.value, tips);
        if (state.attendanceRefreshNeeded) return;
        state.distributionEmployees = syncCurrentLocationNames(preview.employees);
        state.preview = preview;
        state.previewStale = false;
        announce('distribution.previewReady', { count: formatNumber(preview.employeeCount), amount: formatCurrencyFromCents(preview.totalDistributedCents) });
    } catch (error) {
        state.preview = null;
        state.previewStale = false;
        setError(elements.workflowError, error);
    } finally {
        state.calculating = false;
        render();
        refreshDistributionAttendance();
    }
}

function openDialog(dialog, focusTarget) {
    closeOpenControls();
    dialogOrigin = dialog === elements.confirmDialog ? elements.calculateButton : document.activeElement;
    dialog.showModal();
    document.body.classList.add('dialog-open');
    focusTarget.focus();
}

function openConfirmationDialog() {
    if (!currentPreview() || editingLocked()) return;
    elements.confirmReference.textContent = elements.recordReference.textContent;
    elements.confirmPeriod.textContent = formatPeriod(elements.period.value);
    elements.confirmTotal.textContent = formatCurrencyFromCents(state.preview.totalTipsCents);
    elements.confirmEmployees.textContent = formatNumber(state.preview.employeeCount);
    elements.confirmDays.textContent = formatNumber(state.preview.totalWorkedDays);
    elements.confirmError.textContent = '';
    openDialog(elements.confirmDialog, elements.cancelConfirmation);
}

async function confirmDistribution() {
    if (
        !elements.confirmDialog.open ||
        !currentPreview() ||
        editingLocked()
    ) {
        return;
    }

    const draftId = state.draftId;
    state.confirming = true;
    elements.confirmDialog.setAttribute(
        'aria-busy',
        'true'
    );

    [
        elements.confirmDistribution,
        elements.cancelConfirmation,
        elements.closeDialog
    ].forEach(button => {
        button.disabled = true;
    });

    render();

    try {
        if (!repository) {
            throw new Error(
                'The distribution service is unavailable. Reload the application and try again.'
            );
        }

        const record = await repository.confirm(
            draftId,
            state.preview
        );

        const responseError =
            validateConfirmedDistribution(record);

        if (responseError) {
            throw new Error(responseError);
        }

        const confirmed = structuredClone(record);

        // Confirmed rows come exclusively from persisted employee/allocation snapshots.
        const employees = confirmed.payments.map(payment => ({
            ...payment, eligible: true, attendance: []
        }));

        const pool = formatCents(
            confirmed.totalTipsCents
        );

        const timestamp = new Intl.DateTimeFormat(
            i18n.locale(),
            {
                dateStyle: 'medium',
                timeStyle: 'short'
            }
        ).format(new Date(confirmed.createdAt));

        state.confirmed = confirmed;
        invalidateHistory();
        state.distributionEmployees = employees;

        elements.tips.value = pool;
        elements.confirmDialog.close();

        render();

        setMessage(elements.workflowNotice, 'distribution.confirmedNotice', { date: timestamp });

        announce('distribution.saved');
    } catch (error) {
        setError(elements.confirmError, error);
        if (error.code === 'DUPLICATE_DISTRIBUTION') invalidateHistory();
        if (error.code === 'PREVIEW_STALE') {
            state.previewStale = true;
            elements.confirmDialog.close();
            setError(elements.workflowError, error);
        }
    } finally {
        state.confirming = false;

        elements.confirmDialog.removeAttribute(
            'aria-busy'
        );

        [
            elements.confirmDistribution,
            elements.cancelConfirmation,
            elements.closeDialog
        ].forEach(button => {
            button.disabled = false;
        });

        render();
    }
}

function openAttendanceDialog(employeeId, refresh = false) {
    const employee = state.distributionEmployees.find(item => item.id === employeeId);
    if (!employee) return;
    state.attendanceEmployeeId = employeeId;
    elements.attendanceEmployeeName.textContent = employee.name;
    elements.attendanceEmployeeReference.textContent = employee.reference;
    elements.attendanceEmployeeContext.textContent = [
        employee.role,
        window.TipSplitSettings?.locationsEnabled() === false ? '' : getEmployeeLocationLabel(employee)
    ].filter(Boolean).join(' · ');
    elements.attendancePeriodLabel.textContent = formatPeriod(elements.period.value);
    elements.attendanceTotalDays.textContent = formatNumber(employee.daysWorked);
    elements.attendanceTotalHours.textContent = formatHours(employee.workedMinutes);
    elements.attendanceReviewNote.hidden = !state.confirmed;
    elements.attendanceReviewNote.textContent = state.confirmed ? t('attendance.snapshotNote') : '';
    elements.attendanceTableWrapper.hidden = Boolean(state.confirmed);
    elements.attendanceRecords.replaceChildren(...employee.attendance.map(record => {
        const row = document.createElement('tr');
        row.className = record.status === 'day-off' ? 'attendance-row-off' : record.status === 'absence' ? 'attendance-row-absence' : '';
        const date = new Date(record.date + 'T12:00:00Z');
        const dateLabel = new Intl.DateTimeFormat(i18n.locale(), { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' }).format(date);
        const status = t(record.status === 'worked' ? 'attendance.worked' : record.status === 'absence' ? 'attendance.absence' : record.status === 'vacation' ? 'attendance.vacation' : 'attendance.dayOff');
        const duration = record.status === 'worked' ? formatHours(record.workedMinutes) : '—';
        row.append(createCell(dateLabel), createCell(status, 'attendance-status ' + record.status), createCell(record.clockIn || '—', 'time-value'),
            createCell(record.clockOut ? record.clockOut + (record.clockOutNextDay ? t('attendance.nextDay') : '') : '—', 'time-value'), createCell(duration, 'numeric-cell time-value'));
        return row;
    }));
    if (!refresh) {
        openDialog(elements.attendanceDialog, elements.closeAttendanceDialog);
        elements.attendanceTableWrapper.scrollTop = 0;
        elements.attendanceTableWrapper.scrollLeft = 0;
    }
}

function bindDialog(dialog) {
    let backdropPress = false;
    dialog.addEventListener('cancel', event => { if (state.confirming) event.preventDefault(); });
    dialog.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const controls = [...dialog.querySelectorAll('button:not([disabled]), [tabindex="0"]')]
            .filter(control => control.getClientRects().length);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
    const outside = event => {
        const rect = dialog.getBoundingClientRect();
        return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    dialog.addEventListener('pointerdown', event => { backdropPress = event.target === dialog && outside(event); });
    dialog.addEventListener('click', event => {
        if (!state.confirming && backdropPress && event.target === dialog && outside(event)) dialog.close();
        backdropPress = false;
    });
    dialog.addEventListener('close', () => {
        document.body.classList.remove('dialog-open');
        if (dialog === elements.attendanceDialog) {
            restoreEmployeeFocus(state.attendanceEmployeeId, '.employee-details-button');
            state.attendanceEmployeeId = null;
        } else if (state.confirmed) elements.pageTitle.focus({ preventScroll: true });
        else (dialogOrigin?.isConnected ? dialogOrigin : elements.calculateButton).focus({ preventScroll: true });
    });
}

function bindMonthPicker() {
    elements.periodTrigger.addEventListener('click', () => elements.periodMenu.hidden ? openMonthPicker() : closeMonthPicker(true));
    elements.periodTrigger.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openMonthPicker(); }
    });
    elements.monthGrid.addEventListener('keydown', event => {
        const buttons = [...elements.monthGrid.children];
        const current = buttons.indexOf(document.activeElement);
        const offsets = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 };
        if (event.key in offsets || event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            const index = event.key === 'Home' ? 0 : event.key === 'End' ? 11 : (current + offsets[event.key] + 12) % 12;
            buttons[index].focus();
        }
    });
    elements.periodControl.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !elements.periodMenu.hidden) { event.preventDefault(); closeMonthPicker(true); }
    });
    elements.periodControl.addEventListener('focusout', event => {
        if (!elements.periodControl.contains(event.relatedTarget)) closeMonthPicker();
    });
    elements.previousYear.addEventListener('click', () => { state.monthPickerYear--; renderMonthPicker(); });
    elements.nextYear.addEventListener('click', () => { state.monthPickerYear++; renderMonthPicker(); });
    elements.currentMonthButton.addEventListener('click', () => {
        const { year, month } = currentAttendancePeriod();
        selectPeriod(year, month);
    });
    document.addEventListener('pointerdown', event => {
        if (!elements.periodControl.contains(event.target)) closeMonthPicker();
    });
}

function formatHistoryDate(value) {
    if (!value) return '—';

    return new Intl.DateTimeFormat(i18n.locale(), {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(value));
}

function formatAllocationMethod(value) {
    if (value === 'worked_days') return t('common.workedDays');
    return value || '—';
}

function createHistoryRow(distribution) {
    const row = document.createElement('tr');

    const referenceCell = createCell(
        distribution.reference,
        'history-reference'
    );

    const periodCell = createCell(
        formatPeriod(distribution.periodStart),
        'history-period'
    );

    const employeesCell = createCell(
        formatNumber(distribution.employeeCount),
        'numeric-cell'
    );

    const poolCell = createCell(
        formatCurrencyFromCents(distribution.poolCents),
        'numeric-cell history-pool'
    );

    const allocatedCell = createCell(
        formatCurrencyFromCents(
            distribution.allocatedCents
        ),
        'numeric-cell'
    );

    const differenceCell = createCell(
        formatCurrencyFromCents(
            distribution.differenceCents
        ),
        'numeric-cell'
    );

    const confirmedCell = createCell(
        formatHistoryDate(distribution.confirmedAt),
        'history-confirmed'
    );

    const actionCell = document.createElement('td');
    actionCell.className = 'history-open-cell';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-open';
    button.setAttribute(
        'aria-label',
        t('history.open', { reference: distribution.reference })
    );
    button.innerHTML =
        '<i class="icon icon-arrow-right" aria-hidden="true"></i>';

    button.addEventListener('click', () => {
        openHistoryDistribution(distribution.id);
    });

    actionCell.append(button);

    row.append(
        referenceCell,
        periodCell,
        employeesCell,
        poolCell,
        allocatedCell,
        differenceCell,
        confirmedCell,
        actionCell
    );

    return row;
}

function renderHistory() {
    elements.historyRows.replaceChildren();

    if (state.historyLoading) {
        elements.historyFeedback.textContent =
            t('history.loading');
        elements.historyCount.textContent =
            t('history.loadingCount');
        return;
    }

    if (state.historyError) {
        setError(elements.historyFeedback, state.historyError, 'errors.loadHistory');
        elements.historyCount.textContent = t('history.emptyCount');
        return;
    }

    if (!state.history.length) {
        elements.historyFeedback.textContent =
            t('history.empty');
        elements.historyCount.textContent =
            t('history.emptyCount');
        return;
    }

    elements.historyFeedback.textContent = '';

    elements.historyCount.textContent =
        t(state.history.length === 1 ? 'history.countOne' : 'history.countMany', { count: formatNumber(state.history.length) });

    const fragment = document.createDocumentFragment();

    state.history.forEach(distribution => {
        fragment.append(createHistoryRow(distribution));
    });

    elements.historyRows.append(fragment);
}

function invalidateHistory() {
    historyRevision++;
    state.historyLoaded = false;
}

async function loadHistory() {
    if (state.historyLoading) return;
    const revision = historyRevision;

    state.historyLoading = true;
    state.historyError = null;
    renderHistory();

    try {
        const result = await repository.loadHistory();
        if (revision !== historyRevision) return;
        state.history = result.distributions;

        state.historyLoaded = true;
    } catch (error) {
        if (revision !== historyRevision) return;
        state.history = [];
        state.historyError = error;
        setError(elements.historyFeedback, error, 'errors.loadHistory');
    } finally {
        state.historyLoading = false;
        renderHistory();
        if (revision !== historyRevision && !elements.historyView.hidden) loadHistory();
    }
}

function renderHistoryDetail() {
    const distribution = state.historyDetail;

    if (!distribution) return;

    elements.historyDetailHeading.textContent =
        t('common.distributionHeading', { period: formatPeriod(distribution.periodStart) });

    elements.historyDetailReference.textContent =
        distribution.reference;

    elements.historyDetailPool.textContent =
        formatCurrencyFromCents(distribution.poolCents);

    elements.historyDetailPeriod.textContent =
        formatPeriod(distribution.periodStart);

    elements.historyDetailEmployees.textContent =
        formatNumber(distribution.employeeCount);

    elements.historyDetailAllocated.textContent =
        formatCurrencyFromCents(distribution.allocatedCents);

    elements.historyDetailDifference.textContent =
        formatCurrencyFromCents(distribution.differenceCents);

    elements.historyDetailMethod.textContent =
        formatAllocationMethod(distribution.allocationMethod);

    elements.historyDetailSource.textContent =
        distribution.attendanceSource || '—';

    elements.historyDetailRows.replaceChildren();

    const fragment = document.createDocumentFragment();

    distribution.items.forEach(item => {
        const row = document.createElement('tr');

        const employeeCell = document.createElement('td');
        const identity = document.createElement('div');

        identity.className = 'employee-identity';

        const name = document.createElement('strong');
        name.textContent = item.employeeName;

        const reference = document.createElement('span');
        reference.textContent = item.employeeCode;

        identity.append(name, reference);
        employeeCell.append(identity);

        row.append(
            employeeCell,
            createCell(item.role),
            createCell(
                Array.isArray(item.locations) &&
                item.locations.length
                    ? item.locations.join(', ')
                    : '—'
            ),
            createCell(
                formatNumber(item.workedDays),
                'numeric-cell'
            ),
            createCell(
                formatHours(item.workedMinutes),
                'numeric-cell'
            ),
            createCell(
                formatCurrencyFromCents(item.payoutCents),
                'numeric-cell history-pool'
            )
        );

        fragment.append(row);
    });

    elements.historyDetailRows.append(fragment);
}

async function openHistoryDistribution(id) {
    setMessage(elements.historyFeedback, 'history.loadingDetail');

    try {
        const distribution =
            await repository.loadDistribution(id);

        state.historyDetail = distribution;

        renderHistoryDetail();

        elements.historyPageHeader.hidden = true;
        elements.historyList.hidden = true;
        elements.historySummaryLine.hidden = true;
        elements.historyDetail.hidden = false;
        elements.historyFeedback.textContent = '';

        elements.historyDetailHeading.focus({
            preventScroll: true
        });

        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    } catch (error) {
        setError(elements.historyFeedback, error, 'errors.loadDistribution');
    }
}

function closeHistoryDistribution() {
    state.historyDetail = null;

    elements.historyDetail.hidden = true;
    elements.historyList.hidden = false;
    elements.historyPageHeader.hidden = false;
    elements.historySummaryLine.hidden = false;

    elements.historyHeading.focus({
        preventScroll: true
    });
}

function getFilteredEmployees() {
    const search = elements.employeesSearch.value
        .trim()
        .toLowerCase();

    const locationId = employeesLocationValue;
    const status = employeesStatusValue;

    return state.employeeDirectory.filter(employee => {
        const locations =
            getEmployeeLocationNames(employee);

        const matchesSearch =
            !search ||
            employee.name
                .toLowerCase()
                .includes(search) ||
            employee.employeeCode
                .toLowerCase()
                .includes(search) ||
            employee.role
                .toLowerCase()
                .includes(search) ||
            (window.TipSplitSettings?.locationsEnabled() !== false && locations.some(location =>
                location
                    .toLowerCase()
                    .includes(search)
            ));

        const matchesLocation =
            locationId === 'all' ||
            (employee.locations || []).some(
                location =>
                    String(location.id) === locationId
            );

        const matchesStatus =
            status === 'all' ||
            (
                status === 'active' &&
                employee.active
            ) ||
            (
                status === 'inactive' &&
                !employee.active
            );

        return (
            matchesSearch &&
            matchesLocation &&
            matchesStatus
        );
    });
}

function populateEmployeeLocationFilter() {
    const options = [
        {
            value: 'all',
            label: t('common.allLocations')
        },
        ...state.locations.map(location => ({
            value: String(location.id),
            label: location.name
        }))
    ];

    employeesLocationSelect.update(
        options,
        employeesLocationValue
    );
}

function populateEmployeeStatusFilter() {
    employeesStatusSelect.update(
        [
            {
                value: 'all',
                label: t('common.allEmployees')
            },
            {
                value: 'active',
                label: t('common.active')
            },
            {
                value: 'inactive',
                label: t('common.inactive')
            }
        ],
        employeesStatusValue
    );
}

function createEmployeeManagementRow(employee) {
    const row = document.createElement('tr');

    const codeCell = document.createElement('td');
    codeCell.textContent = employee.employeeCode;

    const employeeCell = document.createElement('td');

    const name = document.createElement('strong');
    name.textContent = employee.name;

    employeeCell.append(name);

    const roleCell = document.createElement('td');
    roleCell.textContent = employee.role;

    const locationsCell = document.createElement('td');
    locationsCell.textContent =
        getEmployeeLocationLabel(employee);

    const emailCell = document.createElement('td');
    emailCell.textContent =
        employee.email || '—';

    const statusCell = document.createElement('td');
    statusCell.textContent =
        employee.active
            ? t('common.active')
            : t('common.inactive');

    const actionCell = document.createElement('td');

    const editButton =
        document.createElement('button');

    editButton.type = 'button';
    editButton.className =
        'employee-edit-button';

    editButton.dataset.employeeId =
        String(employee.id);

    editButton.textContent = t('common.edit');

    actionCell.append(editButton);

    row.append(
        codeCell,
        employeeCell,
        roleCell,
        locationsCell,
        emailCell,
        statusCell,
        actionCell
    );

    return row;
}

function renderEmployees() {
    elements.employeesRows.replaceChildren();

    if (state.employeesLoading) {
        elements.employeesCount.textContent =
            t('employees.loading');

        return;
    }

    if (!state.employeesLoaded) {
        elements.employeesCount.textContent = '';
        return;
    }

    const employees = getFilteredEmployees();

    elements.employeesCount.textContent =
        t('common.employeeCount', { count: formatNumber(state.employeeDirectory.length) });

    if (employees.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');

        cell.colSpan = window.TipSplitSettings?.locationsEnabled() === false ? 6 : 7;
        cell.textContent = t('employees.noMatches');

        row.append(cell);
        elements.employeesRows.append(row);

        return;
    }

    employees.forEach(employee => {
        elements.employeesRows.append(
            createEmployeeManagementRow(employee)
        );
    });
}

async function loadEmployees() {
    if (state.employeesLoading) {
        return;
    }

    state.employeesLoading = true;
    elements.employeesFeedback.textContent = '';

    renderEmployees();

    try {
        const [employees] = await Promise.all([
            repository.loadEmployees(),
            state.locationsLoaded
                ? Promise.resolve(state.locations)
                : loadLocations()
        ]);

        state.employeeDirectory = syncCurrentLocationNames(employees);

        state.employeesLoaded = true;
        state.locationsLoaded = true;

        populateEmployeeLocationFilter();
        populateEmployeeStatusFilter();
    } catch (error) {
        state.employeeDirectory = [];

        setError(elements.employeesFeedback, error, 'errors.loadEmployees');
    } finally {
        state.employeesLoading = false;
        renderEmployees();
    }
}

function populateEmployeeFormLocations(employee = state.employeeDirectory.find(item => item.id === state.editingEmployeeId)) {
    elements.employeeFormLocations.replaceChildren();
    const assigned = new Set((employee?.locations || []).map(location => Number(location.id)));

    state.locations
        .filter(location => location.active !== false || assigned.has(Number(location.id)))
        .sort((a, b) =>
            a.name.localeCompare(b.name)
        )
        .forEach(location => {
            const label =
                document.createElement('label');

            label.className =
                'employee-location-option';

            const checkbox =
                document.createElement('input');

            checkbox.type = 'checkbox';
            checkbox.name = 'employee-location';
            checkbox.value = String(location.id);
            checkbox.disabled = location.active === false;

            const text =
                document.createElement('span');

            text.textContent = location.active === false
                ? t('employees.inactiveLocation', { name: location.name })
                : location.name;

            label.append(
                checkbox,
                text
            );

            elements.employeeFormLocations.append(
                label
            );
        });
}

async function openEmployeeForm(employee = null) {
    if (state.savingEmployee || state.openingEmployee || elements.employeeDialog.open) return;
    state.openingEmployee = true;
    employeeDialogOrigin = document.activeElement;
    state.editingEmployeeId =
        employee?.id ?? null;

    if (!state.locationsLoaded) {
        try {
            state.locations =
                await loadLocations();

            state.locationsLoaded = true;

            populateEmployeeLocationFilter();
        } catch (error) {
            setError(elements.employeesFeedback, error, 'errors.loadLocations');
            state.openingEmployee = false;
            return;
        }
    }

    populateEmployeeFormLocations(employee);

    elements.employeeDialogTitle.textContent =
        employee
            ? t('employees.edit')
            : t('employees.add');

    elements.saveEmployee.textContent =
        employee
            ? t('common.saveChanges')
            : t('employees.add');

    elements.employeeFormCode.value =
        employee?.employeeCode ?? '';

    elements.employeeFormName.value =
        employee?.name ?? '';

    elements.employeeFormEmail.value =
        employee?.email ?? '';

    elements.employeeFormRole.value =
        employee?.role ?? '';

    const selectedLocationIds = new Set(
        (employee?.locations || []).map(
            location => String(location.id)
        )
    );

    elements.employeeFormLocations
        .querySelectorAll(
            'input[name="employee-location"]'
        )
        .forEach(input => {
            input.checked =
                selectedLocationIds.has(
                    input.value
                );
        });

    elements.employeeFormActive.checked =
        employee?.active ?? true;

    elements.employeeFormError.textContent = '';
    renderEmployeeSavingState();

    elements.employeeDialog.showModal();
    state.openingEmployee = false;
    elements.employeeFormCode.focus();
}

function renderEmployeeSavingState() {
    const busy = state.savingEmployee;
    elements.employeeDialogTitle.textContent = t(state.editingEmployeeId === null
        ? 'employees.add' : 'employees.edit');
    [elements.employeeFormCode, elements.employeeFormName, elements.employeeFormEmail,
        elements.employeeFormRole, elements.employeeFormActive, elements.saveEmployee,
        elements.cancelEmployeeForm, elements.closeEmployeeDialog].forEach(control => {
        control.disabled = busy;
    });
    elements.employeeFormLocations.closest('fieldset').disabled = busy;
    elements.employeeForm.setAttribute('aria-busy', String(busy));
    elements.employeeDialog.setAttribute('aria-busy', String(busy));
    elements.saveEmployee.textContent = t(busy ? 'common.saving'
        : state.editingEmployeeId === null ? 'employees.add' : 'common.saveChanges');
}

function refreshDistributionAttendance() {
    if (!state.attendanceRefreshNeeded || state.confirmed || state.calculating || state.confirming) return;
    const { year, month } = parseAttendancePeriod(elements.period.value);
    selectPeriod(year, month, true);
}

function closeEmployeeForm() {
    if (state.savingEmployee) {
        return;
    }

    elements.employeeDialog.close();
    elements.employeeForm.reset();
    state.editingEmployeeId = null;
}

async function saveEmployee(event) {
    event.preventDefault();

    if (state.savingEmployee) {
        return;
    }

    for (const [input, field] of [
        [elements.employeeFormCode, 'fields.employeeCode'],
        [elements.employeeFormName, 'fields.name'],
        [elements.employeeFormRole, 'fields.role']
    ]) {
        if (!input.value.trim()) {
            setMessage(elements.employeeFormError, 'employees.requiredField', { field: t(field), fieldKey: field });
            input.focus();
            return;
        }
    }
    if (elements.employeeFormEmail.validity.typeMismatch) {
        setMessage(elements.employeeFormError, 'employees.invalidEmail');
        elements.employeeFormEmail.focus();
        return;
    }

    const locationIds = [
        ...elements.employeeFormLocations
            .querySelectorAll(
                'input[name="employee-location"]:checked'
            )
    ].map(input => Number(input.value));

    const employee = {
        employeeCode:
            elements.employeeFormCode.value.trim(),

        name:
            elements.employeeFormName.value.trim(),

        email:
            elements.employeeFormEmail.value.trim() ||
            null,

        role:
            elements.employeeFormRole.value.trim(),

        active:
            elements.employeeFormActive.checked
    };

    if (window.TipSplitSettings?.locationsEnabled() !== false) {
        const original = state.employeeDirectory.find(item => item.id === state.editingEmployeeId);
        const inactiveIds = (original?.locations || []).filter(location =>
            state.locations.find(item => Number(item.id) === Number(location.id))?.active === false
        ).map(location => Number(location.id));
        employee.locationIds = [...new Set([...locationIds, ...inactiveIds])];
    }

    state.savingEmployee = true;
    renderEmployeeSavingState();
    elements.employeeFormError.textContent = '';

    try {
        let savedEmployee;

        if (state.editingEmployeeId === null) {
            savedEmployee =
                await repository.createEmployee(employee);

            state.employeeDirectory.push(savedEmployee);
        } else {
            savedEmployee =
                await repository.updateEmployee(
                    state.editingEmployeeId,
                    employee
                );

            const index = state.employeeDirectory.findIndex(
                item => item.id === state.editingEmployeeId
            );

            if (index !== -1) {
                state.employeeDirectory[index] = savedEmployee;
            }
        }

        populateEmployeeLocationFilter();
        renderEmployees();
        if (!state.confirmed) {
            state.attendanceRefreshNeeded = true;
            invalidatePreview();
            refreshDistributionAttendance();
        }

        elements.employeeDialog.close();
        elements.employeeForm.reset();
        state.editingEmployeeId = null;
    } catch (error) {
        setError(elements.employeeFormError, error, 'errors.saveEmployee');
    } finally {
        state.savingEmployee = false;
        renderEmployeeSavingState();
        if (elements.employeeDialog.open) elements.saveEmployee.focus();
    }
}

async function loadLocations() {
    if (state.locationsLoaded) {
        return state.locations;
    }

    if (!locationsRequest) {
        locationsRequest = repository.loadLocations()
            .then(locations => {
                state.locations = locations;
                state.locationsLoaded = true;
                return locations;
            })
            .finally(() => {
                locationsRequest = null;
            });
    }

    return locationsRequest;
}

function showView(view, focus = false) {
    if (!['distribution', 'employees', 'history', 'settings'].includes(view)) {
        view = 'distribution';
    }

    closeOpenControls();

    elements.distributionView.hidden =
        view !== 'distribution';

    elements.employeesView.hidden =
        view !== 'employees';

    elements.historyView.hidden =
        view !== 'history';

    elements.settingsView.hidden =
        view !== 'settings';

    if (view !== 'history') {
        state.historyDetail = null;
        elements.historyDetail.hidden = true;
        elements.historyList.hidden = false;
        elements.historyPageHeader.hidden = false;
        elements.historySummaryLine.hidden = false;
    }

    document
        .querySelectorAll('.main-navigation a')
        .forEach(link => {
            const active =
                link.dataset.view === view;

            link.classList.toggle(
                'active',
                active
            );

            if (active) {
                link.setAttribute(
                    'aria-current',
                    'page'
                );
            } else {
                link.removeAttribute(
                    'aria-current'
                );
            }
        });

    document.title = 'Tip Split — ' + t('nav.' + view);

    if (
        view === 'history' &&
        !state.historyLoaded
    ) {
        loadHistory();
    }

    if (
        view === 'employees' &&
        !state.employeesLoaded
    ) {
        loadEmployees();
    }

    if (focus) {
        const targets = {
            distribution:
                elements.pageTitle,

            employees:
                elements.employeesHeading,

            history:
                elements.historyHeading,

            settings:
                elements.settingsHeading
        };

        targets[view]?.focus();
    }

    if (view === 'settings') {
        window.TipSplitSettings?.loadLocations();
    }
}

function bindEvents() {
    bindFilters();
    bindMonthPicker();
    bindDialog(elements.confirmDialog);
    bindDialog(elements.attendanceDialog);
    elements.employeeDialog.addEventListener('cancel', event => {
        event.preventDefault();
        closeEmployeeForm();
    });
    elements.employeeDialog.addEventListener('close', () => {
        if (elements.employeeDialog.open) return;
        const originId = employeeDialogOrigin?.dataset.employeeId;
        const replacement = [...elements.employeesRows.querySelectorAll('.employee-edit-button')]
            .find(button => button.dataset.employeeId === originId);
        elements.employeeForm.reset();
        state.editingEmployeeId = null;
        (employeeDialogOrigin?.isConnected ? employeeDialogOrigin : replacement || elements.addEmployee).focus();
    });
    document.querySelector('.skip-link').addEventListener('click', event => {
        event.preventDefault();
        document.getElementById('main-content').focus();
    });
    window.addEventListener('hashchange', () => showView(location.hash.slice(1), true));
    elements.historyBack.addEventListener('click', closeHistoryDistribution);
    elements.employeeSearch.addEventListener('input', () => { state.search = elements.employeeSearch.value; render(); announce('employees.visibleAnnouncement', { count: formatNumber(getVisibleEmployees().length) }); });
    elements.tips.addEventListener('input', () => {
        if (editingLocked()) return;
        elements.tipsError.textContent = '';
        elements.tips.removeAttribute('aria-invalid');
        invalidatePreview();
        render();
    });
    elements.attendanceRetry.addEventListener('click', () => {
        const { year, month } = parseAttendancePeriod(elements.period.value);
        selectPeriod(year, month, true);
    });
    elements.calculateButton.addEventListener('click', () => currentPreview() ? openConfirmationDialog() : calculateDistribution());
    elements.closeDialog.addEventListener('click', () => { if (!state.confirming) elements.confirmDialog.close(); });
    elements.cancelConfirmation.addEventListener('click', () => { if (!state.confirming) elements.confirmDialog.close(); });
    elements.confirmDistribution.addEventListener('click', confirmDistribution);
    elements.closeAttendanceDialog.addEventListener('click', () => elements.attendanceDialog.close());
    elements.attendanceDialogDone.addEventListener('click', () => elements.attendanceDialog.close());
    elements.employeesSearch.addEventListener(
        'input',
        renderEmployees
    );

    elements.addEmployee.addEventListener(
        'click',
        () => openEmployeeForm()
    );

    elements.employeesRows.addEventListener(
        'click',
        event => {
            const button = event.target.closest(
                '.employee-edit-button'
            );

            if (!button) {
                return;
            }

            const employeeId = Number(
                button.dataset.employeeId
            );

            const employee = state.employeeDirectory.find(
                item => item.id === employeeId
            );

            if (employee) {
                openEmployeeForm(employee);
            }
        }
    );

    elements.closeEmployeeDialog.addEventListener(
        'click',
        closeEmployeeForm
    );

    elements.cancelEmployeeForm.addEventListener(
        'click',
        closeEmployeeForm
    );

    elements.employeeForm.addEventListener(
        'submit',
        saveEmployee
    );
}

async function initialize() {
    try { repository = createDistributionRepository(); }
    catch (error) { setError(elements.storageNotice, error); elements.storageNotice.hidden = false; }
    const { year, month } = currentAttendancePeriod();
    elements.period.value = String(year) + '-' + String(month).padStart(2, '0');
    state.monthPickerYear = year;
    state.draftId = createStableId();
    bindEvents();
    render(); showView(location.hash.slice(1));
    await selectPeriod(year, month, true);
}

window.addEventListener('tipsplit:languagechange', () => {
    const activeMessages = [...localizedMessages].filter(([node, message]) => node.textContent === message.last);
    updateMonthNames();
    render();
    renderHistory();
    renderHistoryDetail();
    renderEmployees();
    populateEmployeeLocationFilter();
    populateEmployeeStatusFilter();
    renderEmployeeSavingState();
    renderMonthPicker();
    if (elements.attendanceDialog.open) openAttendanceDialog(state.attendanceEmployeeId, true);
    if (elements.confirmDialog.open && state.preview) {
        elements.confirmPeriod.textContent = formatPeriod(elements.period.value);
        elements.confirmTotal.textContent = formatCurrencyFromCents(state.preview.totalTipsCents);
        elements.confirmEmployees.textContent = formatNumber(state.preview.employeeCount);
        elements.confirmDays.textContent = formatNumber(state.preview.totalWorkedDays);
    }
    if (elements.employeeDialog.open) {
        const selected = new Set([...elements.employeeFormLocations.querySelectorAll('input:checked')].map(input => input.value));
        populateEmployeeFormLocations();
        elements.employeeFormLocations.querySelectorAll('input').forEach(input => { input.checked = selected.has(input.value); });
        elements.employeeDialogTitle.textContent = t(state.editingEmployeeId === null ? 'employees.add' : 'employees.edit');
        elements.saveEmployee.textContent = t(state.editingEmployeeId === null ? 'employees.add' : 'common.saveChanges');
    }
    activeMessages.forEach(([node, message]) => {
        if (message.error) setError(node, message.error, message.fallbackKey);
        else {
            if (message.params.fieldKey) message.params.field = t(message.params.fieldKey);
            if (message.key === 'distribution.previewReady' && state.preview) message.params.amount = formatCurrencyFromCents(state.preview.totalDistributedCents);
            if (message.key === 'distribution.confirmedNotice' && state.confirmed) {
                message.params.date = new Intl.DateTimeFormat(i18n.locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(state.confirmed.createdAt));
            }
            setMessage(node, message.key, message.params);
        }
    });
    const view = ['employees', 'history', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'distribution';
    document.title = 'Tip Split — ' + t('nav.' + view);
});

i18n.translate();
initialize();
