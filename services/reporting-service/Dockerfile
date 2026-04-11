FROM node:18-alpine
WORKDIR /usr/src/app
# Context is ./services, so copy paths must be relative to the services/ directory
COPY reporting-service/package*.json ./
RUN npm install --production
COPY reporting-service/src ./src
COPY shared ./shared
EXPOSE 3010
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3010/health/startup || exit 1
CMD ["node", "src/index.js"]



