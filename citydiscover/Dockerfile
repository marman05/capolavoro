FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
ENV NODE_ENV=production PORT=8080 CD_DB_FILE=/data/citydiscover.db
VOLUME /data
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "server/server.js"]
