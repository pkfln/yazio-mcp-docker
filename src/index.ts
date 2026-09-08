#!/usr/bin/env bun

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createYazioMcpServer, SERVER_NAME, SERVER_VERSION } from "./server";
import { verifyYazioLogin } from "./startup";
import { YazioApiClient } from "./yazio-api";

async function runStdio(): Promise<void> {
  const api = new YazioApiClient();
  await verifyYazioLogin(api);
  console.error("YAZIO login verified");

  const server = createYazioMcpServer(api);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} ${SERVER_VERSION} running on stdio`);

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

function allowedOrigins(host: string, port: number): Set<string> {
  const configured = (process.env.MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.length > 0) return new Set(configured);
  return new Set([`http://${host}:${port}`, `http://localhost:${port}`, `http://127.0.0.1:${port}`]);
}

async function runHttp(): Promise<void> {
  const host = process.env.MCP_HOST ?? "127.0.0.1";
  const port = Number(process.env.MCP_PORT ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("MCP_PORT must be an integer from 1 to 65535");

  const api = new YazioApiClient();
  await verifyYazioLogin(api);
  console.error("YAZIO login verified");

  const hosts = (process.env.MCP_ALLOWED_HOSTS ?? host).split(",").map((value) => value.trim()).filter(Boolean);
  const allowedHostHeaders = hosts.flatMap((value) => [value, `${value}:${port}`]);
  const origins = allowedOrigins(host, port);

  const listener = Bun.serve({
    hostname: host,
    port,
    fetch: async (request) => {
      const url = new URL(request.url);
      if (url.pathname !== "/mcp") return new Response("Not found", { status: 404 });

      const origin = request.headers.get("origin");
      if (origin && !origins.has(origin)) return Response.json({ error: "Forbidden origin" }, { status: 403 });

      const server = createYazioMcpServer(api);
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
        allowedHosts: allowedHostHeaders,
        allowedOrigins: [...origins],
        enableDnsRebindingProtection: true,
      });
      try {
        await server.connect(transport);
        return await transport.handleRequest(request);
      } catch (error) {
        console.error("MCP HTTP request failed:", error);
        return Response.json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null }, { status: 500 });
      } finally {
        await transport.close();
        await server.close();
      }
    },
  });
  console.error(`${SERVER_NAME} ${SERVER_VERSION} listening on http://${host}:${port}/mcp`);
  const shutdown = () => {
    listener.stop(true);
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

async function main(): Promise<void> {
  if ((process.env.MCP_TRANSPORT ?? "stdio").toLowerCase() === "http") {
    await runHttp();
  } else {
    await runStdio();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
