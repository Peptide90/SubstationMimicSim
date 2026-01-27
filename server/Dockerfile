FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY index.ts tsconfig.json ./

ENV MP_SERVER_PORT=3001
EXPOSE 3001

CMD ["npx", "tsx", "index.ts"]
