## 📸 Event-Snap

Plataforma de gerenciamento de eventos que permite a geração de QR Codes personalizados e o upload de fotos por convidados, vinculadas diretamente a esses códigos.

---

### 🚀 Funcionalidades

- ✅ **Autenticação com JWT**
- ✅ **Cadastro e recuperação de senha com código de verificação via email (SendGrid)**
- ✅ **Criação de QR Codes com data de expiração**
- ✅ **Upload de imagens vinculado a QR Codes (Supabase Storage)**
- ✅ **Relacionamentos entre usuários, QR Codes e uploads**
- ✅ **Geração de QR Code em base64 (exibível no frontend)**
- ✅ **Health check endpoint**
- ✅ **Integração com Redis para verificação temporária**
- ✅ **Documentação de rotas via Swagger**

---

### 🧱 Estrutura de Pastas

```
src/
├── auth/             → Autenticação e JWT
├── common/           → Entidades base e enums
├── config/           → Configurações TypeORM, Redis, Supabase
├── email/            → Envio de emails (SendGrid)
├── health-check/     → Health check endpoint
├── migrations/       → Migrations do TypeORM
├── qrcode/           → Geração e relacionamento de QR Codes
├── upload/           → Upload de imagens para o Supabase
├── user/             → Cadastro e gestão de usuários
└── main.ts           → Bootstrap da aplicação
```

---

### ⚙️ Tecnologias e Pacotes

- **NestJS** — Framework principal
- **TypeORM** — ORM com PostgreSQL
- **JWT** — Autenticação
- **Redis** — Armazenamento temporário de códigos
- **SendGrid** — Envio de emails
- **Supabase Storage** — Upload e armazenamento de imagens
- **Swagger** — Documentação de API
- **Multer** — Upload de arquivos
- **Qrcode** — Geração de QR Codes em base64

---

### 📦 Scripts úteis

```bash
# Desenvolvimento com hot-reload
npm run start:dev

# Rodar migrations
npm run migration:run

# Gerar nova migration
npm run migration:generate

# Iniciar projeto em produção
npm run start

# Rodar testes
npm run test
```

---

### 🔐 Variáveis de ambiente `.env`

Use the `env.example` file for reference

---

### 🧪 Upload de imagem via Postman

- **Rota**: `POST /upload/:token`
- **Body**: `form-data`
  - `Key`: `file`
  - `Type`: File
  - `Value`: selecione a imagem
- **Header**: `Content-Type: multipart/form-data`

---

### 📄 Swagger

Acesse:  
`http://localhost:3000/api`  
Para visualizar a documentação gerada com Swagger.

---

### 🧠 Sobre

Esse projeto foi idealizado para eventos, aniversários, casamentos ou encontros, onde convidados podem tirar fotos e fazer o upload por meio de QR Codes, facilitando a centralização de registros visuais do evento.
