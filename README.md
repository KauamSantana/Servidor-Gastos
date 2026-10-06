# Controle de Gastos

CRUD de controle de gastos feito para o **Trabalho 1 de Infraestrutura Cloud AWS** (UNESC).
A aplicação permite cadastrar, listar, editar e excluir gastos, e mostra um resumo por categoria.

## Stack

| Camada | Tecnologia |
|---|---|
| Servidor | AWS EC2, Ubuntu Server |
| Aplicação | Node.js + Express (API) e HTML/CSS/JS com Chart.js (tela) |
| Gerenciador de processo | PM2 (mantém a aplicação no ar e reinicia se cair) |
| Banco de dados | PostgreSQL no AWS RDS (acesso só a partir do EC2) |
| Repositório | GitHub |
| Backup | Backup automático do RDS + snapshot manual + AWS Backup do EC2 |

```
Navegador ──▶ EC2 (Ubuntu + Node.js + PM2, porta 3000) ──▶ RDS (PostgreSQL, porta 5432)
                        ▲
            GitHub ─────┘ git clone
```

## API

| Método | Rota | Ação |
|---|---|---|
| GET | `/api/gastos` | Lista todos os gastos |
| GET | `/api/gastos/:id` | Busca um gasto |
| POST | `/api/gastos` | Cadastra um gasto |
| PUT | `/api/gastos/:id` | Atualiza um gasto |
| DELETE | `/api/gastos/:id` | Exclui um gasto |
| GET | `/api/status` | Mostra o nome do servidor e se o banco está conectado |

A tabela `gastos` é criada automaticamente na primeira vez que a aplicação sobe.

## Como subir no EC2 (Ubuntu)

```bash
# 1. Instalar Node.js, Git e PM2
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs git
sudo npm install -g pm2

# 2. Baixar o código do GitHub
git clone https://github.com/KauamSantana/Servidor-Gastos.git
cd Servidor-Gastos
npm install --omit=dev

# 3. Configurar a conexão com o RDS
cp .env.example .env
nano .env

# 4. Iniciar com o PM2 e deixar iniciando junto com o servidor
pm2 start server.js --name controle-gastos
pm2 startup    # copie e rode o comando que ele mostrar
pm2 save
```

A aplicação fica disponível em `http://IP-PUBLICO-DO-EC2:3000`.

### Atualizar depois de um novo commit

```bash
cd ~/Servidor-Gastos
git pull
npm install --omit=dev
pm2 restart controle-gastos
```

### Comandos úteis

```bash
pm2 status                  # ver se está rodando
pm2 logs controle-gastos    # ver os logs / erros
```

## Variáveis de ambiente (`.env`)

| Variável | Exemplo | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta da aplicação |
| `DB_HOST` | `xxx.sa-east-1.rds.amazonaws.com` | Endpoint do RDS |
| `DB_PORT` | `5432` | Porta do PostgreSQL |
| `DB_USER` | `postgres` | Usuário do banco |
| `DB_PASSWORD` | — | Senha do banco |
| `DB_NAME` | `postgres` | Nome do banco |
| `DB_SSL` | `true` | O RDS exige conexão com SSL |
