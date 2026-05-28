FROM node:20-alpine

WORKDIR /app

# Instalar dependencias primero para aprovechar el cache de capas
COPY package*.json ./
RUN npm install --production

# Copiar el resto del código
COPY . .

# Crear carpeta de uploads si no existe
RUN mkdir -p uploads

# El backend corre en el puerto 5000 por defecto
EXPOSE 5000

CMD ["node", "server.js"]
