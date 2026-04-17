# ---- Build stage ----
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm install
COPY . .
RUN npm run build
#hellosj

# ---- Runtime stage ------
FROM nginx:alpine
RUN apk upgrade --no-cache
WORKDIR /usr/share/nginx/html

# Copy build output (Vite: dist ; CRA: build)
COPY --from=build /app/dist ./

# Nginx config for SPA and API proxying
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
