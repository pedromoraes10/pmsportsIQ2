FROM node:20

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Instala o Chromium e todas as dependências de sistema necessárias para o Playwright.
# Isso aumenta o tamanho da imagem mas é necessário para o scraping sem bloqueio.
RUN npx playwright install --with-deps chromium

COPY . .

# Diretório de dados — em produção, monte um volume persistente aqui
# (ex: Railway Volume, Render Disk) e aponte OGOL_DATA_DIR para ele.
RUN mkdir -p /app/output
ENV OGOL_DATA_DIR=/app/output

EXPOSE 3001
CMD ["node", "server.js"]
