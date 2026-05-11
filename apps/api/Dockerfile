FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY server.cjs ./
COPY lib ./lib
COPY migrations ./migrations
COPY scripts ./scripts

RUN npm install --omit=dev

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787

EXPOSE 8787

CMD ["npm", "start"]
