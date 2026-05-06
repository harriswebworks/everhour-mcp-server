# Multi-stage build for stefanskiasan/everhour-mcp-server
# Wraps the stdio MCP server with supergateway behind an Express bearer auth proxy.

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine
WORKDIR /app

# supergateway is the stdio→HTTP wrapper, installed globally so auth-proxy can spawn it
RUN npm install -g supergateway

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./
COPY auth-proxy.js ./

ENV PORT=8080
EXPOSE 8080

CMD ["node", "auth-proxy.js"]
