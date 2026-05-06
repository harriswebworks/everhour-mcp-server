# Multi-stage build for stefanskiasan/everhour-mcp-server
# Wraps the stdio MCP server with supergateway to expose HTTP/SSE for Railway.

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine
WORKDIR /app

# Install supergateway globally for the stdio→SSE wrapper
RUN npm install -g supergateway

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./

# Railway provides PORT at runtime; default to 8080 for local testing
ENV PORT=8080
EXPOSE 8080

# supergateway spawns the stdio server and exposes it on /sse
CMD ["sh", "-c", "supergateway --stdio 'node build/index.js' --outputTransport streamableHttp --port ${PORT}"]
