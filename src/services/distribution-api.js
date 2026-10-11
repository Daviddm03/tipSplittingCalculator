function createDistributionRepository() {
    const API_BASE_URL = "http://localhost:3000/api";

    async function request(path, options = {}) {
        let response;

        try {
            response = await fetch(API_BASE_URL + path, {
                ...options,
                headers: {
                    "Content-Type": "application/json",
                    ...options.headers
                }
            });
        } catch {
            throw new Error(
                "Unable to connect to the server. Check that the API is running."
            );
        }

        let data = null;

        try {
            data = await response.json();
        } catch {
            throw new Error(
                "The server returned an invalid response."
            );
        }

        if (!response.ok) {
            throw new Error(
                data?.error ||
                "The request could not be completed."
            );
        }

        return data;
    }

    function normalizeStatus(status) {
        if (status === "day_off") {
            return "day-off";
        }

        return status;
    }

    function normalizeEmployee(employee) {
        return {
            id: employee.id,
            reference: employee.reference,
            name: employee.name,
            role: employee.role,
            outletId: employee.outletId,
            outlet: employee.outlet,
            daysWorked: employee.daysWorked,
            workedMinutes: employee.workedMinutes,
            absences: employee.absences,
            vacationDays: employee.vacationDays,
            daysOff: employee.daysOff,
            attendance: employee.attendance.map(record => ({
                date: record.date,
                status: normalizeStatus(record.status),
                clockIn: record.clockIn,
                clockOut: record.clockOut,
                clockOutNextDay: record.clockOutNextDay,
                workedMinutes: record.workedMinutes
            })),
            included: employee.daysWorked > 0,
            attention: false,
            attentionReason: "",
            attendanceReviewed: false
        };
    }

    async function loadAttendance(period) {
        const [year, month] = period
            .split("-")
            .map(Number);

        const data = await request(
            `/attendance?year=${year}&month=${month}`
        );

        if (!Array.isArray(data.employees)) {
            throw new Error(
                "The server returned invalid attendance data."
            );
        }

        return data.employees.map(normalizeEmployee);
    }

    async function confirm(id, snapshot) {
        const body = {
            year: snapshot.periodYear,
            month: snapshot.periodMonth,
            poolCents: snapshot.totalTipsCents,
            employeeIds: snapshot.payments.map(
                payment => payment.id
            ),
            idempotencyKey: id
        };

        const data = await request("/distributions", {
            method: "POST",
            body: JSON.stringify(body)
        });

        return {
            id: String(data.distribution.id),
            reference: data.distribution.reference,
            period: snapshot.period,
            periodYear: snapshot.periodYear,
            periodMonth: snapshot.periodMonth,
            createdAt:
                data.distribution.confirmed_at ||
                data.distribution.created_at,
            totalTipsCents: data.calculation.poolCents,
            valuePerDayCents: Math.floor(
                data.calculation.poolCents /
                data.calculation.totalWorkedDays
            ),
            totalWorkedDays:
                data.calculation.totalWorkedDays,
            totalDistributedCents:
                data.calculation.allocatedCents,
            employeeCount:
                data.calculation.allocations.length,
            payments:
                data.calculation.allocations.map(allocation => {
                    const employee = snapshot.payments.find(
                        payment =>
                            payment.id === allocation.employeeId
                    );

                    return {
                        id: allocation.employeeId,
                        name: employee.name,
                        outlet: employee.outlet,
                        daysWorked: allocation.workedDays,
                        amountCents: allocation.payoutCents
                    };
                }),
            attendanceSnapshot:
                snapshot.attendanceSnapshot,
            calculationModel:
                "worked-days-largest-remainder-v1",
            currency: "EUR",
            scope: "hotel-wide",
            attendanceSource: "demo_hr"
        };
    }

    async function loadHistory() {
        return request("/distributions");
    }

    async function loadDistribution(id) {
        return request("/distributions/" + id);
    }

    return {
        loadAttendance,
        confirm,
        loadHistory,
        loadDistribution
    };
}