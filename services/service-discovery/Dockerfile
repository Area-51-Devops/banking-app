FROM node:18-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --production
COPY src ./src
EXPOSE 3009
CMD ["node", "src/index.js"]
