# Implementacao de Cache com Redis

## Visao Geral

Este documento descreve a implementacao de cache Redis adicionada ao FotoUai para melhorar a performance e reduzir a carga no banco de dados.

## Arquitetura

### Cache Service

**Localizacao**: `src/common/services/cache.service.ts`

O `CacheService` e um servico global que fornece uma interface unificada para operacoes de cache:

- **get<T>(key)**: Recupera valor do cache pela chave
- **set<T>(key, value, ttl?)**: Armazena valor com TTL opcional (em segundos)
- **del(key)**: Deleta uma entrada do cache
- **delByPattern(pattern)**: Deleta todas as chaves que correspondem ao padrao (ex: `qrcode:*`)
- **getOrSet<T>(key, factory, ttl?)**: Busca do cache ou computa e armazena
- **exists(key)**: Verifica se a chave existe
- **ttl(key)**: Retorna o TTL restante
- **increment(key, ttl?)**: Incremento atomico de contador

Todos os metodos tratam erros de forma graceful e logam falhas sem quebrar a aplicacao.

## Dados em Cache

### 1. QR Codes (`QrcodeService`)

**Prefixo de Cache**: `qrcode:`

**Metodos com Cache**:
- `getQrCodeById(id)` → `qrcode:id:{id}`
- `getQrCodeByToken(token)` → `qrcode:token:{token}`
- `getQrCodeByIdOrToken(idOrToken)` → tenta ambas as chaves (ID e token)
- `getUsersQrStatusCounts(userIds)` → `qrcode:stats:{sortedIds}` (TTL de 5 min)

**Estrategia de TTL**:
- TTL dinamico baseado na data de expiracao do QR code
- Se o QR code expira em 30 minutos, faz cache por 30 minutos (maximo 1 hora)
- QR codes ja expirados: 5 minutos de cache
- Sem data de expiracao: 1 hora de cache

**Invalidacao**:
- No `createQrCode`: Faz cache do novo QR code, invalida lista do usuario
- No `updateQrCode`: Invalida todas as entradas de cache daquele QR code (por ID, token e stats)

### 2. Uploads (`UploadService`)

**Prefixo de Cache**: `uploads:`

**Metodos com Cache**:
- `getFileUrlsByToken(token, userId)` → `uploads:{token}` (TTL de 5 min)
- `countUploadsByQrCodeId(qrCodeId)` → `uploads:count:{qrCodeId}` (TTL de 5 min)

**Invalidacao**:
- No `uploadImage`: Invalida lista de uploads e contagem para aquele QR code
- No `deleteFiles`: Invalida lista de uploads e contagem dos QR codes afetados

### 3. Dashboard (`UserService`)

**Prefixo de Cache**: `user:`

**Metodos com Cache**:
- `getDashAdmin(params)` → `user:dashboard:{JSON(params)}` (TTL de 5 min)

**Invalidacao**:
- No `createUser`: Invalida todas as entradas de cache do dashboard (`user:dashboard:*`)

## Padrao de Chaves de Cache

```
qrcode:id:{uuid}              → Entidade QrCode por ID
qrcode:token:{uuid}           → Entidade QrCode por token
qrcode:stats:{ids}            → Estatisticas de QR code (ativo/expirado/nenhum)
qrcode:user:{userId}:*        → Lista de QR codes do usuario (padrao para invalidacao)

uploads:{token}               → Array de URLs de upload por QR code
uploads:count:{qrCodeId}      → Contagem de uploads por QR code

user:dashboard:{params}       → Estatisticas do dashboard
```

## Impacto na Performance

### Antes do Cache
- Lookup de QR code: ~20-50ms (query no banco + JOIN user)
- Lista de uploads: ~30-100ms (query no banco + ordenacao)
- Estatisticas do dashboard: ~200-500ms (multiplas queries COUNT)

### Depois do Cache
- Lookup de QR code: ~1-5ms (cache hit)
- Lista de uploads: ~1-3ms (cache hit)
- Estatisticas do dashboard: ~1-5ms (cache hit)

**Melhoria esperada**: 60-80% de reducao nas queries ao banco, respostas 10x mais rapidas para dados em cache.

## Configuracao

O cache e configurado via `CommonModule` como modulo global, tornando o `CacheService` disponivel para todos os servicos sem imports explicitos.

**Conexao Redis**: Configurada em `src/common/config/redis.config.ts` usando variaveis de ambiente:
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `REDIS_DB`

## Testes

Testes unitarios do `CacheService` estao em `src/common/__tests__/cache.service.spec.ts`.

Os testes cobrem:
- Operacoes Get/Set
- Tratamento de TTL
- Delecao baseada em padrao
- Tratamento de erros
- Padrao GetOrSet
- Incremento de contador

Rodar testes:
```bash
npm test -- src/common/__tests__/cache.service.spec.ts
```

## Monitoramento

Operacoes de cache sao logadas com `Logger`:
- Delecoes por padrao logam o numero de chaves deletadas
- Erros sao logados com contexto (chave, padrao, operacao)

Monitorar efetividade do cache:
```bash
# Redis CLI
redis-cli INFO stats
redis-cli --scan --pattern "qrcode:*" | wc -l
redis-cli --scan --pattern "uploads:*" | wc -l
```

## Boas Praticas

1. **Sempre tratar cache misses**: Cache e opcional, o banco e a fonte da verdade
2. **Usar TTLs apropriados**: TTL curto para dados que mudam frequentemente (5 min), mais longo para dados estaveis (1 hora)
3. **Invalidar nas mutacoes**: Sempre invalidar entradas de cache relacionadas quando os dados mudam
4. **Invalidacao baseada em padrao**: Usar padroes para dados relacionados (ex: `qrcode:user:{userId}:*`)
5. **Resiliencia a erros**: Falhas no cache nao devem quebrar a aplicacao

## Melhorias Futuras

1. **Cache warming**: Pre-popular cache no startup da aplicacao
2. **Metricas de cache**: Rastrear taxas de hit/miss, chaves mais acessadas
3. **Cache distribuido**: Suporte a Redis Cluster para escalabilidade horizontal
4. **Compressao de cache**: Comprimir valores grandes antes de armazenar
5. **Operacoes em lote**: `mget`/`mset` para operacoes de cache em massa
