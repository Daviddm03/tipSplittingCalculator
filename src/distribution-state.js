function summarizeWorkspace(employees, visibleEmployees, preview) {
    const participants = employees.filter(employee => employee.daysWorked > 0);

    const payments = new Map(
        (preview?.payments || []).map(payment => [
            payment.id,
            payment.amountCents
        ])
    );

    return {
        employeeCount: employees.length,
        participantCount: participants.length,
        participantDays: participants.reduce(
            (total, employee) => total + employee.daysWorked,
            0
        ),
        participantMinutes: participants.reduce(
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
            Array.isArray(payment.locations) &&
            payment.locations.every(location => typeof location === 'string' ||
                (location && typeof location.name === 'string')) &&
            whole(payment.daysWorked) &&
            payment.daysWorked > 0 &&
            whole(payment.workedMinutes) &&
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

    return null;
}

if (
    typeof module !== 'undefined' &&
    module.exports
) {
    module.exports = {
        summarizeWorkspace,
        validateConfirmedDistribution
    };
}
