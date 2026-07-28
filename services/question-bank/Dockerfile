FROM node:20-alpine

# Chromium for puppeteer PDF generation
RUN apk add --no-cache \
    openssl \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm install

COPY . .

RUN npm run db:generate && npm run build

# Uploads dir must exist AND be writable by the non-root user; the volume
# mount inherits ownership from the target dir, so pre-chown here.
RUN mkdir -p /app/uploads/question-images && chown -R node:node /app

USER node

EXPOSE 3001

CMD ["node", "dist/index.js"]
