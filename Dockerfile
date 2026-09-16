# Immagine del client VisionCaption: build Vite servita da nginx, che fa anche
# da ponte verso il server sul WebSocket. Il client si collega sempre allo
# stesso host della pagina, quindi front-end e WebSocket devono uscire dalla
# stessa porta: è nginx a mandare /ws/vision al server.
FROM node:24-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM nginx:1.29-alpine AS runtime

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Dove sta il server. In compose è il nome del servizio; fuori da compose si
# sovrascrive con -e VISION_SERVER=host:porta.
ENV VISION_SERVER=server:8765

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
