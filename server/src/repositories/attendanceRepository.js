const pool = require("../db/pool");

async function findMonthlyAttendance(year, month) {
    const startDate =
        `${year}-${String(month).padStart(2, "0")}-01`;

    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;

    const endDate =
        `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

    const employeesResult = await pool.query(
        `
            SELECT
                e.id,
                e.employee_code,
                e.name,
                e.role,
                e.outlet_id,
                o.name AS outlet
            FROM employees e
            JOIN outlets o
                ON e.outlet_id = o.id
            WHERE e.active = TRUE
            ORDER BY e.id ASC
        `
    );

    const attendanceResult = await pool.query(
        `
            SELECT
                a.employee_id,
                TO_CHAR(a.work_date, 'YYYY-MM-DD') AS work_date,
                a.status,
                TO_CHAR(
                    a.clock_in AT TIME ZONE 'Europe/Lisbon',
                    'HH24:MI'
                ) AS clock_in,
                TO_CHAR(
                    a.clock_out AT TIME ZONE 'Europe/Lisbon',
                    'HH24:MI'
                ) AS clock_out,
                CASE
                    WHEN a.clock_in IS NOT NULL
                        AND a.clock_out IS NOT NULL
                    THEN ROUND(
                        EXTRACT(
                            EPOCH FROM (a.clock_out - a.clock_in)
                        ) / 60
                    )::INTEGER
                    ELSE 0
                END AS worked_minutes,
                CASE
                    WHEN a.clock_in IS NOT NULL
                        AND a.clock_out IS NOT NULL
                    THEN (
                        a.clock_out AT TIME ZONE 'Europe/Lisbon'
                    )::DATE > (
                        a.clock_in AT TIME ZONE 'Europe/Lisbon'
                    )::DATE
                    ELSE FALSE
                END AS clock_out_next_day
            FROM attendance a
            WHERE
                a.work_date >= $1::DATE
                AND a.work_date < $2::DATE
            ORDER BY
                a.employee_id ASC,
                a.work_date ASC
        `,
        [startDate, endDate]
    );

    const attendanceByEmployee = new Map();

    for (const row of attendanceResult.rows) {
        if (!attendanceByEmployee.has(row.employee_id)) {
            attendanceByEmployee.set(row.employee_id, []);
        }

        attendanceByEmployee.get(row.employee_id).push({
            date: row.work_date,
            status: row.status,
            clockIn: row.clock_in,
            clockOut: row.clock_out,
            clockOutNextDay: row.clock_out_next_day,
            workedMinutes: row.worked_minutes
        });
    }

    return employeesResult.rows.map(employee => {
        const attendance =
            attendanceByEmployee.get(employee.id) || [];

        const worked = attendance.filter(
            record => record.status === "worked"
        );

        return {
            id: employee.id,
            reference: employee.employee_code,
            name: employee.name,
            role: employee.role,
            outletId: employee.outlet_id,
            outlet: employee.outlet,
            daysWorked: worked.length,
            workedMinutes: worked.reduce(
                (total, record) =>
                    total + record.workedMinutes,
                0
            ),
            absences: attendance.filter(
                record => record.status === "absence"
            ).length,
            vacationDays: attendance.filter(
                record => record.status === "vacation"
            ).length,
            daysOff: attendance.filter(
                record => record.status === "day_off"
            ).length,
            attendance
        };
    });
}

module.exports = {
    findMonthlyAttendance
};