FROM node:20-alpine
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont tzdata
ENV TZ=America/Sao_Paulo
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
WORKDIR /app
COPY package*.json ./
# npm ci: instala EXATAMENTE o que está no package-lock (determinístico). Evita o
# caso em que `npm install` reaproveita node_modules e ignora a versão travada.
RUN npm ci
COPY . .
RUN mkdir -p uploads
EXPOSE 3001
CMD ["node", "src/app.js"]
