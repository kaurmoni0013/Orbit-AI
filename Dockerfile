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

ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "index.js"]
