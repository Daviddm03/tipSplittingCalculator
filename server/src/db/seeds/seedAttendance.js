require("dotenv").config();

const pool = require("../pool");

const YEAR = 2026;
const MONTH = 10;

function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

function getAttendanceStatus(employeeId, day, weekday) {
    const firstDayOff = employeeId % 7;
    const secondDayOff = (employeeId + 3) % 7;

    if (weekday === firstDayOff || weekday === secondDayOff) {
        return "day_off";
    }

    if ((employeeId + day * 3) % 47 === 0) {
        return "absence";
    }

    if ((employeeId * 2 + day) % 89 === 0) {
        return "vacation";
    }

    return "worked";
}

function createShift(employeeId, year, month, day) {
    const startMinute = (employeeId * 7 + day * 3) % 21;
    const durationMinutes = 480 + ((employeeId + day) % 31);

    const clockIn = new Date(
        Date.UTC(
            year,
            month - 1,
            day,
            15,
            50 + startMinute
        )
    );

    const clockOut = new Date(
        clockIn.getTime() + durationMinutes * 60 * 1000
    );

    return {
        clockIn,
        clockOut
    };
}

async function seedAttendance() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const employeeResult = await client.query(`
            SELECT id
            FROM employees
            WHERE active = TRUE
            ORDER BY id ASC
        `);

        const employees = employeeResult.rows;
        const daysInMonth = getDaysInMonth(YEAR, MONTH);

        for (const employee of employees) {
            for (let day = 1; day <= daysInMonth; day += 1) {
                const date = new Date(
                    Date.UTC(YEAR, MONTH - 1, day)
                );

                const weekday = date.getUTCDay();

                const status = getAttendanceStatus(
                    employee.id,
                    day,
                    weekday
                );

                let clockIn = null;
                let clockOut = null;

                if (status === "worked") {
                    const shift = createShift(
                        employee.id,
                        YEAR,
                        MONTH,
                        day
                    );

                    clockIn = shift.clockIn;
                    clockOut = shift.clockOut;
                }

                const workDate =
                    `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

                await client.query(
                    `
                        INSERT INTO attendance (
                            employee_id,
                            work_date,
                            status,
                            clock_in,
                            clock_out,
                            source
                        )
                        VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (employee_id, work_date)
                        DO UPDATE SET
                            status = EXCLUDED.status,
                            clock_in = EXCLUDED.clock_in,
                            clock_out = EXCLUDED.clock_out,
                            source = EXCLUDED.source
                    `,
                    [
                        employee.id,
                        workDate,
                        status,
                        clockIn,
                        clockOut,
                        "demo_hr"
                    ]
                );
            }
        }

        await client.query("COMMIT");

        console.log(
            `Attendance seeded successfully for ${employees.length} employees`
        );
    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Failed to seed attendance");
        console.error(error.message);

        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

seedAttendance();