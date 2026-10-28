function parseAttendancePeriod(period) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Select a valid attendance period.');
    const [year, month] = period.split('-').map(Number);
    if (year < 2000 || year > 2100) throw new Error('Select a valid attendance period.');
    const end = new Date(0);
    end.setUTCFullYear(year, month, 0);
    return { year, month, days: end.getUTCDate() };
}

function currentAttendancePeriod(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit'
    }).formatToParts(date);
    return {
        year: Number(parts.find(part => part.type === 'year').value),
        month: Number(parts.find(part => part.type === 'month').value)
    };
}

// Durations are attendance evidence, never payout weights.
function formatAttendanceDuration(value, unit = 'minutes') {
    const minutes = unit === 'hours' ? Math.round(value * 60) : value;
    if (!['minutes', 'hours'].includes(unit) || !Number.isFinite(value) ||
        !Number.isSafeInteger(minutes) || minutes < 0) {
        throw new Error('Invalid attendance duration.');
    }
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return hours + 'h' + (remainder ? ' ' + remainder + 'm' : '');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseAttendancePeriod, currentAttendancePeriod, formatAttendanceDuration };
}
