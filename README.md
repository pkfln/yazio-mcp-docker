# YAZIO MCP server

This repository contains an MCP server for the community-documented YAZIO v15 API.

The server uses the official TypeScript MCP SDK, exposes the standard stdio transport used by the OpenAI Secure MCP Tunnel, and can also run as a Streamable HTTP endpoint for local MCP clients.

## Requirements

- Bun 1.4.2 or newer (or Docker)
- A YAZIO account with an email/password login
- An MCP-compatible client
- OpenAI Platform access only when using the Secure MCP Tunnel deployment

Apple/Google-only YAZIO accounts may need to be converted to password login by YAZIO support.

## Run locally with Bun

```sh
bun install
cp .env.example .env
# edit .env and set YAZIO_USERNAME and YAZIO_PASSWORD
bun run dev
```

For a local stdio MCP client, use a configuration like:

```json
{
  "mcpServers": {
    "yazio": {
      "command": "bun",
      "args": ["/absolute/path/to/yazio-mcp-docker/src/index.ts"],
      "env": {
        "YAZIO_USERNAME": "you@example.com",
        "YAZIO_PASSWORD": "your-password"
      }
    }
  }
}
```

The server verifies the YAZIO login with `GET /user` before it exposes an MCP transport. Missing or invalid credentials make startup fail with a nonzero exit status, so a tunnel reports the failure instead of appearing healthy with unusable tools.

The API client refreshes OAuth tokens proactively before their expiry and retries
each API request once with a refreshed token when YAZIO returns `401 Unauthorized`.
This also covers diary mutations: the original request body is replayed with the
new token. Refresh-token rotation is preserved when YAZIO omits the token from a
refresh response; if a refresh token is rejected, configured username/password
credentials are used as a fallback.

## Temporary Docker dev container

When Docker is more convenient than a local Bun install, run:

```sh
./scripts/test-dev-docker.sh
```

The same commands are available through Bun:

```sh
bun run dev:docker
bun run test:docker
```

The script builds the repository's tunnel-enabled image, passes the local
`.env` file to `tunnel-client`, and runs the MCP server through the OpenAI
Secure MCP Tunnel. Press Ctrl-C to stop the tunnel; `--rm` removes the
temporary container automatically. Re-run the script after source changes so
the image is rebuilt. Set `ENV_FILE` or `IMAGE_TAG` to override the defaults.
Use `bun test` for local unit tests; `dev:docker` and `test:docker` are
tunnel-backed smoke-test aliases.

## Build and test

```sh
bun run typecheck
bun test
bun run build
bun run start
```

The build produces `dist/index.js`, bundled for Bun.

## Streamable HTTP mode

stdio is the default. To run an HTTP endpoint directly:

```sh
MCP_TRANSPORT=http MCP_HOST=127.0.0.1 MCP_PORT=3000 bun run src/index.ts
```

The endpoint is `http://127.0.0.1:3000/mcp`. `MCP_ALLOWED_HOSTS` and `MCP_ALLOWED_ORIGINS` can be set to restrict host/origin values. The default localhost binding and origin checks are intentional MCP DNS-rebinding protections.

## OpenAI Secure MCP Tunnel with Docker

1. Create a tunnel in [OpenAI Platform Tunnels](https://platform.openai.com/settings/organization/tunnels) and copy its `tunnel_...` ID.
2. Create a runtime API key in the same organization with **Tunnels Read + Use** permissions.
3. Configure the container:

   ```sh
   cp .env.example .env
   ```

   Set these values in `.env`:

   ```dotenv
   CONTROL_PLANE_TUNNEL_ID=tunnel_...
   CONTROL_PLANE_API_KEY=sk-...
   YAZIO_USERNAME=you@example.com
   YAZIO_PASSWORD=your-password
   ```

4. Start the tunnel and MCP server:

   ```sh
   docker compose up --build -d
   docker compose logs -f
   ```

The image builds the server with Bun and configures `tunnel-client` to launch the bundled MCP command over stdio. Keep the container running while ChatGPT or another tunnel client uses the connector.

## Available MCP tools

| Tool | Purpose |
| --- | --- |
| `get_user` | User profile and preferences |
| `get_user_consumed_items` | Diary entries for a date |
| `get_user_daily_summary` | Nutrition totals and goals for a date |
| `get_user_water_intake` | Cumulative water intake for a date |
| `get_user_weight` | Latest weight on or before a date |
| `get_user_exercises` | Training entries for a date |
| `get_user_goals` | Calorie, macro, water, step, and weight goals |
| `get_user_settings` | Tracker and reminder settings |
| `get_user_dietary_preferences` | Dietary restriction |
| `get_user_suggested_products` | Suggested products for a meal slot |
| `search_products` | Search the YAZIO food database |
| `get_product` | Full product and serving details |
| `add_user_consumed_item` | Add a product to the diary |
| `remove_user_consumed_item` | Delete a diary entry by consumed-item ID |
| `add_user_water_intake` | Submit a new cumulative water total |

The three prompts `add_food_item`, `remove_food_item`, and `add_water_intake` guide clients through the safe multi-step flows.
