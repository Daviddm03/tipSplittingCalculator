const pool = require("../db/pool");

// All consumers use the same date/status/minute aggregation. A supplied client
// lets preview and confirmation read one consistent PostgreSQL snapshot.
async function findMonthlyAttendance(year, month, database = pool) {
    const startDate =
        `${year}-${String(month).padStart(2, "0")}-01`;

    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;

    const endDate =
        `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

    const employeesResult = await database.query(
        `
            SELECT
                e.id,
                e.employee_code,
                e.name,
                e.role,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', l.id,
                            'name', l.name
                        )
                        ORDER BY l.name
                    ) FILTER (
                        WHERE l.id IS NOT NULL
                    ),
                    '[]'
                ) AS locations
            FROM employees e
            LEFT JOIN employee_locations el
                ON el.employee_id = e.id
            LEFT JOIN locations l
                ON l.id = el.location_id
            WHERE e.active = TRUE
            GROUP BY e.id
            ORDER BY e.id ASC
        `
    );

    const attendanceResult = await database.query(
        `
            SELECT
                a.employee_id,
                TO_CHAR(
                    a.work_date,
                    'YYYY-MM-DD'
                ) AS work_date,
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
                    WHEN
                        a.clock_in IS NOT NULL
                        AND a.clock_out IS NOT NULL
                    THEN ROUND(
                        EXTRACT(
                            EPOCH FROM (
                                a.clock_out - a.clock_in
                            )
                        ) / 60
                    )::INTEGER
                    ELSE 0
                END AS worked_minutes,
                CASE
                    WHEN
                        a.clock_in IS NOT NULL
                        AND a.clock_out IS NOT NULL
                    THEN (
                        a.clock_out
                        AT TIME ZONE 'Europe/Lisbon'
                    )::DATE > (
                        a.clock_in
                        AT TIME ZONE 'Europe/Lisbon'
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
            attendanceByEmployee.set(
                row.employee_id,
                []
            );
        }

        attendanceByEmployee
            .get(row.employee_id)
            .push({
                date: row.work_date,
                status: row.status,
                clockIn: row.clock_in,
                clockOut: row.clock_out,
                clockOutNextDay:
                    row.clock_out_next_day,
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
            locations: employee.locations || [],
            daysWorked: worked.length,
            workedMinutes: worked.reduce(
                (total, record) =>
                    total + record.workedMinutes,
                0
            ),
            absences: attendance.filter(
                record =>
                    record.status === "absence"
            ).length,
            vacationDays: attendance.filter(
                record =>
                    record.status === "vacation"
            ).length,
            daysOff: attendance.filter(
                record =>
                    record.status === "day_off"
            ).length,
            attendance
        };
    });
}

module.exports = {
    findMonthlyAttendance
};
