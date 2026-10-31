require("dotenv").config();

const pool = require("../pool");

const firstNames = [
    "Miguel",
    "Sofia",
    "Tiago",
    "Mariana",
    "João",
    "Beatriz",
    "Pedro",
    "Inês",
    "Rafael",
    "Carolina",
    "André",
    "Marta",
    "Diogo",
    "Leonor",
    "Gonçalo",
    "Ana",
    "Ricardo",
    "Catarina",
    "Bruno",
    "Filipa",
    "Daniel",
    "Rita",
    "Tomás",
    "Matilde",
    "Francisco"
];

const lastNames = [
    "Silva",
    "Santos",
    "Ferreira",
    "Pereira",
    "Costa",
    "Oliveira",
    "Rodrigues",
    "Martins",
    "Sousa",
    "Fernandes",
    "Gomes",
    "Lopes",
    "Marques",
    "Almeida",
    "Ribeiro",
    "Carvalho",
    "Teixeira",
    "Correia",
    "Mendes",
    "Nunes"
];

const roles = [
    "Barman de primeira",
    "Barman de segunda",
    "Empregado de mesa de primeira",
    "Empregado de mesa de segunda",
    "Hostess",
    "Cozinheiro de primeira",
    "Cozinheiro de segunda",
    "Copeiro",
    "Empregado de andares",
    "sommelier"
];

function createEmployee(index) {
    const number = index + 1;

    if (number === 1) {
        return {
            employeeCode: "EMP-001",
            name: "David Montaño",
            email: "david@example.com",
            role: "Barman de primeira",
            locationIds: [1]
        };
    }

    const firstName =
        firstNames[index % firstNames.length];

    const lastName =
        lastNames[(index * 3) % lastNames.length];

    return {
        employeeCode:
            `EMP-${String(number).padStart(3, "0")}`,
        name: `${firstName} ${lastName}`,
        email: `employee${number}@example.com`,
        role: roles[index % roles.length],
        locationIds: [(index % 10) + 1]
    };
}

async function replaceLocations(
    client,
    employeeId,
    locationIds
) {
    await client.query(
        `
            DELETE FROM employee_locations
            WHERE employee_id = $1
        `,
        [employeeId]
    );

    for (const locationId of locationIds) {
        await client.query(
            `
                INSERT INTO employee_locations (
                    employee_id,
                    location_id
                )
                VALUES ($1, $2)
            `,
            [employeeId, locationId]
        );
    }
}

async function seedEmployees() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        for (
            let index = 0;
            index < 50;
            index += 1
        ) {
            const employee = createEmployee(index);

            const result = await client.query(
                `
                    INSERT INTO employees (
                        employee_code,
                        name,
                        email,
                        role
                    )
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (employee_code)
                    DO UPDATE SET
                        name = EXCLUDED.name,
                        email = EXCLUDED.email,
                        role = EXCLUDED.role,
                        active = TRUE,
                        updated_at = NOW()
                    RETURNING id
                `,
                [
                    employee.employeeCode,
                    employee.name,
                    employee.email,
                    employee.role
                ]
            );

            await replaceLocations(
                client,
                result.rows[0].id,
                employee.locationIds
            );
        }

        await client.query("COMMIT");

        console.log(
            "50 employees seeded successfully"
        );
    } catch (error) {
        await client.query("ROLLBACK");

        console.error(
            "Failed to seed employees"
        );

        console.error(error.message);

        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

seedEmployees();