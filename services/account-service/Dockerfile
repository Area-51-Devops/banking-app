FROM node:18-alpine
RUN apk upgrade --no-cache
WORKDIR /usr/src/app
# Context is ./services, so copy paths must be relative to the services/ directory
COPY account-service/package*.json ./
RUN npm cache clean --force && rm -f package-lock.json
RUN npm install --production
RUN npm audit fix --force
COPY account-service/src ./src
COPY shared ./shared
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3002/health/startup || exit 1
CMD ["node", "src/index.js"]



