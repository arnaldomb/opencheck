# OpenCheck — Guia VPS e Traefik

## Arquitetura de produção

```
Internet → Cloudflare DNS → VPS (193.203.182.2)
                               └── Traefik (network_mode: host, porta 80/443)
                                     ├── opencheck.ggtronic.com.br → opencheck_web:3000
                                     ├── api.opencheck.ggtronic.com.br → opencheck_api:3001
                                     └── storage.opencheck.ggtronic.com.br → opencheck_minio:9000
```

O VPS compartilha o Traefik com outros projetos (alerta-vigia, ctrl-safe). O container do Traefik se chama **`traefik-traefik-1`**.

---

## Traefik em `network_mode: host` — Regras obrigatórias

O Traefik neste VPS roda em **host mode** (não usa redes Docker para rotear). Isso muda como os labels devem ser configurados.

### Como rotear corretamente

**Usar `server.port` + rede `proxy`** (abordagem que funciona):

```yaml
services:
  api:
    networks:
      - internal
      - proxy          # container deve estar nesta rede
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=proxy"                         # Traefik busca IP do container nesta rede
      - "traefik.http.services.meu-servico.loadbalancer.server.port=3001"
```

O Traefik encontra o IP do container na rede `proxy` (ex: `172.21.0.x`) e roteia para `<ip>:porta`. O host tem rota para subnets Docker bridge, então funciona.

### O que NÃO funciona

**`server.url=http://127.0.0.1:<porta>`** — parece lógico mas falha porque:
- Docker publica portas em `127.0.0.1` via proxy/iptables
- Conexões ao loopback do host não chegam corretamente ao container
- Next.js precisa de `HOSTNAME=0.0.0.0` para aceitar conexões externas

**`server.port` sem estar na rede `proxy`** — Traefik não acha o IP do container.

---

## Next.js standalone — `HOSTNAME=0.0.0.0` obrigatório

Next.js standalone usa `process.env.HOSTNAME` para bind. O Docker define `HOSTNAME` como o container ID (ex: `a3f9d2b1c4e5`), que resolve para `127.0.0.1` dentro do container. Resultado: Next.js ouve **só no loopback interno** e é inacessível pela rede proxy.

**Sempre definir no serviço web:**

```yaml
web:
  environment:
    HOSTNAME: "0.0.0.0"
  healthcheck:
    disable: true      # healthcheck Docker causa problemas com Traefik; desativar
```

---

## DNS Cloudflare — registros necessários

| Subdomínio | Tipo | IP | Observação |
|---|---|---|---|
| `opencheck.ggtronic.com.br` | A | 193.203.182.2 | web |
| `api.opencheck.ggtronic.com.br` | A | 193.203.182.2 | API |
| `storage.opencheck.ggtronic.com.br` | A | 193.203.182.2 | MinIO |
| `storage-console.opencheck.ggtronic.com.br` | A | 193.203.182.2 | MinIO console |

---

## Rede Docker `proxy` — pré-requisito

A rede `proxy` é externa e deve existir antes de subir os containers:

```bash
docker network create proxy
```

Verificar se existe:
```bash
docker network ls | grep proxy
```

---

## Deploy na VPS

A VPS **não é um repositório git**. O `docker-compose.yml` precisa ser atualizado manualmente:

```bash
# Atualizar o docker-compose.yml do GitHub
curl -o /docker/opencheck/docker-compose.yml \
  https://raw.githubusercontent.com/arnaldomb/opencheck/main/docker-compose.yml

# Subir todos os serviços
cd /docker/opencheck
docker compose up -d

# Subir só um serviço
docker compose up -d --force-recreate web
```

---

## Diagnóstico rápido

```bash
# Status de todos os containers opencheck
docker ps --format "{{.Names}}\t{{.Status}}" | grep opencheck

# Ver IP do web na rede proxy e testar conectividade
WEBIP=$(docker inspect opencheck_web --format '{{(index .NetworkSettings.Networks "proxy").IPAddress}}')
echo "IP: $WEBIP" && curl -s http://$WEBIP:3000/ | head -3

# Verificar se Traefik registrou o router
docker logs traefik-traefik-1 2>&1 | grep "opencheck" | grep -v storage-console | tail -20

# Testar roteamento HTTP (deve retornar "Moved Permanently" → redirect para HTTPS)
curl -s -H "Host: opencheck.ggtronic.com.br" http://127.0.0.1:80 | head -3

# Ver erros de certificado SSL
docker logs traefik-traefik-1 2>&1 | grep "opencheck.ggtronic.com.br" | grep -v storage-console | tail -10
```

---

## Problemas conhecidos e soluções

### 404 page not found (Traefik)
Traefik não tem router para o domínio. Causas possíveis:
1. Container não está na rede `proxy` → verificar `docker inspect <container>`
2. Container com status `(unhealthy)` → adicionar `healthcheck: disable: true`
3. Certificado SSL não obtido → ver logs do Traefik para erros ACME

### 502 Bad Gateway
Traefik roteia mas não consegue conectar ao backend. Causas:
1. `HOSTNAME` não definido → Next.js ouve só no loopback interno → adicionar `HOSTNAME: "0.0.0.0"`
2. Container não está na rede `proxy` → `server.port` não acha o IP

### Migrate falha com `P1000: Authentication failed`
Senha do PostgreSQL no `.env` não bate com o volume inicializado. Fix:
```bash
docker exec -u postgres opencheck_postgres psql -c "ALTER ROLE postgres WITH PASSWORD 'nova-senha';"
# Depois rodar o migrate novamente
docker compose -f /docker/opencheck/docker-compose.yml run --rm migrate
```

### Rate limit Let's Encrypt (429)
Algum subdomínio com router no Traefik não tem registro DNS. O Traefik tenta obter certificado e falha em loop. Fix: criar o registro DNS no Cloudflare ou remover o router do `docker-compose.yml`.

---

## Configuração atual dos labels Traefik

### Serviço API (padrão de referência — funciona)
```yaml
api:
  networks:
    - internal
    - proxy
  labels:
    - "traefik.enable=true"
    - "traefik.docker.network=proxy"
    - "traefik.http.routers.opencheck-api.rule=Host(`api.opencheck.ggtronic.com.br`)"
    - "traefik.http.routers.opencheck-api.entrypoints=websecure"
    - "traefik.http.routers.opencheck-api.tls.certresolver=letsencrypt"
    - "traefik.http.services.opencheck-api.loadbalancer.server.port=3001"
```

### Serviço Web (com HOSTNAME obrigatório)
```yaml
web:
  environment:
    HOSTNAME: "0.0.0.0"
  healthcheck:
    disable: true
  networks:
    - internal
    - proxy
  labels:
    - "traefik.enable=true"
    - "traefik.docker.network=proxy"
    - "traefik.http.routers.opencheck-web.rule=Host(`opencheck.ggtronic.com.br`)"
    - "traefik.http.routers.opencheck-web.entrypoints=websecure"
    - "traefik.http.routers.opencheck-web.tls.certresolver=letsencrypt"
    - "traefik.http.services.opencheck-web.loadbalancer.server.port=3000"
```
