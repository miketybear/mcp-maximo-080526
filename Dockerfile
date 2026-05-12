# --- Stage 1: Builder ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json tsconfig.json ./

# Install all dependencies (including devDependencies to compile TS)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Compile TypeScript to JavaScript
RUN npm run build


# --- Stage 2: Runner ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy dependency manifests
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy compiled JavaScript from builder
COPY --from=builder /app/dist ./dist

# Run as a non-root user for security
USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]
