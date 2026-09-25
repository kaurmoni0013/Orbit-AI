FROM node:22-alpine AS client

WORKDIR /build
COPY client/package*.json ./
RUN npm ci
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
COPY client/ ./
RUN npm run build


FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node app.js index.js ./
COPY --chown=node:node config ./config
COPY --chown=node:node middlewares ./middlewares
COPY --chown=node:node model ./model
COPY --chown=node:node routes ./routes
COPY --chown=node:node service ./service
COPY --chown=node:node utils ./utils
COPY --chown=node:node validators ./validators
COPY --from=client --chown=node:node /build/dist ./client-dist

ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "index.js"]
