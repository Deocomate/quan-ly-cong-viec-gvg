# Trung tâm điều hành — một container: server Node phục vụ bản dựng React + API + CSDL nhúng + việc chạy nền.
# Toàn bộ dữ liệu (CSDL, tệp đính kèm, bản sao lưu) nằm trong /data — hãy gắn volume vào đó.
FROM node:24-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=web /app/dist ./dist
COPY package.json ./
COPY server ./server
RUN rm -f server/*.test.ts && rm -rf server/tests && mkdir -p /data && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "server/index.mjs"]
