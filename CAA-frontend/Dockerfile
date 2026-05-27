FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build /app/public/config.template.js /usr/share/nginx/html/config.template.js

RUN apk add --no-cache gettext

RUN printf 'server {\n\
  listen 80;\n\
  server_name _;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf

RUN printf '#!/bin/sh\n\
envsubst < /usr/share/nginx/html/config.template.js > /usr/share/nginx/html/config.js\n\
echo "Config.js generado. Iniciando Nginx..."\n\
exec nginx -g "daemon off;"\n' > /docker-entrypoint-custom.sh && chmod +x /docker-entrypoint-custom.sh

EXPOSE 80

ENTRYPOINT ["/bin/sh", "/docker-entrypoint-custom.sh"]