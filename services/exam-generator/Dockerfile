FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm install

COPY . .

RUN npm run db:generate && npm run build

# exam-generator writes PDFs into a mounted volume; pre-chown so the volume
# takes on node ownership when it's first created.
RUN mkdir -p /app/uploads/exam-papers && chown -R node:node /app

USER node

EXPOSE 3002

CMD ["node", "dist/index.js"]
