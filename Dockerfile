FROM golang:1.26.2-alpine AS tunnel-builder
RUN CGO_ENABLED=0 go install github.com/openai/tunnel-client/cmd/client@v0.0.10

FROM oven/bun:1.4.2-alpine AS app-builder
WORKDIR /app
COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile
COPY src ./src
RUN bun run build

FROM oven/bun:1.4.2-alpine
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=app-builder /app/dist ./dist
COPY --from=tunnel-builder /go/bin/client /usr/local/bin/tunnel-client

# tunnel-client v0.0.10 supports MCP_COMMAND and forwards stdio MCP frames.
ENV MCP_COMMAND="bun /app/dist/index.js"

USER bun

ENTRYPOINT ["tunnel-client", "run"]
