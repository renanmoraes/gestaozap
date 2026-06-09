# Estágio 1: build da SPA
FROM node:20-alpine AS build
RUN apk add --no-cache tzdata
ENV TZ=America/Sao_Paulo
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Estágio 2: nginx servindo arquivos estáticos + proxy /api
FROM nginx:1.27-alpine
RUN apk add --no-cache tzdata
ENV TZ=America/Sao_Paulo
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3002
CMD ["nginx", "-g", "daemon off;"]
