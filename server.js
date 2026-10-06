const path = require('path');
const os = require('os');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const { pool, criarTabela } = require('./db');

const CATEGORIAS = ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Educação', 'Outros'];
const PORTA = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function validar(corpo) {
  const descricao = String(corpo.descricao ?? '').trim();
  const valor = Number(corpo.valor);
  const { categoria, data } = corpo;

  if (!descricao || descricao.length > 120) return { erro: 'Descrição obrigatória (até 120 caracteres).' };
  if (!Number.isFinite(valor) || valor <= 0 || valor >= 100000000) return { erro: 'Valor deve ser maior que zero.' };
  if (!CATEGORIAS.includes(categoria)) return { erro: 'Categoria inválida.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data ?? '')) return { erro: 'Data inválida.' };

  return { gasto: [descricao, valor, categoria, data] };
}

// Qualquer rota com :id só aceita número
app.param('id', (req, res, next, id) => {
  if (!/^\d{1,9}$/.test(id)) return res.status(404).json({ erro: 'Gasto não encontrado.' });
  next();
});

app.get('/api/status', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ servidor: os.hostname(), banco: 'conectado' });
});

app.get('/api/categorias', (req, res) => {
  res.json(CATEGORIAS);
});

// READ - lista todos
app.get('/api/gastos', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM gastos ORDER BY data DESC, id DESC');
  res.json(rows);
});

// READ - busca um
app.get('/api/gastos/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM gastos WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ erro: 'Gasto não encontrado.' });
  res.json(rows[0]);
});

// CREATE
app.post('/api/gastos', async (req, res) => {
  const { erro, gasto } = validar(req.body ?? {});
  if (erro) return res.status(400).json({ erro });

  const { rows } = await pool.query(
    'INSERT INTO gastos (descricao, valor, categoria, data) VALUES ($1, $2, $3, $4) RETURNING *',
    gasto
  );
  res.status(201).json(rows[0]);
});

// UPDATE
app.put('/api/gastos/:id', async (req, res) => {
  const { erro, gasto } = validar(req.body ?? {});
  if (erro) return res.status(400).json({ erro });

  const { rows } = await pool.query(
    'UPDATE gastos SET descricao = $1, valor = $2, categoria = $3, data = $4 WHERE id = $5 RETURNING *',
    [...gasto, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ erro: 'Gasto não encontrado.' });
  res.json(rows[0]);
});

// DELETE
app.delete('/api/gastos/:id', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM gastos WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ erro: 'Gasto não encontrado.' });
  res.status(204).end();
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ erro: 'Erro ao processar a requisição. Veja o log com: pm2 logs' });
});

criarTabela()
  .then(() => {
    app.listen(PORTA, () => console.log(`Controle de Gastos rodando na porta ${PORTA}`));
  })
  .catch((err) => {
    console.error('Não foi possível conectar no banco:', err.message);
    console.error('Confira DB_HOST, DB_USER e DB_PASSWORD no .env e o Security Group do RDS.');
    process.exit(1);
  });
