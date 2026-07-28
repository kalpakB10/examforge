FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm install

COPY . .

RUN npm run db:generate && npm run build

RUN chown -R node:node /app

USER node

EXPOSE 3005

CMD ["node", "dist/index.js"]
