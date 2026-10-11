const state = {
    employees: [], search: '', outlet: 'all', status: 'all', preview: null,
    previewStale: false, confirmed: null, monthPickerYear: 2026,
    attendanceEmployeeId: null, draftId: null, confirming: false, loadingAttendance: false,
    history: [], historyLoaded: false, historyLoading: false,
    historyDetail: null
};

const elementIds = {
    distributionView: 'distribution-view',
    placeholderView: 'placeholder-view',
    placeholderTitle: 'placeholder-title',
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
    tips: 'tips', tipsError: 'tips-error',
    employeeRows: 'employee-rows',
    employeeSearch: 'employee-search',
    outletFilter: 'outlet-filter',
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
    includeVisibleButton: 'include-visible-button',
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
    reviewAttendance: 'review-attendance',
    pageTitle: 'distribution-heading',
    attendanceCoverage: 'attendance-coverage',
    attendanceSource: 'attendance-source',
    attendanceAttentionCount: 'attendance-attention-count',
    attendanceDetailsButton: 'attendance-details-button',
    tableNoteEmployees: 'table-note-employees',
    tableNoteDays: 'table-note-days',
    workflowError: 'workflow-error',
    workflowNotice: 'workflow-notice',
    workspaceStatus: 'workspace-status',
    storageNotice: 'storage-notice',
    historyView: 'history-view',
    historyHeading: 'history-heading',
    historyCount: 'history-count',
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
    historyDetailRows: 'history-detail-rows'
};
const elements = Object.fromEntries(Object.entries(elementIds).map(([name, id]) => [name, document.getElementById(id)]));
elements.recordReference = document.querySelector('.record-reference');
elements.recordStatus = document.querySelector('.record-status');
elements.attendanceException = document.querySelector('.attendance-exception');
elements.attendanceTableWrapper = document.querySelector('.attendance-table-wrapper');
const monthNames = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat('en-IE', { month: 'long' }).format(new Date(2026, month, 1)));
let repository = null;
let dialogOrigin = null;
let attendanceRequest = 0;
const filterControls = [];

function closeOpenControls() {
    closeMonthPicker();
    filterControls.forEach(control => control.close());
}

function bindFilters() {
    for (const name of ['outlet', 'status']) {
        const control = createCustomSelect({
            trigger: elements[name + 'Filter'],
            label: document.getElementById(name + '-trigger-label'),
            menu: document.getElementById(name + '-menu'),
            onOpen: closeOpenControls,
            onChange: value => { state[name] = value; render(); announce(getVisibleEmployees().length + ' employees visible. Distribution population unchanged.'); }
        });
        filterControls.push(control);
    }
}

function formatNumber(value) {
    return new Intl.NumberFormat('en-IE').format(value);
}

function formatCurrencyFromCents(cents) {
    return '€' + formatCents(cents);
}

function formatHours(minutes) {
    return new Intl.NumberFormat('en-IE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(minutes / 60);
}

function formatPeriod(period) {
    const normalizedPeriod = /^\d{4}-\d{2}-\d{2}$/.test(period)
        ? period.slice(0, 7)
        : period;

    const { year, month } = parseAttendancePeriod(normalizedPeriod);

    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, 1);

    return new Intl.DateTimeFormat('en-IE', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC'
    }).format(date);
}

function getTipsCents() {
    return parseMoneyToCents(elements.tips.value);
}

function getVisibleEmployees() {
    return filterEmployees(state.employees, state);
}

function getIncludedEmployees() {
    return state.employees.filter(employee => employee.included);
}

function getAttentionEmployees() {
    return state.employees.filter(employee => employee.attention);
}

function currentPreview() {
    return state.confirmed || (state.previewStale ? null : state.preview);
}

function editingLocked() {
    return Boolean(state.confirmed) || state.confirming || state.loadingAttendance;
}

function announce(message) {
    elements.workspaceStatus.textContent = message;
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
    row.classList.toggle('attention-row', employee.attention);
    row.classList.toggle('excluded-row', !employee.included);
    const includeCell = document.createElement('td');
    includeCell.className = 'include-cell';
    const includeLabel = document.createElement('label');
    includeLabel.className = 'include-target';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.employeeId = employee.id;
    checkbox.checked = employee.included;
    checkbox.disabled = editingLocked() || employee.attention || employee.daysWorked === 0;
    checkbox.setAttribute('aria-label', 'Include ' + employee.name);
    checkbox.setAttribute('aria-describedby', 'employee-meta-' + employee.id);
    checkbox.addEventListener('change', () => {
        if (editingLocked()) return;
        employee.included = checkbox.checked;
        invalidatePreview();
        render();
        restoreEmployeeFocus(employee.id, 'input');
        announce((employee.included ? 'Included ' : 'Excluded ') + employee.name + '. ' + getIncludedEmployees().length + ' employees included.');
    });
    includeLabel.appendChild(checkbox);
    includeCell.appendChild(includeLabel);
    const identity = document.createElement('td');
    const wrapper = document.createElement('div');
    wrapper.className = 'employee-identity';
    const details = document.createElement('button');
    details.type = 'button';
    details.className = 'employee-details-button';
    details.textContent = employee.name;
    details.title = employee.name;
    details.setAttribute('aria-label', 'View attendance for ' + employee.name);
    details.addEventListener('click', () => openAttendanceDialog(employee.id));
    const meta = document.createElement('span');
    meta.id = 'employee-meta-' + employee.id;
    const status = employee.attentionReason || (employee.included ? employee.role : 'Excluded');
    meta.textContent = [employee.reference, status].filter(Boolean).join(' · ');
    meta.classList.toggle('employee-attention', employee.attention);
    wrapper.append(details, meta);
    identity.appendChild(wrapper);
    const payment = currentPreview()?.payments.find(item => item.id === employee.id);
    row.append(includeCell, identity, createCell(employee.outlet), createCell(formatNumber(employee.daysWorked), 'numeric-cell'),
        createCell(formatHours(employee.workedMinutes), 'numeric-cell'),
        createCell(payment ? formatCurrencyFromCents(payment.amountCents) : '—', 'numeric-cell payout-cell'));
    return row;
}

function clearFilters() {
    state.search = '';
    state.outlet = 'all';
    state.status = 'all';
    elements.employeeSearch.value = '';
    render();
    elements.employeeSearch.focus();
    announce('Filters cleared. ' + state.employees.length + ' employees visible.');
}

function renderEmployees(visible, summary) {
    const fragment = document.createDocumentFragment();
    visible.forEach(employee => fragment.appendChild(createEmployeeRow(employee)));
    if (!visible.length) {
        const row = document.createElement('tr');
        const cell = createCell(state.employees.length ? 'No employees match these filters. ' : 'No employees available for this period. ', 'empty-state');
        cell.colSpan = 6;
        if (state.employees.length) {
            const reset = document.createElement('button');
            reset.type = 'button';
            reset.id = 'clear-filters';
            reset.className = 'text-action';
            reset.textContent = 'Clear filters';
            reset.addEventListener('click', clearFilters);
            cell.appendChild(reset);
        }
        row.appendChild(cell);
        fragment.appendChild(row);
    }
    elements.employeeRows.replaceChildren(fragment);
    elements.visibleCount.textContent = formatNumber(visible.length) + ' visible of ' + formatNumber(state.employees.length) + ' · visible totals';
    elements.footerDays.textContent = formatNumber(summary.visibleDays);
    elements.footerHours.textContent = formatHours(summary.visibleMinutes);
    elements.footerPayout.textContent = currentPreview() ? formatCurrencyFromCents(summary.visiblePayoutCents) : '—';
    const eligible = visible.filter(employee => !employee.included && !employee.attention && employee.daysWorked > 0);
    elements.includeVisibleButton.disabled = !eligible.length || editingLocked();
    elements.includeVisibleButton.textContent = eligible.length ? 'Include ' + eligible.length + ' eligible visible' : 'No visible employees to include';
}

function renderFilters() {
    const outlets = [...new Set(state.employees.map(employee => employee.outlet))];
    filterControls[0].update([{ value: 'all', label: 'All outlets' }, ...outlets.map(outlet => ({ value: outlet, label: outlet }))], state.outlet);
    const options = [['all', 'All employees', state.employees.length], ['included', 'Included', getIncludedEmployees().length],
        ['excluded', 'Excluded', state.employees.length - getIncludedEmployees().length], ['attention', 'Needs attention', getAttentionEmployees().length]];
    filterControls[1].update(options.map(([value, label, count]) => ({ value, label, count })), state.status);
}

function renderMonthPicker() {
    const { year, month } = parseAttendancePeriod(elements.period.value);
    elements.monthPickerYear.textContent = state.monthPickerYear;
    elements.previousYear.disabled = state.monthPickerYear <= 1;
    elements.nextYear.disabled = state.monthPickerYear >= 9999;
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

async function selectPeriod(year, month) {
    if (state.confirming) return;
    const period = String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0');
    parseAttendancePeriod(period);
    const request = ++attendanceRequest;
    closeMonthPicker(true);
    if (period !== elements.period.value || state.loadingAttendance) {
        let employees;
        state.loadingAttendance = true;
        render();
        try { employees = await (repository ? repository.loadAttendance(period) : createDemoAttendance(defaultEmployees, period)); }
        catch (error) {
            if (request !== attendanceRequest) return;
            state.loadingAttendance = false;
            elements.workflowError.textContent = error.message;
            render();
            return;
        }
        if (request !== attendanceRequest) return;
        state.loadingAttendance = false;
        elements.period.value = period;
        state.employees = employees;
        state.preview = null;
        state.previewStale = false;
        state.confirmed = null;
        state.draftId = createStableId();
        state.search = '';
        state.outlet = 'all';
        state.status = 'all';
        elements.employeeSearch.value = '';
        elements.workflowError.textContent = '';
        elements.workflowNotice.textContent = '';
        render();
       announce(formatPeriod(period) +' selected. Attendance loaded from the server.');
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
    elements.calculateButton.replaceChildren(document.createTextNode(state.confirmed ? 'Confirmed' : preview ? 'Confirm distribution' : state.previewStale ? 'Recalculate payouts' : 'Calculate payouts'));
    const icon = document.createElement('i');
    icon.className = 'icon ' + (state.confirmed ? 'icon-check' : state.previewStale ? 'icon-refresh-cw' : 'icon-arrow-right');
    icon.setAttribute('aria-hidden', 'true');
    elements.calculateButton.appendChild(icon);
    elements.calculateButton.disabled = editingLocked();
}

function render() {
    const visible = getVisibleEmployees();
    const summary = summarizeWorkspace(state.employees, visible, currentPreview());
    if (state.confirmed) {
        summary.includedCount = state.confirmed.employeeCount;
        summary.includedDays = state.confirmed.totalWorkedDays;
    }
    const { year, month, days } = parseAttendancePeriod(elements.period.value);
    elements.pageTitle.textContent = monthNames[month - 1] + ' distribution';
    elements.periodTriggerLabel.textContent = formatPeriod(elements.period.value);
    elements.recordReference.textContent = state.confirmed?.reference || 'TS-DEMO-' + elements.period.value;
    elements.recordStatus.textContent = state.confirmed ? 'Confirmed' : currentPreview() ? 'Review' : 'Draft';
    elements.attendanceCoverage.textContent = 'Attendance 01–' + days + ' ' + monthNames[month - 1].slice(0, 3) + ' ' + year;
    elements.attendanceSource.textContent = 'Demo HR attendance · PostgreSQL';
    const attention = getAttentionEmployees().length;
    elements.attendanceException.hidden = attention === 0;
    elements.attendanceAttentionCount.textContent = attention + (attention === 1 ? ' record needs review' : ' records need review');
    elements.includedCount.textContent = summary.includedCount + ' / ' + summary.employeeCount + ' included';
    elements.actionEmployees.textContent = formatNumber(summary.includedCount) + ' employees';
    elements.actionDays.textContent = formatNumber(summary.includedDays);
    elements.tableNoteEmployees.textContent = formatNumber(summary.includedCount) + ' employees included across all outlets';
    elements.tableNoteDays.textContent = formatNumber(summary.includedDays) + ' eligible worked days';
    elements.tips.readOnly = editingLocked();
    elements.periodTrigger.disabled = state.confirming;
    renderFilters();
    renderEmployees(visible, summary);
    updateReconciliation();
}

function calculateDistribution() {
    if (editingLocked()) return;
    elements.workflowError.textContent = '';
    const tips = getTipsCents();
    if (tips === null) {
        elements.tipsError.textContent = 'Enter a non-negative euro amount with up to two decimal places.';
        elements.tips.setAttribute('aria-invalid', 'true');
        elements.tips.focus();
        return;
    }
    elements.tipsError.textContent = '';
    elements.tips.removeAttribute('aria-invalid');
    const participants = getIncludedEmployees().map(({ id, name, outlet, daysWorked }) => ({ id, name, outlet, daysWorked }));
    const error = validateParticipants(participants);
    if (error) {
        elements.workflowError.textContent = error;
        elements.includeVisibleButton.disabled ? elements.statusFilter.focus() : elements.includeVisibleButton.focus();
        return;
    }
    state.preview = distributeTips(tips, participants);
    state.previewStale = false;
    render();
    announce('Preview ready. ' + state.preview.employeeCount + ' employees. Allocated ' + formatCurrencyFromCents(state.preview.totalDistributedCents) + '. Difference zero.');
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
    const [periodYear, periodMonth] = elements.period.value
        .split('-')
        .map(Number);

    const reference =
        'TS-DEMO-' +
        elements.period.value +
        '-' +
        draftId.slice(0, 8).toUpperCase();

    const snapshot = buildDistributionSnapshot(
        state.preview,
        state.employees,
        periodYear,
        periodMonth,
        reference
    );

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
            snapshot
        );

        const responseError =
            validateConfirmedDistribution(record);

        if (responseError) {
            throw new Error(responseError);
        }

        const confirmed = structuredClone(record);

        const evidence = new Map(
            (confirmed.attendanceSnapshot || []).map(
                employee => [employee.id, employee]
            )
        );

        const payments = new Map(
            confirmed.payments.map(
                payment => [payment.id, payment]
            )
        );

        const employees = state.employees.map(employee => ({
            ...employee,
            ...evidence.get(employee.id),
            included: payments.has(employee.id),
            ...(payments.has(employee.id)
                ? {
                    daysWorked:
                        payments.get(employee.id).daysWorked
                }
                : {})
        }));

        const pool = formatCents(
            confirmed.totalTipsCents
        );

        const timestamp = new Intl.DateTimeFormat(
            'en-IE',
            {
                dateStyle: 'medium',
                timeStyle: 'short'
            }
        ).format(new Date(confirmed.createdAt));

        state.confirmed = confirmed;
        state.employees = employees;

        elements.tips.value = pool;
        elements.confirmDialog.close();

        render();

        elements.workflowNotice.textContent =
            'Confirmed ' +
            timestamp +
            '. Distribution saved successfully. Select another period to prepare a new distribution.';

        announce(
            'Distribution confirmed and saved.'
        );
    } catch (error) {
        elements.confirmError.textContent =
            error.message;
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

function openAttendanceDialog(employeeId) {
    const employee = state.employees.find(item => item.id === employeeId);
    if (!employee) return;
    state.attendanceEmployeeId = employeeId;
    elements.attendanceEmployeeName.textContent = employee.name;
    elements.attendanceEmployeeReference.textContent = employee.reference;
    elements.attendanceEmployeeContext.textContent = [employee.role, employee.outlet].filter(Boolean).join(' · ');
    elements.attendancePeriodLabel.textContent = formatPeriod(elements.period.value);
    elements.attendanceTotalDays.textContent = formatNumber(employee.daysWorked);
    elements.attendanceTotalHours.textContent = formatHours(employee.workedMinutes);
    elements.attendanceReviewNote.hidden = !employee.attention;
    elements.attendanceReviewNote.textContent = employee.attentionReason + '. Review the demo attendance before including this employee.';
    elements.reviewAttendance.hidden = !employee.attention || employee.daysWorked === 0 || editingLocked();
    elements.attendanceRecords.replaceChildren(...employee.attendance.map(record => {
        const row = document.createElement('tr');
        row.className = record.status === 'day-off' ? 'attendance-row-off' : record.status === 'absence' ? 'attendance-row-absence' : '';
        const date = new Date(record.date + 'T12:00:00Z');
        const dateLabel = new Intl.DateTimeFormat('en-IE', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' }).format(date);
        const status = record.status === 'worked' ? 'Worked' : record.status === 'absence' ? 'Absence' : 'Day off';
        const duration = record.status === 'worked' ? Math.floor(record.workedMinutes / 60) + 'h ' + String(record.workedMinutes % 60).padStart(2, '0') + 'm' : '—';
        row.append(createCell(dateLabel), createCell(status, 'attendance-status ' + record.status), createCell(record.clockIn || '—', 'time-value'),
            createCell(record.clockOut ? record.clockOut + (record.clockOutNextDay ? ' +1 day' : '') : '—', 'time-value'), createCell(duration, 'numeric-cell time-value'));
        return row;
    }));
    openDialog(elements.attendanceDialog, elements.closeAttendanceDialog);
    elements.attendanceTableWrapper.scrollTop = 0;
    elements.attendanceTableWrapper.scrollLeft = 0;
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
        const date = new Date();
        selectPeriod(date.getFullYear(), date.getMonth() + 1);
    });
    document.addEventListener('pointerdown', event => {
        if (!elements.periodControl.contains(event.target)) closeMonthPicker();
    });
}

function formatHistoryDate(value) {
    if (!value) return '—';

    return new Intl.DateTimeFormat('en-IE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(value));
}

function formatAllocationMethod(value) {
    if (value === 'worked_days') return 'Worked days';
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
        'Open distribution ' + distribution.reference
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
        confirmedCell,
        actionCell
    );

    return row;
}

function renderHistory() {
    elements.historyRows.replaceChildren();

    if (state.historyLoading) {
        elements.historyFeedback.textContent =
            'Loading distribution history…';
        elements.historyCount.textContent =
            'Loading confirmed distributions';
        return;
    }

    if (!state.history.length) {
        elements.historyFeedback.textContent =
            'No confirmed distributions found.';
        elements.historyCount.textContent =
            'No confirmed distributions';
        return;
    }

    elements.historyFeedback.textContent = '';

    elements.historyCount.textContent =
        formatNumber(state.history.length) +
        (state.history.length === 1
            ? ' confirmed distribution'
            : ' confirmed distributions');

    const fragment = document.createDocumentFragment();

    state.history.forEach(distribution => {
        fragment.append(createHistoryRow(distribution));
    });

    elements.historyRows.append(fragment);
}

async function loadHistory() {
    if (state.historyLoading) return;

    state.historyLoading = true;
    renderHistory();

    try {
        const result = await repository.loadHistory();

        state.history = Array.isArray(result.distributions)
            ? result.distributions
            : [];

        state.historyLoaded = true;
    } catch (error) {
        state.history = [];
        elements.historyFeedback.textContent =
            error.message || 'Failed to load distribution history.';
    } finally {
        state.historyLoading = false;
        renderHistory();
    }
}

function renderHistoryDetail() {
    const distribution = state.historyDetail;

    if (!distribution) return;

    elements.historyDetailHeading.textContent =
        formatPeriod(distribution.periodStart) + ' distribution';

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
            createCell(item.outlet),
            createCell(item.role),
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
    elements.historyFeedback.textContent =
        'Loading distribution…';

    try {
        const distribution =
            await repository.loadDistribution(id);

        state.historyDetail = distribution;

        renderHistoryDetail();

        elements.historyList.hidden = true;
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
        elements.historyFeedback.textContent =
            error.message || 'Failed to load distribution.';
    }
}

function closeHistoryDistribution() {
    state.historyDetail = null;

    elements.historyDetail.hidden = true;
    elements.historyList.hidden = false;

    elements.historyHeading.focus({
        preventScroll: true
    });
}

function showView(view, focus = false) {
    if (!['distribution', 'employees', 'history', 'settings'].includes(view)) {
        view = 'distribution';
    }

    closeOpenControls();

    elements.distributionView.hidden = view !== 'distribution';
    elements.historyView.hidden = view !== 'history';
    elements.placeholderView.hidden =
        view === 'distribution' || view === 'history';

    if (view !== 'history') {
        state.historyDetail = null;
        elements.historyDetail.hidden = true;
        elements.historyList.hidden = false;
    }

    if (view === 'employees' || view === 'settings') {
        elements.placeholderTitle.textContent =
            view[0].toUpperCase() + view.slice(1);
    }

    document
        .querySelectorAll('.main-navigation a, .settings-button')
        .forEach(link => {
            link.classList.toggle(
                'active',
                link.dataset.view === view
            );

            if (link.dataset.view === view) {
                link.setAttribute('aria-current', 'page');
            } else {
                link.removeAttribute('aria-current');
            }
        });

    const title =
        view === 'distribution'
            ? 'Distribution'
            : view === 'history'
                ? 'History'
                : elements.placeholderTitle.textContent;

    document.title = 'Tip Split — ' + title;

    if (view === 'history' && !state.historyLoaded) {
        loadHistory();
    }

    if (focus) {
        const target =
            view === 'distribution'
                ? elements.pageTitle
                : view === 'history'
                    ? elements.historyHeading
                    : elements.placeholderTitle;

        target.focus();
    }
}

function bindEvents() {
    bindFilters();
    bindMonthPicker();
    bindDialog(elements.confirmDialog);
    bindDialog(elements.attendanceDialog);
    document.querySelector('.skip-link').addEventListener('click', event => {
        event.preventDefault();
        document.getElementById('main-content').focus();
    });
    window.addEventListener('hashchange', () => showView(location.hash.slice(1), true));
    elements.historyBack.addEventListener('click', closeHistoryDistribution);      
    elements.employeeSearch.addEventListener('input', () => { state.search = elements.employeeSearch.value; render(); announce(getVisibleEmployees().length + ' employees visible.'); });
    elements.tips.addEventListener('input', () => {
        if (editingLocked()) return;
        elements.tipsError.textContent = '';
        elements.tips.removeAttribute('aria-invalid');
        invalidatePreview();
        render();
    });
    elements.includeVisibleButton.addEventListener('click', () => {
        if (editingLocked()) return;
        getVisibleEmployees().filter(employee => !employee.attention && employee.daysWorked > 0).forEach(employee => { employee.included = true; });
        invalidatePreview(); render(); announce(getIncludedEmployees().length + ' employees included.');
    });
    elements.attendanceDetailsButton.addEventListener('click', () => {
        state.search = ''; state.outlet = 'all'; state.status = 'attention'; elements.employeeSearch.value = '';
        render(); elements.statusFilter.focus(); announce(getAttentionEmployees().length + ' records need review.');
    });
    elements.calculateButton.addEventListener('click', () => currentPreview() ? openConfirmationDialog() : calculateDistribution());
    elements.closeDialog.addEventListener('click', () => { if (!state.confirming) elements.confirmDialog.close(); });
    elements.cancelConfirmation.addEventListener('click', () => { if (!state.confirming) elements.confirmDialog.close(); });
    elements.confirmDistribution.addEventListener('click', confirmDistribution);
    elements.closeAttendanceDialog.addEventListener('click', () => elements.attendanceDialog.close());
    elements.attendanceDialogDone.addEventListener('click', () => elements.attendanceDialog.close());
    elements.reviewAttendance.addEventListener('click', () => {
        if (editingLocked()) return;
        const employee = state.employees.find(item => item.id === state.attendanceEmployeeId);
        if (!employee || employee.daysWorked === 0) return;
        employee.attention = false; employee.attentionReason = ''; employee.attendanceReviewed = true;
        elements.reviewAttendance.hidden = true;
        elements.attendanceReviewNote.hidden = false;
        elements.attendanceReviewNote.textContent = 'Attendance reviewed. Include this employee from the workspace when ready.';
        elements.attendanceDialogDone.focus(); render(); announce('Attendance reviewed for ' + employee.name + '.');
    });
}

async function initialize() {
    try { repository = createDistributionRepository(); }
    catch (error) { elements.storageNotice.textContent = error.message; elements.storageNotice.hidden = false; }
    state.draftId = createStableId();
    bindEvents();
    const request = ++attendanceRequest;
    state.loadingAttendance = true;
    render(); showView(location.hash.slice(1));
    try {
        const employees = await (repository ? repository.loadAttendance(elements.period.value) : createDemoAttendance(defaultEmployees, elements.period.value));
        if (request !== attendanceRequest) return;
        state.employees = employees;
    } catch (error) {
        if (request !== attendanceRequest) return;
        elements.workflowError.textContent = error.message;
    } finally {
        if (request === attendanceRequest) { state.loadingAttendance = false; render(); }
    }
}

initialize();
