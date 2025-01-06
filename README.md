# 🚀 **Boilerplate NestJS**

Um boilerplate robusto para desenvolvimento de aplicações backend utilizando **NestJS**, configurado com TypeORM, PostgreSQL, autenticação JWT, ESLint, Prettier, e suporte a testes com Jest.

---

## 📦 **Tecnologias Utilizadas**

- **Node.js** v22+
- **NestJS** v10+
- **TypeORM**
- **PostgreSQL**
- **JWT (Json Web Token)**
- **ESLint** & **Prettier**
- **Jest** (Testes unitários e e2e)
- **Swagger** (Documentação de API)
- **Docker** (opcional)

---

## 📂 **Estrutura do Projeto**

```
src/
├── auth/          # Módulo de autenticação
├── common/        # Recursos compartilhados (filtros, pipes, etc.)
├── config/        # Configurações (banco de dados, ambiente, etc.)
├── health-check/  # Endpoint de verificação de saúde
├── migrations/    # Migrações do banco de dados
├── user/          # Módulo de usuários
├── app.module.ts  # Módulo principal
├── main.ts        # Ponto de entrada principal
```

---

## ⚙️ **Configuração do Ambiente**

1. **Clone o repositório:**
   ```bash
   git clone git@github.com:arthur-cgomes/boilerplate-nestjs.git
   cd boilerplate-nestjs
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Crie o arquivo `.env` a partir do exemplo:**
   ```bash
   cp .env.example .env
   ```

4. **Atualize as variáveis de ambiente no `.env`:**
   ```
    # PASSPORT
    AUTH_SECRET= auth_secret
    EXPIRE_IN= 7200

    # DB
    TYPEORM_CONNECTION= postgres
    TYPEORM_HOST= localhost
    TYPEORM_USERNAME= user
    TYPEORM_PASSWORD= password
    TYPEORM_DATABASE= name
    TYPEORM_PORT= 5432
    TYPEORM_SYNCHRONIZE= false
    TYPEORM_ENTITIES= dist/**/*.entity.js
   ```

5. **Execute as migrações do banco de dados:**
   ```bash
   npm run migration:run
   ```

---

## 🛠️ **Scripts Disponíveis**

- **Iniciar em desenvolvimento:**  
  ```bash
  npm run start:dev
  ```
- **Build de produção:**  
  ```bash
  npm run build
  ```
- **Iniciar em produção:**  
  ```bash
  npm run start:prod
  ```
- **Executar testes unitários:**  
  ```bash
  npm run test
  ```
- **Executar testes com cobertura:**  
  ```bash
  npm run test:cov
  ```
- **Executar ESLint:**  
  ```bash
  npm run lint
  ```
- **Formatar código com Prettier:**  
  ```bash
  npm run format
  ```

---

## 🔑 **Autenticação JWT**

O projeto inclui autenticação JWT por padrão. Certifique-se de configurar corretamente a variável `JWT_SECRET` no arquivo `.env`.

**Exemplo de autenticação:**
```http
POST /auth
Content-Type: application/json

{
  "email": "email",
  "password": "password"
}
```

---

## 📊 **Documentação da API (Swagger)**

A documentação da API está disponível após iniciar o servidor:

```
http://localhost:3000/api
```

---

## ✅ **Health Check**

Para verificar o status da aplicação, acesse:

```
GET /health-check
```

**Exemplo de resposta:**
```json
{
  "uptime": 120.56,
  "message": "OK",
  "timestamp": 1699999999999,
  "checks": [
    {
      "name": "Database",
      "type": "internal",
      "status": true,
      "details": "Connected"
    }
  ]
}
```

---

## 🐳 **Docker (Opcional)**

Para rodar com Docker, utilize:

```bash
docker-compose up -d
```

---

## 🤝 **Contribuindo**

1. Faça um fork do projeto.
2. Crie uma nova branch: `git checkout -b feature/sua-feature`.
3. Faça suas alterações e commit: `git commit -m "Adiciona nova funcionalidade"`
4. Envie suas alterações: `git push origin feature/sua-feature`
5. Abra um Pull Request.

---

## 📜 **Licença**

Este projeto está licenciado sob a licença **UNLICENSED**.

