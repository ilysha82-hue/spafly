# --- build: клиент (vite) ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --legacy-peer-deps --no-audit --no-fund
COPY . .
RUN npx vite build

# --- runtime: node + ws, раздаёт dist и держит WebSocket /ws ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
RUN npm init -y >/dev/null && npm install ws@8 --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
EXPOSE 8080
USER node
CMD ["node", "server/index.mjs"]
