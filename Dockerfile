FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install --registry https://registry.npmmirror.com
COPY . .
RUN npm run build

FROM nginx:alpine

RUN apk add --no-cache nodejs npm

COPY --from=builder /app/dist /usr/share/nginx/html
COPY server /app/server
COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN cd /app/server && npm install --registry https://registry.npmmirror.com

EXPOSE 80
CMD sh -c "cd /app/server && node server.js & nginx -g 'daemon off;'"
