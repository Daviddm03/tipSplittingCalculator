function normalizeEmployeeSearch(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function filterEmployees(employees, filters) {
    const search = normalizeEmployeeSearch(filters.search);

    return employees.filter(employee => {
        const searchable = normalizeEmployeeSearch([
            employee.name,
            employee.reference,
            employee.role,
            employee.outlet
        ].join(' '));

        const matchesSearch =
            !search || searchable.includes(search);

        const matchesOutlet =
            filters.outlet === 'all' ||
            employee.outlet === filters.outlet;

        const matchesStatus =
            filters.status === 'all' ||
            (filters.status === 'included' && employee.included) ||
            (filters.status === 'excluded' && !employee.included);

        return matchesSearch && matchesOutlet && matchesStatus;
    });
}

function summarizeWorkspace(employees, visibleEmployees, preview) {
    const included = employees.filter(employee => employee.included);

    const payments = new Map(
        (preview?.payments || []).map(payment => [
            payment.id,
            payment.amountCents
        ])
    );

    return {
        employeeCount: employees.length,
        includedCount: included.length,
        includedDays: included.reduce(
            (total, employee) => total + employee.daysWorked,
            0
        ),
        includedMinutes: included.reduce(
            (total, employee) => total + employee.workedMinutes,
            0
        ),
        visibleDays: visibleEmployees.reduce(
            (total, employee) => total + employee.daysWorked,
            0
        ),
        visibleMinutes: visibleEmployees.reduce(
            (total, employee) => total + employee.workedMinutes,
            0
        ),
        visiblePayoutCents: visibleEmployees.reduce(
            (total, employee) =>
                total + (payments.get(employee.id) || 0),
            0
        )
    };
}

function buildDistributionSnapshot(
    preview,
    employees,
    periodYear,
    periodMonth,
    reference
) {
    const date = new Date(0);

    date.setUTCFullYear(
        periodYear,
        periodMonth - 1,
        1
    );

    return structuredClone({
        ...preview,
        period: new Intl.DateTimeFormat('en-IE', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC'
        }).format(date),
        periodYear,
        periodMonth,
        reference,
        scope: 'hotel-wide',
        attendanceSource: 'demo_hr',
        attendanceSnapshot: employees.map(employee => ({
            id: employee.id,
            name: employee.name,
            outlet: employee.outlet,
            included: employee.included,
            daysWorked: employee.daysWorked,
            workedMinutes: employee.workedMinutes,
            exclusionReason: employee.included
                ? null
                : employee.attentionReason ||
                  'Excluded from this distribution',
            attendanceReviewed: employee.attendanceReviewed,
            attendance: employee.attendance
        }))
    });
}

function validateConfirmedDistribution(record) {
    const whole = value =>
        Number.isSafeInteger(value) && value >= 0;

    const text = value =>
        typeof value === 'string' &&
        value.trim().length > 0;

    const valid =
        record &&
        typeof record === 'object' &&
        text(record.id) &&
        text(record.reference) &&
        typeof record.createdAt === 'string' &&
        Number.isFinite(Date.parse(record.createdAt)) &&
        whole(record.totalTipsCents) &&
        record.totalDistributedCents ===
            record.totalTipsCents &&
        whole(record.totalWorkedDays) &&
        record.totalWorkedDays > 0 &&
        Array.isArray(record.payments) &&
        record.payments.length > 0 &&
        record.employeeCount ===
            record.payments.length &&
        record.payments.every(payment =>
            payment &&
            whole(payment.id) &&
            payment.id > 0 &&
            text(payment.name) &&
            text(payment.outlet) &&
            whole(payment.daysWorked) &&
            whole(payment.amountCents)
        ) &&
        new Set(
            record.payments.map(payment => payment.id)
        ).size === record.payments.length &&
        record.payments.reduce(
            (sum, payment) =>
                sum + BigInt(payment.amountCents),
            0n
        ) === BigInt(record.totalTipsCents) &&
        record.payments.reduce(
            (sum, payment) =>
                sum + BigInt(payment.daysWorked),
            0n
        ) === BigInt(record.totalWorkedDays);

    if (!valid) {
        return 'The confirmed distribution response is invalid. Your review has been preserved; try again.';
    }

    if (
        record.attendanceSnapshot !== undefined &&
        (
            !Array.isArray(record.attendanceSnapshot) ||
            !record.attendanceSnapshot.every(employee =>
                employee &&
                whole(employee.id) &&
                employee.id > 0 &&
                text(employee.name) &&
                text(employee.outlet) &&
                whole(employee.daysWorked) &&
                whole(employee.workedMinutes) &&
                typeof employee.included === 'boolean' &&
                Array.isArray(employee.attendance) &&
                employee.attendance.every(daily =>
                    daily &&
                    typeof daily.date === 'string' &&
                    /^\d{4}-\d{2}-\d{2}$/.test(
                        daily.date
                    ) &&
                    Number.isFinite(
                        Date.parse(daily.date)
                    ) &&
                    [
                        'worked',
                        'day-off',
                        'absence',
                        'vacation'
                    ].includes(daily.status) &&
                    whole(daily.workedMinutes) &&
                    (
                        daily.clockIn === null ||
                        typeof daily.clockIn ===
                            'string'
                    ) &&
                    (
                        daily.clockOut === null ||
                        typeof daily.clockOut ===
                            'string'
                    ) &&
                    typeof daily.clockOutNextDay ===
                        'boolean'
                )
            )
        )
    ) {
        return 'The confirmed attendance response is invalid. Your review has been preserved; try again.';
    }

    return null;
}

if (
    typeof module !== 'undefined' &&
    module.exports
) {
    module.exports = {
        normalizeEmployeeSearch,
        filterEmployees,
        summarizeWorkspace,
        buildDistributionSnapshot,
        validateConfirmedDistribution
    };
}