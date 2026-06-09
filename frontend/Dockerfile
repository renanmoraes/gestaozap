FROM node:20-alpine
RUN apk add --no-cache tzdata
ENV TZ=America/Sao_Paulo
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
