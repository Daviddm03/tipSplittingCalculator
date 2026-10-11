function parseAttendancePeriod(period) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Select a valid attendance period.');
    const [year, month] = period.split('-').map(Number);
    if (year < 1) throw new Error('Select a valid attendance period.');
    const end = new Date(0);
    end.setUTCFullYear(year, month, 0);
    return { year, month, days: end.getUTCDate() };
}

function attendanceClockTime(minutes) {
    const normalized = ((minutes % 1440) + 1440) % 1440;
    return String(Math.floor(normalized / 60)).padStart(2, '0') + ':' + String(normalized % 60).padStart(2, '0');
}

function generateAttendanceRecords(employee, period) {
    const { year, month, days } = parseAttendancePeriod(period);
    return Array.from({ length: days }, (_, index) => {
        const day = index + 1;
        const date = new Date(0);
        date.setUTCFullYear(year, month - 1, day);
        const weekday = date.getUTCDay();
        const dayOff = weekday === employee.id % 7 || weekday === (employee.id + 3) % 7;
        const absence = !dayOff && (employee.id + day * 3) % 47 === 0;
        const dateKey = period + '-' + String(day).padStart(2, '0');
        if (dayOff || absence) {
            return { date: dateKey, status: dayOff ? 'day-off' : 'absence', clockIn: null, clockOut: null, workedMinutes: 0, clockOutNextDay: false };
        }
        const clockIn = 960 + ((employee.id * 11 + day * 7) % 17) - 8;
        const workedMinutes = 480 + ((employee.id * 13 + day * 5) % 41) - 20;
        return {
            date: dateKey, status: 'worked', clockIn: attendanceClockTime(clockIn),
            clockOut: attendanceClockTime(clockIn + workedMinutes), workedMinutes,
            clockOutNextDay: clockIn + workedMinutes >= 1440
        };
    });
}

function createDemoAttendance(employees, period) {
    return employees.map(employee => {
        const attendance = generateAttendanceRecords(employee, period);
        const worked = attendance.filter(record => record.status === 'worked');
        const demoReviewRequired = [31, 54].includes(employee.id);
        return {
            ...employee, reference: 'EMP-' + String(employee.id).padStart(3, '0'), attendance,
            daysWorked: worked.length,
            workedMinutes: worked.reduce((sum, record) => sum + record.workedMinutes, 0),
            included: worked.length > 0 && !demoReviewRequired,
            attention: worked.length === 0 || demoReviewRequired,
            attentionReason: worked.length === 0 ? 'No worked days' : demoReviewRequired ? 'Demo record flagged for review' : '',
            attendanceReviewed: false,
            absences: attendance.filter(record => record.status === 'absence').length
        };
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateAttendanceRecords, createDemoAttendance, parseAttendancePeriod };
}
