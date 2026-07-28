FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

# Install deps as root; drop privileges before running the app.
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install

COPY . .

RUN npm run db:generate && npm run build

# Own the app dir with the built-in `node` user (uid 1000) so it can write
# to any runtime paths (logs, prisma cache) without needing to shell out.
RUN chown -R node:node /app
USER node

EXPOSE 3000

# Migrations are now run by the dedicated `migrator` service before this
# starts (see docker-compose.yml). This CMD only launches the app.
CMD ["node", "dist/index.js"]
