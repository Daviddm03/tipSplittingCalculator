const { Pool } = require("pg");

const config = process.env.DB_URL
    ? {
        connectionString: process.env.DB_URL,
        ssl: {
            rejectUnauthorized: false
        }
    }
    : {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    };

const pool = new Pool(config);

module.exports = pool;