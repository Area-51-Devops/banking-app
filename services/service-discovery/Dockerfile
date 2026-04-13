FROM node:18-alpine
WORKDIR /usr/src/app
# Context is ./services, so copy paths must be relative to the services/ directory
COPY service-discovery/package*.json ./
RUN npm ci --production
COPY service-discovery/src ./src
COPY shared ./shared
EXPOSE 3009
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3009/health || exit 1
CMD ["node", "src/index.js"]



