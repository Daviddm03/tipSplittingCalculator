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
            const error = new Error(
                (typeof data?.error === "string" && data.error) ||
                "The request could not be completed."
            );

            error.code = typeof data?.code === "string" ? data.code : undefined;
            error.status = response.status;
            throw error;
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
            locations: employee.locations || [],
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
            eligible: employee.daysWorked > 0
        };
    }

    const whole = value => Number.isSafeInteger(value) && value >= 0;
    const positive = value => whole(value) && value > 0;
    const text = value => typeof value === 'string' && value.trim().length > 0;
    const uniqueIds = (values, key = 'id') => new Set(values.map(value => value[key])).size === values.length;
    const timestamp = value => text(value) && Number.isFinite(Date.parse(value));

    function invalidResponse(code, area) {
        const error = new Error('The server returned invalid ' + area + ' data.');
        error.code = code;
        return error;
    }

    function isLocation(location) {
        return location && positive(location.id) && text(location.name) && typeof location.active === 'boolean';
    }

    function isEmployee(employee) {
        return employee && positive(employee.id) && text(employee.employeeCode) && text(employee.name) &&
            text(employee.role) && (employee.email === null || typeof employee.email === 'string') &&
            typeof employee.active === 'boolean' && Array.isArray(employee.locations) &&
            employee.locations.every(isLocation) && uniqueIds(employee.locations);
    }

    function savedEmployee(data, expectedId) {
        if (!isEmployee(data?.employee) || (expectedId !== undefined && data.employee.id !== expectedId)) {
            throw invalidResponse('INVALID_EMPLOYEE_RESPONSE', 'employee');
        }
        return data.employee;
    }

    function isDistributionHeader(distribution) {
        return distribution && positive(distribution.id) && text(distribution.reference) &&
            typeof distribution.periodStart === 'string' && /^[0-9]{4}-(0[1-9]|1[0-2])-01$/.test(distribution.periodStart) &&
            Number(distribution.periodStart.slice(0, 4)) > 0 &&
            positive(distribution.poolCents) && distribution.allocatedCents === distribution.poolCents &&
            distribution.differenceCents === 0 && positive(distribution.employeeCount) &&
            distribution.status === 'confirmed' && distribution.allocationMethod === 'worked_days' &&
            timestamp(distribution.confirmedAt);
    }

    function savedDistribution(distribution, expectedId, code = 'INVALID_HISTORY') {
        if (!isDistributionHeader(distribution) || (expectedId !== undefined && distribution.id !== expectedId) ||
            !text(distribution.attendanceSource) || !Array.isArray(distribution.items) ||
            distribution.employeeCount !== distribution.items.length ||
            !distribution.items.every(item => item && positive(item.employeeId) && text(item.employeeCode) &&
                text(item.employeeName) && typeof item.role === 'string' && Array.isArray(item.locations) &&
                item.locations.every(text) && whole(item.workedDays) && whole(item.workedMinutes) && whole(item.payoutCents)) ||
            !uniqueIds(distribution.items, 'employeeId') ||
            distribution.items.reduce((sum, item) => sum + BigInt(item.payoutCents), 0n) !== BigInt(distribution.poolCents)) {
            throw invalidResponse(code, 'distribution');
        }
        return distribution;
    }

    function invalidAttendance() {
        const error = new Error('The server returned invalid attendance data.');
        error.code = 'INVALID_ATTENDANCE';
        return error;
    }

    function attendanceEmployees(data, year, month) {
        if (data?.period?.year !== year || data.period.month !== month || !text(data.source) ||
            !Array.isArray(data.employees)) throw invalidAttendance();
        const ids = new Set();
        const prefix = String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-';
        for (const employee of data.employees) {
            if (!employee || !whole(employee.id) || employee.id === 0 || ids.has(employee.id) ||
                !text(employee.name) || !text(employee.reference) || typeof employee.role !== 'string' ||
                employee.active === false || !Array.isArray(employee.locations) ||
                !employee.locations.every(location => location && whole(location.id) && location.id > 0 && text(location.name)) ||
                !whole(employee.daysWorked) || !whole(employee.workedMinutes) ||
                !['absences', 'vacationDays', 'daysOff'].every(key => whole(employee[key])) ||
                !Array.isArray(employee.attendance)) throw invalidAttendance();
            ids.add(employee.id);
            const dates = new Set();
            let days = 0, minutes = 0, absences = 0, vacations = 0, daysOff = 0;
            for (const record of employee.attendance) {
                if (!record || typeof record.date !== 'string' || !record.date.startsWith(prefix) ||
                    !/^\d{4}-\d{2}-\d{2}$/.test(record.date) || dates.has(record.date) ||
                    !Number.isFinite(Date.parse(record.date)) ||
                    new Date(record.date).toISOString().slice(0, 10) !== record.date ||
                    !['worked', 'absence', 'vacation', 'day_off', 'day-off'].includes(record.status) ||
                    !whole(record.workedMinutes) || typeof record.clockOutNextDay !== 'boolean' ||
                    ![record.clockIn, record.clockOut].every(clock => clock === null ||
                        (typeof clock === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(clock)))) throw invalidAttendance();
                dates.add(record.date);
                if (record.status === 'worked') { days++; minutes += record.workedMinutes; }
                if (record.status === 'absence') absences++;
                if (record.status === 'vacation') vacations++;
                if (['day_off', 'day-off'].includes(record.status)) daysOff++;
            }
            if (!whole(minutes) || employee.daysWorked !== days || employee.workedMinutes !== minutes ||
                employee.absences !== absences || employee.vacationDays !== vacations || employee.daysOff !== daysOff ||
                (employee.eligible !== undefined && employee.eligible !== (days > 0))) throw invalidAttendance();
        }
        const employees = data.employees.map(normalizeEmployee);
        employees.source = data.source;
        return employees;
    }

    function periodParts(period) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw invalidAttendance();
        const [year, month] = period.split('-').map(Number);
        if (year < 2000 || year > 2100) throw invalidAttendance();
        return { year, month };
    }

    async function loadAttendance(period) {
        const { year, month } = periodParts(period);

        const data = await request(
            `/attendance?year=${year}&month=${month}`
        );

        return attendanceEmployees(data, year, month);
    }

    function invalidDistribution() {
        const error = new Error('The server returned an invalid distribution response.');
        error.code = 'INVALID_DISTRIBUTION';
        return error;
    }

    async function preview(period, poolCents) {
        const { year, month } = periodParts(period);
        const data = await request('/distributions/preview', {
            method: 'POST', body: JSON.stringify({ year, month, poolCents })
        });
        const employees = attendanceEmployees(data, year, month);
        const eligible = employees.filter(employee => employee.daysWorked > 0);
        const calculation = data.calculation;
        if (!whole(poolCents) || poolCents === 0 || !calculation || calculation.poolCents !== poolCents ||
            calculation.allocatedCents !== poolCents || calculation.differenceCents !== 0 ||
            !whole(calculation.totalWorkedDays) || calculation.totalWorkedDays === 0 ||
            typeof data.previewFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(data.previewFingerprint) ||
            !Array.isArray(calculation.allocations) || calculation.allocations.length !== eligible.length) throw invalidDistribution();
        const ids = new Set();
        let cents = 0n, days = 0n;
        const payments = calculation.allocations.map(allocation => {
            const employee = eligible.find(item => item.id === allocation.employeeId);
            if (!employee || ids.has(employee.id) || allocation.workedDays !== employee.daysWorked ||
                !whole(allocation.payoutCents)) throw invalidDistribution();
            ids.add(employee.id);
            cents += BigInt(allocation.payoutCents);
            days += BigInt(allocation.workedDays);
            return { id: employee.id, reference: employee.reference, name: employee.name, role: employee.role,
                locations: employee.locations, daysWorked: employee.daysWorked, workedMinutes: employee.workedMinutes,
                amountCents: allocation.payoutCents };
        });
        if (cents !== BigInt(poolCents) || days !== BigInt(calculation.totalWorkedDays)) throw invalidDistribution();
        return { periodYear: year, periodMonth: month, totalTipsCents: poolCents,
            totalWorkedDays: calculation.totalWorkedDays, totalDistributedCents: calculation.allocatedCents,
            employeeCount: payments.length, payments, employees,
            previewFingerprint: data.previewFingerprint };
    }

    async function loadLocations() {
        const data = await request("/locations");

        if (!Array.isArray(data?.locations) || !data.locations.every(isLocation) || !uniqueIds(data.locations)) {
            throw invalidResponse('INVALID_LOCATION', 'location');
        }

        return data.locations;
    }

    function workspaceResult(data) {
        const workspace = data?.workspace;

        if (!workspace || !positive(workspace.id) ||
            !text(workspace.name) ||
            typeof workspace.locationsEnabled !== "boolean") {
            throw invalidResponse('INVALID_WORKSPACE', 'workspace');
        }

        return workspace;
    }

    async function loadWorkspace() {
        return workspaceResult(await request("/workspace"));
    }

    async function updateWorkspace(changes) {
        return workspaceResult(await request("/workspace", {
            method: "PATCH",
            body: JSON.stringify(changes)
        }));
    }

    async function saveLocation(id, location) {
        const data = await request(id === null ? "/locations" : "/locations/" + id, {
            method: id === null ? "POST" : "PATCH",
            body: JSON.stringify(location)
        });

        if (!isLocation(data?.location) || (id !== null && data.location.id !== id)) {
            throw invalidResponse('INVALID_LOCATION', 'location');
        }

        return data.location;
    }

    async function loadEmployees() {
        const data = await request("/employees");

        if (!Array.isArray(data?.employees) || !data.employees.every(isEmployee) || !uniqueIds(data.employees)) {
            throw invalidResponse('INVALID_EMPLOYEE_RESPONSE', 'employee');
        }

        return data.employees;
    }

    async function createEmployee(employee) {
        const data = await request("/employees", {
            method: "POST",
            body: JSON.stringify(employee)
        });

        return savedEmployee(data);
    }

    async function updateEmployee(id, employee) {
        const data = await request("/employees/" + id, {
            method: "PATCH",
            body: JSON.stringify(employee)
        });

        return savedEmployee(data, id);
    }

    async function confirm(id, preview) {
        const data = await request('/distributions', {
            method: 'POST',
            body: JSON.stringify({ year: preview.periodYear, month: preview.periodMonth,
                poolCents: preview.totalTipsCents, previewFingerprint: preview.previewFingerprint,
                idempotencyKey: id })
        });
        const snapshot = savedDistribution(data?.snapshot, undefined, 'INVALID_DISTRIBUTION');
        if (
            snapshot.periodStart !== String(preview.periodYear).padStart(4, '0') + '-' + String(preview.periodMonth).padStart(2, '0') + '-01' ||
            snapshot.poolCents !== preview.totalTipsCents ||
            snapshot.items.length !== preview.payments.length) throw invalidDistribution();
        const ids = new Set();
        const payments = snapshot.items.map(item => {
            const reviewed = preview.payments.find(payment => payment.id === item.employeeId);
            if (!reviewed || ids.has(item.employeeId) || !text(item.employeeName) || !text(item.employeeCode) ||
                typeof item.role !== 'string' || !Array.isArray(item.locations) || !item.locations.every(text) ||
                !whole(item.workedMinutes) || item.workedMinutes !== reviewed.workedMinutes ||
                item.workedDays !== reviewed.daysWorked || item.payoutCents !== reviewed.amountCents) throw invalidDistribution();
            ids.add(item.employeeId);
            return { id: item.employeeId, reference: item.employeeCode, name: item.employeeName,
                role: item.role, locations: item.locations, daysWorked: item.workedDays,
                workedMinutes: item.workedMinutes, amountCents: item.payoutCents };
        });
        return { id: String(snapshot.id), reference: snapshot.reference,
            periodYear: preview.periodYear, periodMonth: preview.periodMonth,
            createdAt: snapshot.confirmedAt, totalTipsCents: snapshot.poolCents,
            totalWorkedDays: payments.reduce((sum, payment) => sum + payment.daysWorked, 0),
            totalDistributedCents: snapshot.allocatedCents, employeeCount: payments.length, payments,
            calculationModel: 'worked-days-largest-remainder-v1', currency: 'EUR', scope: 'hotel-wide',
            attendanceSource: snapshot.attendanceSource };
    }

    async function loadHistory() {
        const data = await request("/distributions");
        if (!Array.isArray(data?.distributions) || !data.distributions.every(isDistributionHeader) || !uniqueIds(data.distributions)) {
            throw invalidResponse('INVALID_HISTORY', 'distribution');
        }
        return data;
    }

    async function loadDistribution(id) {
        return savedDistribution(await request("/distributions/" + id), id);
    }

    return {
        loadAttendance,
        loadLocations,
        loadWorkspace,
        updateWorkspace,
        createLocation: location => saveLocation(null, location),
        updateLocation: (id, location) => saveLocation(id, location),
        loadEmployees,
        createEmployee,
        updateEmployee,
        preview,
        confirm,
        loadHistory,
        loadDistribution
    };
}
