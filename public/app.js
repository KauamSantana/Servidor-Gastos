const API = '/api/gastos';
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moedaCompacta = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const mesCurto = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
const mesLongo = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

// Cada categoria tem uma cor fixa (paleta validada para daltonismo no fundo escuro).
// A cor segue a categoria, nunca a posição dela no ranking.
const PALETA = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'];
const COR_OUTROS = '#7d8b84';
const FONTE_ROTULO = '500 12px Poppins, system-ui, sans-serif';

const form = document.getElementById('form-gasto');
const campos = {
  descricao: document.getElementById('descricao'),
  valor: document.getElementById('valor'),
  data: document.getElementById('data'),
};
const btnSalvar = document.getElementById('btn-salvar');
const erroForm = document.getElementById('erro-form');
const modalGasto = document.getElementById('modal-gasto');
const modalExcluir = document.getElementById('modal-excluir');

let categorias = [];
let gastos = [];
let editandoId = null;
let idParaExcluir = null;
let filtro = 'Todos';
let busca = '';
let dataDe = '';
let dataAte = '';
let graficoCategoria = null;
let graficoMes = null;

// ---------- utilidades ----------

const css = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();

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

const capitalizar = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);
const soma = (lista) => lista.reduce((total, g) => total + g.valor, 0);
const plural = (n, singular, pluralTexto) => `${n} ${n === 1 ? singular : pluralTexto}`;
const porcentagem = (parte, total) => (total ? Math.round((parte / total) * 100) : 0);

function corDe(categoria) {
  const i = categorias.indexOf(categoria);
  if (categoria === 'Outros' || i < 0 || i >= PALETA.length) return COR_OUTROS;
  return PALETA[i];
}

const medidor = document.createElement('canvas').getContext('2d');
function larguraTexto(texto) {
  medidor.font = FONTE_ROTULO;
  return medidor.measureText(texto).width;
}

function toast(texto, tipo = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.innerHTML = `<svg class="icone"><use href="#${tipo === 'ok' ? 'i-check' : 'i-alerta'}"/></svg><span></span>`;
  el.querySelector('span').textContent = texto;
  document.getElementById('toasts').append(el);
  setTimeout(() => {
    el.classList.add('saindo');
    el.addEventListener('animationend', () => el.remove());
  }, 3200);
}

// ---------- cálculos ----------

function totaisPorCategoria() {
  const mapa = new Map();
  for (const g of gastos) {
    const item = mapa.get(g.categoria) || { categoria: g.categoria, valor: 0, qtd: 0 };
    item.valor += g.valor;
    item.qtd += 1;
    mapa.set(g.categoria, item);
  }
  return [...mapa.values()].sort((a, b) => b.valor - a.valor);
}

function totaisPorMes() {
  const agora = new Date();
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    meses.push({
      chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      rotulo: capitalizar(mesCurto.format(d).replace('.', '')),
      titulo: capitalizar(mesLongo.format(d)),
      valor: 0,
    });
  }
  for (const g of gastos) {
    const mes = meses.find((m) => m.chave === g.data.slice(0, 7));
    if (mes) mes.valor += g.valor;
  }
  return meses;
}

// Aplica categoria, período (De/Até) e busca. As datas são "AAAA-MM-DD",
// então dá para comparar como texto.
function gastosFiltrados({ ignorarCategoria = false } = {}) {
  const termo = busca.trim().toLowerCase();
  return gastos.filter((g) =>
    (ignorarCategoria || filtro === 'Todos' || g.categoria === filtro) &&
    (!dataDe || g.data >= dataDe) &&
    (!dataAte || g.data <= dataAte) &&
    (!termo || g.descricao.toLowerCase().includes(termo))
  );
}

// ---------- gráficos ----------

// Escreve o valor na ponta das barras (cor de texto, nunca a cor da série)
const rotuloValor = {
  id: 'rotuloValor',
  afterDatasetsDraw(chart) {
    const rotulos = chart.$rotulos || [];
    const horizontal = chart.options.indexAxis === 'y';
    const { ctx } = chart;
    ctx.save();
    ctx.font = FONTE_ROTULO;
    ctx.fillStyle = css('--texto');
    chart.getDatasetMeta(0).data.forEach((barra, i) => {
      if (!rotulos[i]) return;
      if (horizontal) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(rotulos[i], barra.x + 8, barra.y);
      } else {
        // Centraliza sobre a coluna sem deixar o texto sair da borda do gráfico
        const metade = ctx.measureText(rotulos[i]).width / 2;
        const x = Math.min(Math.max(barra.x, metade + 2), chart.width - metade - 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(rotulos[i], x, barra.y - 6);
      }
    });
    ctx.restore();
  },
};

function criarGraficos() {
  if (!window.Chart) return;

  Chart.defaults.font.family = 'Poppins, system-ui, sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = css('--suave');
  Chart.defaults.plugins.legend.display = false;
  Object.assign(Chart.defaults.plugins.tooltip, {
    backgroundColor: css('--fundo'),
    borderColor: css('--borda-forte'),
    borderWidth: 1,
    titleColor: css('--texto'),
    bodyColor: css('--texto-2'),
    titleFont: { weight: '600' },
    padding: 10,
    cornerRadius: 8,
    boxPadding: 4,
  });

  graficoCategoria = new Chart(document.getElementById('grafico-categoria'), {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderRadius: 4, borderSkipped: 'start', maxBarThickness: 22 }] },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      layout: { padding: { right: 0 } },
      interaction: { mode: 'index', axis: 'y', intersect: false },
      scales: {
        x: { display: false, beginAtZero: true },
        y: { grid: { display: false }, border: { display: false }, ticks: { color: css('--texto-2') } },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const item = graficoCategoria.$dados[ctx.dataIndex];
              return ` ${moeda.format(item.valor)} · ${plural(item.qtd, 'lançamento', 'lançamentos')}`;
            },
          },
        },
      },
    },
    plugins: [rotuloValor],
  });

  graficoMes = new Chart(document.getElementById('grafico-mes'), {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderRadius: 4, borderSkipped: 'start', maxBarThickness: 24 }] },
    options: {
      maintainAspectRatio: false,
      layout: { padding: { top: 24 } },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { display: false }, border: { color: css('--borda-forte') }, ticks: { color: css('--texto-2') } },
        y: {
          beginAtZero: true,
          grace: '5%',
          border: { display: false },
          grid: { color: css('--grade') },
          ticks: { maxTicksLimit: 5, callback: (valor) => moedaCompacta.format(valor) },
        },
      },
      plugins: {
        tooltip: {
          displayColors: false,
          callbacks: {
            title: (itens) => graficoMes.$dados[itens[0].dataIndex].titulo,
            label: (ctx) => moeda.format(ctx.parsed.y),
          },
        },
      },
    },
    plugins: [rotuloValor],
  });
}

function renderGraficos() {
  const temDados = gastos.length > 0;
  document.getElementById('card-categoria').classList.toggle('sem-dados', !temDados);
  document.getElementById('card-mes').classList.toggle('sem-dados', !temDados);
  if (!graficoCategoria) return;

  const total = soma(gastos);
  const porCategoria = totaisPorCategoria();
  const rotulos = porCategoria.map((d) => `${moeda.format(d.valor)} · ${porcentagem(d.valor, total)}%`);
  graficoCategoria.$dados = porCategoria;
  graficoCategoria.$rotulos = rotulos;
  graficoCategoria.data.labels = porCategoria.map((d) => d.categoria);
  graficoCategoria.data.datasets[0].data = porCategoria.map((d) => d.valor);
  graficoCategoria.data.datasets[0].backgroundColor = porCategoria.map((d) => corDe(d.categoria));
  graficoCategoria.options.layout.padding.right = Math.max(0, ...rotulos.map(larguraTexto)) + 12;
  graficoCategoria.update();

  // Mês atual em destaque, meses anteriores em cinza
  const porMes = totaisPorMes();
  const ultimo = porMes.length - 1;
  graficoMes.$dados = porMes;
  graficoMes.$rotulos = porMes.map((m, i) => (i === ultimo && m.valor ? moeda.format(m.valor) : ''));
  graficoMes.data.labels = porMes.map((m) => m.rotulo);
  graficoMes.data.datasets[0].data = porMes.map((m) => m.valor);
  graficoMes.data.datasets[0].backgroundColor = porMes.map((_, i) => (i === ultimo ? css('--destaque') : css('--apagado')));
  graficoMes.update();
}

// ---------- tela ----------

function renderKpis() {
  const total = soma(gastos);
  const mesAtual = hoje().slice(0, 7);
  const doMes = gastos.filter((g) => g.data.startsWith(mesAtual));
  const porCategoria = totaisPorCategoria();

  document.getElementById('kpi-total').textContent = moeda.format(total);
  document.getElementById('kpi-total-sub').textContent = gastos.length
    ? `Média de ${moeda.format(total / gastos.length)}`
    : 'Nenhum gasto ainda';

  document.getElementById('kpi-mes').textContent = moeda.format(soma(doMes));
  const nomeMesAtual = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date());
  document.getElementById('kpi-mes-sub').textContent = `${plural(doMes.length, 'lançamento', 'lançamentos')} em ${nomeMesAtual}`;

  document.getElementById('kpi-quantidade').textContent = gastos.length;
  document.getElementById('kpi-quantidade-sub').textContent = plural(porCategoria.length, 'categoria usada', 'categorias usadas');

  const kpiCategoria = document.getElementById('kpi-categoria');
  const sub = document.getElementById('kpi-categoria-sub');
  if (porCategoria.length) {
    const maior = porCategoria[0];
    kpiCategoria.innerHTML = `<span class="ponto" style="background:${corDe(maior.categoria)}"></span>${escapar(maior.categoria)}`;
    sub.textContent = `${moeda.format(maior.valor)} · ${porcentagem(maior.valor, total)}% do total`;
  } else {
    kpiCategoria.textContent = '—';
    sub.textContent = 'Nenhum gasto ainda';
  }
}

function renderFiltros() {
  // Os contadores respeitam o período e a busca, mas não a categoria escolhida
  const base = gastosFiltrados({ ignorarCategoria: true });
  const contagem = {};
  for (const g of base) contagem[g.categoria] = (contagem[g.categoria] || 0) + 1;

  const opcoes = [{ nome: 'Todos', qtd: base.length }]
    .concat(categorias.filter((c) => contagem[c] || c === filtro).map((c) => ({ nome: c, qtd: contagem[c] || 0 })));

  document.getElementById('filtros').innerHTML = opcoes.map((op) => `
    <button type="button" class="filtro ${op.nome === filtro ? 'ativo' : ''}" data-filtro="${escapar(op.nome)}" aria-pressed="${op.nome === filtro}">
      ${op.nome === 'Todos' ? '' : `<span class="ponto" style="background:${corDe(op.nome)}"></span>`}
      ${escapar(op.nome)}
      <span class="contagem">${op.qtd}</span>
    </button>
  `).join('');
}

function renderTabela() {
  const lista = gastosFiltrados();
  const corpo = document.getElementById('lista');

  document.getElementById('resumo-tabela').textContent =
    `${plural(lista.length, 'lançamento', 'lançamentos')} · ${moeda.format(soma(lista))}`;

  if (!gastos.length) {
    corpo.innerHTML = `<tr><td colspan="5" class="vazio"><strong>Nenhum gasto cadastrado ainda</strong>Clique em Novo gasto para cadastrar o primeiro.</td></tr>`;
    return;
  }
  if (!lista.length) {
    corpo.innerHTML = `<tr><td colspan="5" class="vazio"><strong>Nada encontrado</strong>Nenhum lançamento corresponde a esse filtro.</td></tr>`;
    return;
  }

  corpo.innerHTML = lista.map((g) => `
    <tr>
      <td class="col-data">${formatarData(g.data)}</td>
      <td class="col-desc">${escapar(g.descricao)}</td>
      <td><span class="badge"><span class="ponto" style="background:${corDe(g.categoria)}"></span>${escapar(g.categoria)}</span></td>
      <td class="numero">${moeda.format(g.valor)}</td>
      <td class="acoes">
        <div class="botoes-linha">
          <button type="button" class="btn-acao" data-editar="${g.id}"><svg class="icone"><use href="#i-editar"/></svg>Editar</button>
          <button type="button" class="btn-acao excluir" data-excluir="${g.id}"><svg class="icone"><use href="#i-lixeira"/></svg>Excluir</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderPilulas() {
  document.getElementById('categorias').innerHTML = categorias.map((c, i) => `
    <label class="pilula">
      <input type="radio" name="categoria" value="${escapar(c)}" ${i === 0 ? 'checked' : ''} required>
      <span><span class="ponto" style="background:${corDe(c)}"></span>${escapar(c)}</span>
    </label>
  `).join('');
}

function renderTudo() {
  document.getElementById('aba-contagem').textContent = gastos.length;
  renderKpis();
  renderGraficos();
  renderFiltros();
  renderTabela();
}

async function carregarGastos() {
  try {
    gastos = await api(API);
    renderTudo();
  } catch (err) {
    toast(err.message, 'erro');
  }
}

// ---------- abas ----------

function mostrarAba(nome) {
  const aba = nome === 'lancamentos' ? 'lancamentos' : 'visao';
  document.querySelectorAll('.aba').forEach((botao) => {
    const ativa = botao.dataset.aba === aba;
    botao.classList.toggle('ativa', ativa);
    botao.setAttribute('aria-selected', ativa);
  });
  document.getElementById('aba-visao').hidden = aba !== 'visao';
  document.getElementById('aba-lancamentos').hidden = aba !== 'lancamentos';
  // Guarda a aba no endereço para ela continuar aberta ao atualizar a página
  history.replaceState(null, '', aba === 'visao' ? location.pathname : '#lancamentos');
  if (aba === 'visao') {
    graficoCategoria?.resize();
    graficoMes?.resize();
  }
}

document.querySelector('.abas').addEventListener('click', (evento) => {
  const botao = evento.target.closest('[data-aba]');
  if (botao) mostrarAba(botao.dataset.aba);
});

// ---------- modal de cadastro e edição ----------

function limparForm() {
  editandoId = null;
  form.reset();
  campos.data.value = hoje();
  erroForm.hidden = true;
  document.getElementById('titulo-form').textContent = 'Novo gasto';
  document.getElementById('sub-form').textContent = 'Preencha e clique em cadastrar';
  btnSalvar.innerHTML = '<svg class="icone"><use href="#i-mais"/></svg><span>Cadastrar gasto</span>';
}

function novoGasto() {
  limparForm();
  modalGasto.showModal();
  campos.descricao.focus();
}

function editar(id) {
  const g = gastos.find((item) => item.id === id);
  if (!g) return;
  limparForm();
  editandoId = id;
  campos.descricao.value = g.descricao;
  campos.valor.value = g.valor;
  campos.data.value = g.data;
  form.elements.categoria.value = g.categoria;
  document.getElementById('titulo-form').textContent = 'Editar gasto';
  document.getElementById('sub-form').textContent = 'Altere os campos e salve';
  btnSalvar.innerHTML = '<svg class="icone"><use href="#i-check"/></svg><span>Salvar alterações</span>';
  modalGasto.showModal();
  campos.descricao.focus();
}

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const corpo = JSON.stringify({
    descricao: campos.descricao.value,
    valor: campos.valor.value,
    categoria: form.elements.categoria.value,
    data: campos.data.value,
  });
  const editando = editandoId;
  btnSalvar.disabled = true;
  try {
    if (editando) {
      await api(`${API}/${editando}`, { method: 'PUT', body: corpo });
    } else {
      await api(API, { method: 'POST', body: corpo });
    }
    modalGasto.close();
    toast(editando ? 'Gasto atualizado.' : 'Gasto cadastrado.');
    await carregarGastos();
  } catch (err) {
    // O modal fica por cima de tudo, então o erro aparece dentro dele
    erroForm.textContent = err.message;
    erroForm.hidden = false;
  } finally {
    btnSalvar.disabled = false;
  }
});

modalGasto.addEventListener('close', limparForm);
document.getElementById('btn-novo').addEventListener('click', novoGasto);
document.getElementById('btn-cancelar').addEventListener('click', () => modalGasto.close());
document.getElementById('btn-fechar').addEventListener('click', () => modalGasto.close());

// Clicar no fundo escuro, fora do modal, fecha (só se o clique começou fora também)
function fecharAoClicarFora(dialogo) {
  const fora = (evento) => {
    const r = dialogo.getBoundingClientRect();
    return evento.target === dialogo &&
      (evento.clientX < r.left || evento.clientX > r.right || evento.clientY < r.top || evento.clientY > r.bottom);
  };
  let comecouFora = false;
  dialogo.addEventListener('mousedown', (evento) => { comecouFora = fora(evento); });
  dialogo.addEventListener('click', (evento) => {
    if (comecouFora && fora(evento)) dialogo.close();
  });
}
fecharAoClicarFora(modalGasto);
fecharAoClicarFora(modalExcluir);

// ---------- modal de exclusão ----------

function pedirExclusao(id) {
  const g = gastos.find((item) => item.id === id);
  if (!g) return;
  idParaExcluir = id;
  document.getElementById('modal-texto').textContent = `“${g.descricao}” · ${moeda.format(g.valor)} será removido permanentemente.`;
  modalExcluir.returnValue = '';
  modalExcluir.showModal();
}

modalExcluir.addEventListener('close', async () => {
  if (modalExcluir.returnValue !== 'confirmar' || idParaExcluir === null) return;
  const id = idParaExcluir;
  idParaExcluir = null;
  try {
    await api(`${API}/${id}`, { method: 'DELETE' });
    toast('Gasto excluído.');
    await carregarGastos();
  } catch (err) {
    toast(err.message, 'erro');
  }
});

document.getElementById('lista').addEventListener('click', (evento) => {
  const botaoEditar = evento.target.closest('[data-editar]');
  const botaoExcluir = evento.target.closest('[data-excluir]');
  if (botaoEditar) editar(Number(botaoEditar.dataset.editar));
  if (botaoExcluir) pedirExclusao(Number(botaoExcluir.dataset.excluir));
});

document.getElementById('filtros').addEventListener('click', (evento) => {
  const botao = evento.target.closest('[data-filtro]');
  if (!botao) return;
  filtro = botao.dataset.filtro;
  renderFiltros();
  renderTabela();
});

document.getElementById('busca').addEventListener('input', (evento) => {
  busca = evento.target.value;
  renderFiltros();
  renderTabela();
});

// ---------- filtro por período ----------

const campoDe = document.getElementById('data-de');
const campoAte = document.getElementById('data-ate');
const btnLimparDatas = document.getElementById('btn-limpar-datas');

function aplicarPeriodo() {
  dataDe = campoDe.value;
  dataAte = campoAte.value;
  btnLimparDatas.hidden = !dataDe && !dataAte;
  renderFiltros();
  renderTabela();
}

campoDe.addEventListener('change', aplicarPeriodo);
campoAte.addEventListener('change', aplicarPeriodo);
btnLimparDatas.addEventListener('click', () => {
  campoDe.value = '';
  campoAte.value = '';
  aplicarPeriodo();
});

// ---------- início ----------

async function iniciar() {
  mostrarAba(location.hash.slice(1));
  try {
    categorias = await api('/api/categorias');
  } catch {
    toast('Não foi possível carregar as categorias.', 'erro');
  }
  renderPilulas();
  limparForm();
  // Espera a fonte carregar para os gráficos já desenharem com a Poppins
  await document.fonts.ready;
  criarGraficos();
  await carregarGastos();
}

iniciar();
