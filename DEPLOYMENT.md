# Deployment

Deploys the Investment Plan stack to a Linux VM running Docker, coexisting with
your existing Minecraft container.

## What gets deployed

| Subdomain                       | Container        | Port (internal) | Purpose                       |
| ------------------------------- | ---------------- | --------------- | ----------------------------- |
| `invest.example.com`            | `invplan-web`    | 80              | React SPA (served by nginx)   |
| `api.invest.example.com`        | `invplan-api`    | 3000            | NestJS REST API (`/api/v1/*`) |
| `auth.invest.example.com`       | `invplan-api`    | 3000            | SuperTokens (`/auth/*`)       |
| `minecraft.example.com`         | *(unchanged)*    | 25565           | Your existing MC server       |

Caddy on the VM owns ports 80 and 443. It terminates TLS (auto Let's Encrypt)
and reverse-proxies to the internal containers over a private Docker network.
Minecraft is not behind Caddy — the MC client connects directly to port 25565
on the same IP.

Persistent state lives in three named docker volumes that are never destroyed
by re-deploys:

- `invplan_pgdata`     — Postgres (profiles, holdings, reports, sessions)
- `invplan_caddy_data` — Let's Encrypt certs and ACME state
- `invplan_caddy_config` — Caddy runtime config

---

## 1. DNS

Replace `example.com` below with your real apex domain. All four records point
at the same VM IP (substitute `<YOUR_VM_IP>` below):

```
Type   Name                        Value             TTL
A      minecraft                   <YOUR_VM_IP>      60     # already exists, if any
A      invest                      <YOUR_VM_IP>      300
A      api.invest                  <YOUR_VM_IP>      300
A      auth.invest                 <YOUR_VM_IP>      300
```

> If your DNS provider supports it, a single wildcard record
> `A   *.invest   <YOUR_VM_IP>` works too — Caddy will obtain a wildcard cert
> automatically on first request and you won't need to touch DNS again when you
> add more sub-subdomains. Otherwise stick with the three explicit records.

After propagation (usually <5 min), verify:

```sh
dig +short invest.example.com
dig +short api.invest.example.com
dig +short auth.invest.example.com
# All three should return your VM's public IP.
```

Make sure **ports 80 and 443 are open** on the VM's firewall / security group.
Caddy needs port 80 for the ACME HTTP-01 challenge and 443 for HTTPS itself.
Port 25565 stays open for Minecraft as before.

---

## 2. First deploy

From your laptop, in the repo root:

```sh
npm run deploy:ssh root@&lt;YOUR_VM_IP&gt;
```

The script `rsync`s the repo to `~/invest-app` on the VM and tries to start
docker. **On first run** it will detect that `deploy/.env` doesn't exist, copy
`deploy/.env.example` over as a starting point, and exit with instructions.

SSH in and fill in real values:

```sh
ssh root@&lt;YOUR_VM_IP&gt;
cd ~/invest-app/deploy
vi .env
```

Required edits in `.env`:

- `WEB_HOST`, `API_HOST`, `AUTH_HOST` — your three subdomains
- `COOKIE_DOMAIN` — leading dot + apex of the invest subdomain
  (e.g. `.invest.example.com`)
- `ACME_EMAIL` — your email (used by Let's Encrypt)
- `POSTGRES_PASSWORD` — `openssl rand -hex 32`
- `SUPERTOKENS_API_KEY` — `openssl rand -hex 32`
- `API_KEY_ENCRYPTION_KEY` — `openssl rand -hex 32`

Then re-run from your laptop:

```sh
npm run deploy:ssh root@&lt;YOUR_VM_IP&gt;
```

This time the script will:

1. rsync the source again,
2. build the `api` and `web` images on the VM,
3. run Liquibase migrations (one-shot container),
4. bring up postgres / supertokens / api / web / caddy,
5. print `docker compose ps`.

Caddy will request certificates from Let's Encrypt the first time each
subdomain receives a request. You can watch the logs to confirm:

```sh
ssh root@&lt;YOUR_VM_IP&gt; 'docker logs -f invplan-caddy'
```

Visit `https://invest.example.com` — you should land on the marketing home,
and `/auth` should serve the SuperTokens sign-in UI.

---

## 3. Subsequent deploys

Just re-run from your laptop:

```sh
npm run deploy:ssh root@&lt;YOUR_VM_IP&gt;
```

It's idempotent and **never touches the named volumes**, so the database
contents survive. New Liquibase changesets get applied automatically.

If you ever need a hard reset of just the application containers (without
losing data), SSH in and:

```sh
cd ~/invest-app
docker compose --env-file deploy/.env -f deploy/docker-compose.prod.yml down
docker compose --env-file deploy/.env -f deploy/docker-compose.prod.yml up -d
```

To wipe the DB (destructive!) you'd run `docker volume rm invplan_pgdata` —
do not do this unless you really mean it.

---

## 4. Coexisting with the Minecraft stack

The compose project name is pinned to `invplan` (see `name:` at the top of
`deploy/docker-compose.prod.yml`), and all containers / networks / volumes are
prefixed accordingly. So `docker compose` commands run from the Minecraft
compose dir won't affect the invest stack and vice-versa.

The only shared host resources are:

- **Ports 80 and 443** — owned by `invplan-caddy`. If your Minecraft compose
  also binds 80/443 (it usually doesn't), you'll need to either stop that
  binding or route Minecraft web endpoints through Caddy too.
- **Port 25565** — owned by the Minecraft container. Untouched.

---

## 5. Optional overrides

The `deploy:ssh` script honors these env vars (set them inline before the npm
command):

```sh
REMOTE_DIR=~/apps/invest \
SSH_OPTS="-p 2222 -i ~/.ssh/my_key" \
npm run deploy:ssh deploy@&lt;YOUR_VM_IP&gt;
```

| Var            | Default              | Notes                                    |
| -------------- | -------------------- | ---------------------------------------- |
| `REMOTE_USER`  | `$USER`              | Used only when the arg is bare host name |
| `REMOTE_DIR`   | `~/invest-app`       | Where the repo is rsynced on the VM      |
| `COMPOSE_FILE` | `deploy/docker-compose.prod.yml` | Override for staging variants |
| `SSH_OPTS`     | *(empty)*            | Extra flags for `ssh` and `rsync -e ssh` |
