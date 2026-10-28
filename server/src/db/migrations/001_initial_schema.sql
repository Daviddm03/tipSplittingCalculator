BEGIN;

CREATE TABLE locations (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE employees (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(255) UNIQUE,
    role VARCHAR(100) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE employee_locations (
    employee_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (employee_id, location_id),

    CONSTRAINT fk_employee_location_employee
        FOREIGN KEY (employee_id)
        REFERENCES employees(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_employee_location_location
        FOREIGN KEY (location_id)
        REFERENCES locations(id)
        ON DELETE RESTRICT
);

CREATE TABLE attendance (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id INTEGER NOT NULL,
    work_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL,
    clock_in TIMESTAMPTZ,
    clock_out TIMESTAMPTZ,
    source VARCHAR(50) NOT NULL DEFAULT 'demo_hr',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_attendance_employee
        FOREIGN KEY (employee_id)
        REFERENCES employees(id),

    CONSTRAINT uq_employee_work_date
        UNIQUE (employee_id, work_date),

    CONSTRAINT chk_attendance_status
        CHECK (
            status IN (
                'worked',
                'day_off',
                'absence',
                'vacation'
            )
        ),

    CONSTRAINT chk_clock_order
        CHECK (
            clock_out IS NULL
            OR clock_in IS NULL
            OR clock_out > clock_in
        )
);

CREATE TABLE distributions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reference VARCHAR(30) NOT NULL UNIQUE,
    period_start DATE NOT NULL,
    pool_cents BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    allocation_method VARCHAR(30)
        NOT NULL DEFAULT 'worked_days',
    attendance_source VARCHAR(50)
        NOT NULL DEFAULT 'demo_hr',
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_distribution_pool
        CHECK (pool_cents > 0),

    CONSTRAINT chk_distribution_status
        CHECK (status IN ('confirmed')),

    CONSTRAINT chk_allocation_method
        CHECK (allocation_method IN ('worked_days'))
);

CREATE TABLE distribution_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    distribution_id BIGINT NOT NULL,
    employee_id INTEGER NOT NULL,
    employee_code VARCHAR(20) NOT NULL,
    employee_name VARCHAR(120) NOT NULL,
    location_names VARCHAR(500) NOT NULL,
    role VARCHAR(100) NOT NULL,
    worked_days INTEGER NOT NULL,
    worked_minutes INTEGER NOT NULL,
    payout_cents BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_distribution_item_distribution
        FOREIGN KEY (distribution_id)
        REFERENCES distributions(id),

    CONSTRAINT fk_distribution_item_employee
        FOREIGN KEY (employee_id)
        REFERENCES employees(id),

    CONSTRAINT uq_distribution_employee
        UNIQUE (distribution_id, employee_id),

    CONSTRAINT chk_distribution_worked_days
        CHECK (worked_days >= 0),

    CONSTRAINT chk_distribution_worked_minutes
        CHECK (worked_minutes >= 0),

    CONSTRAINT chk_distribution_payout
        CHECK (payout_cents >= 0)
);

COMMIT;