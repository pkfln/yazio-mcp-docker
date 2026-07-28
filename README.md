# Yazio MCP Docker

Runs the unofficial [`yazio-mcp`](https://www.npmjs.com/package/yazio-mcp) server in Docker and exposes it through the [OpenAI Secure MCP Tunnel client](https://github.com/openai/tunnel-client).

## Requirements

- Docker
- A Yazio account (Login through Apple ID / Google won't work, ask support to convert your account to a password-based one if needed)
- OpenAI Platform access
- A ChatGPT account

## 1. Create an OpenAI Secure MCP Tunnel

1. Open [OpenAI Platform Tunnels](https://platform.openai.com/settings/organization/tunnels).
2. Create a tunnel and give it a recognizable name, such as `Yazio MCP Tunnel`.
3. Copy the `tunnel_...` ID.

## 2. Create an API key

1. Open [OpenAI Platform API keys](https://platform.openai.com/settings/organization/api-keys).
2. Create an API key in the same organization as the tunnel with **Tunnels Read + Use** permissions.
3. Copy the key when it is shown.

## 3. Configure the container

Create your local configuration:

```sh
cp .env.example .env
```

Fill in `.env` with the values you copied earlier and your Yazio credentials:

```dotenv
CONTROL_PLANE_TUNNEL_ID=tunnel_...
CONTROL_PLANE_API_KEY=sk-...
YAZIO_USERNAME=you@example.com
YAZIO_PASSWORD=your-password
```

## 4. Start with Docker Compose

Build and start the tunnel and MCP server:

```sh
docker compose up --build -d
```

Follow the logs and wait until the tunnel is connected:

```sh
docker compose logs -f
```

The container must remain running for ChatGPT to discover or call the MCP tools.

## 5. Add the MCP server as a ChatGPT plugin

1. Open [ChatGPT Plugins](https://chatgpt.com/plugins).
2. Select the **+** button to create a new plugin.
3. Enter a name such as `Yazio`.
4. Under **Connection**, select **Tunnel**.
5. Select the tunnel created above. If it is not listed, paste its `tunnel_...` ID.
6. Start a new chat, enable the Yazio app, and try a read-only request such as:

   > Show my nutrition summary for today.

If the tunnel is missing, check that it is associated with the correct ChatGPT workspace, your API key has **Tunnels Read + Use** permissions and the Docker service is running.

## Stop the service

```sh
docker compose down
```

For more details, see OpenAI's [Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).
