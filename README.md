# FotoUai - Backend

API REST para a plataforma FotoUai, construida com NestJS 11, TypeORM, PostgreSQL, Redis e Supabase Storage.

## Stack

- **Runtime**: Node.js + TypeScript 5
- **Framework**: NestJS 11
- **ORM**: TypeORM com PostgreSQL
- **Cache**: Redis (ioredis)
- **Storage**: Supabase Storage (uploads de imagens)
- **Auth**: JWT (Passport.js) com blacklist via Redis + Social Login (Firebase)
- **Pagamentos**: Stripe (checkout, webhooks, reembolsos)
- **Email**: Dispatcher HTTP interno (container `dispatcher-email` via infra-network)
- **CAPTCHA**: Cloudflare Turnstile
- **Docs**: Swagger (disponivel em `/api`)
- **Seguranca**: Helmet, CSRF, Rate Limiting, RBAC

## Requisitos

- Node.js >= 18
- PostgreSQL >= 14
- Redis >= 6

## Setup

```bash
# Instalar dependencias
npm install

# Copiar variaveis de ambiente
cp .env.example .env

# Rodar migrations
npm run migration:run

# Seed do usuario admin (opcional)
npm run seed:run

# Desenvolvimento
npm run start:dev

# Producao
npm run build && npm run start
```

## Variaveis de Ambiente

| Variavel | Descricao | Exemplo |
|----------|-----------|---------|
| `PORT` | Porta do servidor | `3000` |
| `NODE_ENV` | Ambiente | `development` / `production` |
| `AUTH_SECRET` | Segredo JWT (min 32 chars) | `sua-chave-secreta-longa` |
| `EXPIRE_IN` | Expiracao do token JWT (segundos) | `7200` |
| `TYPEORM_HOST` | Host do PostgreSQL | `localhost` |
| `TYPEORM_PORT` | Porta do PostgreSQL | `5432` |
| `TYPEORM_USERNAME` | Usuario do banco | `postgres` |
| `TYPEORM_PASSWORD` | Senha do banco | `postgres` |
| `TYPEORM_DATABASE` | Nome do banco | `fotouai` |
| `TYPEORM_SSL` | SSL do banco | `false` |
| `REDIS_HOST` | Host do Redis | `localhost` |
| `REDIS_PORT` | Porta do Redis | `6379` |
| `REDIS_PASSWORD` | Senha do Redis | `` |
| `REDIS_DB` | Database do Redis | `0` |
| `SUPABASE_URL` | URL do projeto Supabase | `https://xxx.supabase.co` |
| `SUPABASE_KEY` | Chave do Supabase | `eyJ...` |
| `SUPABASE_BUCKET` | Nome do bucket | `uploads` |
| `DISPATCHER_EMAIL_URL` | URL do dispatcher de email (rede interna Docker) | `http://dispatcher-email:3000` |
| `DISPATCHER_FROM_EMAIL` | Remetente dos emails | `noreply@fotouai.com.br` |
| `STRIPE_SECRET_KEY` | Chave secreta Stripe | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Webhook secret Stripe | `whsec_...` |
| `FIREBASE_PROJECT_ID` | Project ID do Firebase | `my-project-id` |
| `FIREBASE_CLIENT_EMAIL` | Client email Firebase | `...@...iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` | Private key Firebase | `-----BEGIN PRIVATE KEY-----\n...` |
| `TURNSTILE_SECRET_KEY` | Chave secreta Turnstile | `0x...` |
| `FRONTEND_URL` | URL do frontend | `http://localhost:3001` |
| `CORS_ORIGIN` | Origens permitidas (virgula) | `http://localhost:3001` |

## Arquitetura

```
src/
  modules/
    auth/           # Autenticacao (JWT, login, signup, reset, social login)
    user/           # Usuarios (perfil, admin dashboard)
    qrcode/         # QR Codes (CRUD, tokens publicos)
    upload/         # Upload de imagens (Supabase Storage)
    banner/         # Banners do dashboard (CRUD admin)
    dispatcher-email/ # Despacho de emails via HTTP (container interno)
    payment/        # Pagamentos (Stripe checkout, webhooks, reembolsos)
    health-check/   # Health check endpoint
  common/
    constants.ts        # Constantes centralizadas
    decorators/         # @CurrentUser, @Roles
    dto/                # DTOs compartilhados (paginacao)
    entity/             # BaseEntity, AuditLog
    enum/               # UserType, QrCodeType, QrCodePlan, PaymentStatus
    events/             # UserCreatedEvent (EventEmitter2)
    filters/            # GlobalExceptionFilter
    guards/             # RolesGuard, UploadRateLimitGuard
    interceptors/       # ResponseInterceptor
    logger/             # AppLoggerService
    middleware/          # CsrfMiddleware
    services/           # CacheService, AuditService, TurnstileService
    tasks/              # Cron jobs (cleanup)
    validators/         # Password validator
    config/             # TypeORM, Redis, Firebase, Supabase configs
  migrations/           # Migrations do banco
  seeds/                # Seed de usuario admin
  app.module.ts         # Modulo raiz
  main.ts               # Bootstrap da aplicacao
```

## Endpoints da API

Prefixo global: `/api/v1` (exceto health-check)

### Auth (`/api/v1/auth`)

| Metodo | Rota | Auth | Descricao |
|--------|------|------|-----------|
| POST | `/login` | - | Login com email e senha |
| POST | `/social-login` | - | Login social (Firebase token) |
| GET | `/me` | JWT | Valida token e retorna usuario |
| POST | `/request-signup` | - | Solicita codigo para cadastro |
| POST | `/confirm-signup` | - | Confirma cadastro com codigo |
| POST | `/request-reset` | - | Solicita codigo para reset de senha |
| POST | `/confirm-reset` | - | Confirma reset com codigo |
| POST | `/:userId/request-update` | - | Solicita codigo para atualizar dados |
| POST | `/:userId/confirm-update` | - | Confirma atualizacao com codigo |
| POST | `/logout` | JWT | Invalida token (blacklist) |
| POST | `/admin/force-reset/:userId` | JWT + ADMIN | Reseta senha sem codigo |

### User (`/api/v1/user`)

| Metodo | Rota | Auth | Descricao |
|--------|------|------|-----------|
| PATCH | `/profile` | JWT | Atualiza perfil do usuario |
| DELETE | `/profile` | JWT | Remove conta do usuario |
| GET | `/` | JWT + ADMIN | Lista todos os usuarios (paginado) |
| GET | `/admin/dash` | JWT + ADMIN | Dados do dashboard admin |
| GET | `/admin/dash/created-users` | JWT + ADMIN | Usuarios criados no periodo |
| GET | `/admin/dash/status-users` | JWT + ADMIN | Usuarios por status (ativo/inativo) |
| GET | `/admin/dash/without-qrcodes` | JWT + ADMIN | Usuarios sem QR codes |
| DELETE | `/:userId` | JWT + ADMIN | Remove usuario por ID |
| GET | `/:userId` | - | Busca usuario por ID |

### QR Code (`/api/v1/qrcode`)

| Metodo | Rota | Auth | Descricao |
|--------|------|------|-----------|
| POST | `/` | JWT | Cria novo QR code |
| PATCH | `/:qrCodeId` | JWT | Atualiza QR code (dono apenas) |
| GET | `/public/:token` | - | Acessa QR code por token publico |
| GET | `/admin/by-status` | JWT + ADMIN | Lista QR codes por status |
| GET | `/:id` | JWT | Busca QR code por ID |
| GET | `/` | JWT | Lista QR codes do usuario |

### Upload (`/api/v1/upload`)

| Metodo | Rota | Auth | Descricao |
|--------|------|------|-----------|
| POST | `/:token` | - | Upload de imagem (max 10/min + 30/5min por IP) |
| GET | `/gallery/:token` | JWT | Galeria do evento para convidados (paginado) |
| GET | `/:token` | JWT | Lista URLs dos uploads do dono (paginado) |
| DELETE | `/` | JWT | Remove arquivos por URL |

### Payment (`/api/v1/payment`)

| Metodo | Rota | Auth | Descricao |
|--------|------|------|-----------|
| POST | `/checkout` | JWT | Cria sessao de checkout Stripe |
| POST | `/webhook` | - | Webhook do Stripe (checkout.session.completed, charge.refunded) |
| POST | `/refund/:paymentId` | JWT | Solicita reembolso de pagamento |
| GET | `/history` | JWT | Historico de pagamentos do usuario |
| GET | `/status/:qrCodeId` | JWT | Status de pagamento de um QR Code |

### Banner (`/api/v1/banner`)

| Metodo | Rota | Auth | Descricao |
|--------|------|------|-----------|
| GET | `/active` | - | Lista banners ativos (publico) |
| GET | `/` | JWT + ADMIN | Lista todos os banners |
| GET | `/:id` | JWT + ADMIN | Busca banner por ID |
| POST | `/` | JWT + ADMIN | Cria novo banner |
| PATCH | `/:id` | JWT + ADMIN | Atualiza banner |
| DELETE | `/:id` | JWT + ADMIN | Remove banner |

### Health Check

| Metodo | Rota | Auth | Descricao |
|--------|------|------|-----------|
| GET | `/health-check` | - | Status da aplicacao |

## Seguranca

- **Helmet**: Headers HTTP de seguranca (X-Frame-Options, HSTS, CSP, etc.)
- **JWT + Blacklist**: Tokens invalidados no logout via Redis
- **RBAC**: Role-based access control com `@Roles(UserType.ADMIN)`
- **CSRF**: Header customizado `X-Requested-With: FotoUai`
- **Rate Limiting**: Global 100 req/min, auth 3-5 req/min, upload 10 req/min (Throttle) + 30 uploads/5min por IP (UploadRateLimitGuard via Redis)
- **Senhas fortes**: Min 8 chars, maiuscula, minuscula, numero, especial
- **CORS**: Configuravel via env, `credentials: true`
- **Validation**: DTOs com class-validator, whitelist + forbidNonWhitelisted
- **Turnstile**: Verificacao CAPTCHA via Cloudflare

## Performance

- **Redis Cache**: Multi-camada (QR codes, uploads, dashboard) com TTLs inteligentes
- **N+1 Fix**: Query unica com CASE statements para dashboard
- **Connection Pool**: 5-20 conexoes, idle timeout 30s
- **Compression**: GZIP nivel 6, threshold 1KB
- **Signed URLs**: Supabase Storage com URLs temporarias
- **Cron Jobs**: Limpeza de QR codes expirados e uploads orfaos

## Event-Driven

Usa `@nestjs/event-emitter` (EventEmitter2) para desacoplar modulos:
- `user.created` -> QrcodeService gera QR code de boas-vindas

## Audit Log

Acoes administrativas sao registradas na tabela `audit_log`:
- Force reset de senha
- Exclusao de usuarios

## Testes

- **387 testes unitarios** com 100% de cobertura em todos os servicos
- Jest com thresholds globais de 100% (branches, functions, lines, statements)

```bash
npm run test               # Roda todos os testes
npm run test:cov           # Testes com relatorio de cobertura
```

## Scripts

```bash
npm run start:dev          # Dev com hot reload
npm run build              # Build para producao
npm run start              # Build + migration + start
npm run migration:generate # Gerar migration
npm run migration:run      # Rodar migrations
npm run migration:revert   # Reverter ultima migration
npm run seed:run           # Seed usuario admin
npm run test               # Testes unitarios
npm run test:e2e           # Testes e2e
npm run lint               # Linter
```

## Documentacao Adicional

- [Cache Implementation](docs/CACHE_IMPLEMENTATION.md) - Detalhes do cache Redis
- [Cache Summary](docs/CACHE_SUMMARY.md) - Resumo do cache
- [Optimizations](docs/OPTIMIZATIONS_SUMMARY.md) - Otimizacoes de performance
- [Security](docs/SECURITY_IMPROVEMENTS.md) - Melhorias de seguranca
- [Postman Collection](docs/FotoUai.postman_collection.json) - Collection para testes
