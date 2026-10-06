const { Pool, types } = require('pg');

// DATE volta como texto ("2026-10-02") e NUMERIC como número,
// evitando problema de fuso horário e de valor em string no front.
types.setTypeParser(1082, (valor) => valor);
types.setTypeParser(1700, (valor) => parseFloat(valor));

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // O PostgreSQL do RDS exige conexão criptografada (SSL)
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  // Se o Security Group bloquear, falha em 5s em vez de ficar travado
  connectionTimeoutMillis: 5000,
});

async function criarTabela() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gastos (
      id         SERIAL PRIMARY KEY,
      descricao  VARCHAR(120)  NOT NULL,
      valor      NUMERIC(10,2) NOT NULL CHECK (valor > 0),
      categoria  VARCHAR(30)   NOT NULL,
      data       DATE          NOT NULL,
      criado_em  TIMESTAMP     NOT NULL DEFAULT NOW()
    )
  `);
}

module.exports = { pool, criarTabela };
