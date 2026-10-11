// Pure calculation functions shared by the browser and Node tests.
function parseMoneyToCents(value) {
    let text = String(value).trim().replace(/^€\s*/, '');
    if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(text)) {
        text = text.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(text)) {
        text = text.replace(/,/g, '');
    } else if (/^\d+([.,]\d{1,2})?$/.test(text)) {
        text = text.replace(',', '.');
    } else {
        return null;
    }
    const [euros, fraction = ''] = text.split('.');
    const cents = BigInt(euros) * 100n + BigInt(fraction.padEnd(2, '0'));
    return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

function formatCents(cents) {
    const value = BigInt(cents);
    const euros = new Intl.NumberFormat('en-US').format(value / 100n);
    return `${euros}.${String(value % 100n).padStart(2, '0')}`;
}

function parseDaysWorked(value) {
    if (!/^[0-9]+$/.test(String(value))) return null;
    const days = Number(value);
    return Number.isSafeInteger(days) && days >= 0 ? days : null;
}

function validateParticipants(participants) {
    if (!participants.length) return 'Select at least one employee.';
    const ids = new Set();
    let totalDays = 0;
    for (const employee of participants) {
        if (!Number.isSafeInteger(employee.id) || employee.id <= 0 || ids.has(employee.id)) {
            return 'Employee IDs must be unique positive integers.';
        }
        ids.add(employee.id);
        const days = parseDaysWorked(employee.daysWorked);
        if (days === null) return `Enter whole, non-negative days for ${employee.name}.`;
        totalDays += days;
        if (!Number.isSafeInteger(totalDays)) return 'Total worked days is too large.';
    }
    return totalDays > 0 ? null : 'Total worked days must be greater than zero.';
}

function distributeTips(totalTipsCents, participants) {
    if (!Number.isSafeInteger(totalTipsCents) || totalTipsCents < 0) {
        throw new Error('Enter a valid, non-negative tips amount with up to two decimal places.');
    }
    const error = validateParticipants(participants);
    if (error) throw new Error(error);
    const totalWorkedDays = participants.reduce((sum, employee) => sum + parseDaysWorked(employee.daysWorked), 0);
    const divisor = BigInt(totalWorkedDays);
    const quotas = participants.map(employee => {
        const daysWorked = parseDaysWorked(employee.daysWorked);
        // BigInt keeps multiplication, division and remainders exact, even for large products.
        const numerator = BigInt(totalTipsCents) * BigInt(daysWorked);
        return {
            id: employee.id,
            name: employee.name,
            outlet: employee.outlet,
            daysWorked,
            amountCents: Number(numerator / divisor),
            remainder: numerator % divisor
        };
    });
    const allocated = quotas.reduce((sum, employee) => sum + employee.amountCents, 0);
    const remaining = totalTipsCents - allocated;
    const ranked = [...quotas].sort((a, b) => {
        if (a.remainder === b.remainder) return a.id - b.id;
        return a.remainder > b.remainder ? -1 : 1;
    });
    for (let index = 0; index < remaining; index++) {
        ranked[index].amountCents += 1;
    }
    const payments = quotas.map(({ remainder, ...employee }) => employee);
    const totalDistributedCents = payments.reduce((sum, employee) => sum + employee.amountCents, 0);
    // Rounded only for display. Payments above never use this rate.
    const valuePerDayCents = Number((BigInt(totalTipsCents) * 2n + divisor) / (2n * divisor));
    return { totalTipsCents, totalWorkedDays, valuePerDayCents, employeeCount: payments.length, payments, totalDistributedCents };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseMoneyToCents, formatCents, parseDaysWorked, validateParticipants, distributeTips };
}
