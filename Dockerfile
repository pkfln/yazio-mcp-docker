FROM golang:1.26.2-alpine AS tunnel-builder
RUN CGO_ENABLED=0 go install github.com/openai/tunnel-client/cmd/client@v0.0.10


FROM node:22-alpine
RUN npm install --global yazio-mcp && npm cache clean --force
COPY --from=tunnel-builder /go/bin/client /usr/local/bin/tunnel-client

ENV MCP_COMMAND=/usr/local/bin/yazio-mcp

USER node

ENTRYPOINT ["tunnel-client", "run"]
