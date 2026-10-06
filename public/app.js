const API = '/api/gastos';
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const form = document.getElementById('form-gasto');
const campos = {
  descricao: document.getElementById('descricao'),
  valor: document.getElementById('valor'),
  categoria: document.getElementById('categoria'),
  data: document.getElementById('data'),
};
const btnSalvar = document.getElementById('btn-salvar');
const btnCancelar = document.getElementById('btn-cancelar');
const tituloForm = document.getElementById('titulo-form');
const mensagem = document.getElementById('mensagem');

let gastos = [];
let editandoId = null;

async function api(url, opcoes = {}) {
  const resp = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opcoes });
  if (resp.status === 204) return null;
  const dados = await resp.json();
  if (!resp.ok) throw new Error(dados.erro || 'Erro na requisição.');
  return dados;
}

function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

function formatarData(iso) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function hoje() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function avisar(texto, tipo) {
  mensagem.textContent = texto;
  mensagem.className = tipo;
}

function renderTabela() {
  const lista = document.getElementById('lista');
  if (!gastos.length) {
    lista.innerHTML = '<tr><td colspan="5" class="vazio">Nenhum gasto cadastrado ainda.</td></tr>';
    return;
  }
  lista.innerHTML = gastos.map((g) => `
    <tr>
      <td>${formatarData(g.data)}</td>
      <td class="descricao">${escapar(g.descricao)}</td>
      <td>${escapar(g.categoria)}</td>
      <td class="numero">${moeda.format(g.valor)}</td>
      <td class="acoes">
        <button class="editar" data-editar="${g.id}">Editar</button>
        <button class="perigo" data-excluir="${g.id}">Excluir</button>
      </td>
    </tr>
  `).join('');
}

function renderResumo() {
  const total = gastos.reduce((soma, g) => soma + g.valor, 0);
  const porCategoria = {};
  for (const g of gastos) porCategoria[g.categoria] = (porCategoria[g.categoria] || 0) + g.valor;
  const ordenadas = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);

  document.getElementById('total').textContent = moeda.format(total);
  document.getElementById('quantidade').textContent = gastos.length;
  document.getElementById('maior-categoria').textContent = ordenadas.length ? ordenadas[0][0] : '—';

  const grafico = document.getElementById('grafico');
  if (!ordenadas.length) {
    grafico.innerHTML = '<p class="vazio">Cadastre um gasto para ver o gráfico.</p>';
    return;
  }
  grafico.innerHTML = ordenadas.map(([categoria, valor]) => {
    const pct = (valor / total) * 100;
    return `
      <div class="barra">
        <div class="barra-topo">
          <span>${escapar(categoria)}</span>
          <span>${moeda.format(valor)} · ${pct.toFixed(0)}%</span>
        </div>
        <div class="barra-fundo"><div class="barra-cheia" style="width: ${pct}%"></div></div>
      </div>
    `;
  }).join('');
}

async function carregarGastos() {
  try {
    gastos = await api(API);
    renderTabela();
    renderResumo();
  } catch (err) {
    avisar(err.message, 'erro');
  }
}

function limparForm() {
  editandoId = null;
  form.reset();
  campos.data.value = hoje();
  tituloForm.textContent = 'Novo gasto';
  btnSalvar.textContent = 'Cadastrar';
  btnCancelar.hidden = true;
}

function editar(id) {
  const g = gastos.find((item) => item.id === id);
  if (!g) return;
  editandoId = id;
  campos.descricao.value = g.descricao;
  campos.valor.value = g.valor;
  campos.categoria.value = g.categoria;
  campos.data.value = g.data;
  tituloForm.textContent = 'Editando gasto';
  btnSalvar.textContent = 'Salvar alterações';
  btnCancelar.hidden = false;
  avisar('', '');
  campos.descricao.focus();
}

async function excluir(id) {
  const g = gastos.find((item) => item.id === id);
  if (!g || !confirm(`Excluir "${g.descricao}"?`)) return;
  try {
    await api(`${API}/${id}`, { method: 'DELETE' });
    if (editandoId === id) limparForm();
    avisar('Gasto excluído.', 'ok');
    await carregarGastos();
  } catch (err) {
    avisar(err.message, 'erro');
  }
}

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const corpo = JSON.stringify({
    descricao: campos.descricao.value,
    valor: campos.valor.value,
    categoria: campos.categoria.value,
    data: campos.data.value,
  });
  try {
    if (editandoId) {
      await api(`${API}/${editandoId}`, { method: 'PUT', body: corpo });
      avisar('Gasto atualizado.', 'ok');
    } else {
      await api(API, { method: 'POST', body: corpo });
      avisar('Gasto cadastrado.', 'ok');
    }
    limparForm();
    await carregarGastos();
  } catch (err) {
    avisar(err.message, 'erro');
  }
});

btnCancelar.addEventListener('click', () => {
  limparForm();
  avisar('', '');
});

document.getElementById('lista').addEventListener('click', (evento) => {
  const { editar: idEditar, excluir: idExcluir } = evento.target.dataset;
  if (idEditar) editar(Number(idEditar));
  if (idExcluir) excluir(Number(idExcluir));
});

async function carregarCategorias() {
  const categorias = await api('/api/categorias');
  campos.categoria.innerHTML = categorias.map((c) => `<option>${escapar(c)}</option>`).join('');
}

async function carregarStatus() {
  const rodape = document.getElementById('status');
  try {
    const s = await api('/api/status');
    rodape.textContent = `Servidor: ${s.servidor} · Banco de dados: ${s.banco}`;
  } catch {
    rodape.textContent = 'Banco de dados: sem conexão';
  }
}

carregarCategorias().then(limparForm);
carregarGastos();
carregarStatus();
