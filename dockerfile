# --- ETAPA 1: Construcción (Build) ---
FROM node:20-alpine as builder

WORKDIR /app

# Copiar archivos de configuración
COPY package*.json ./
COPY ui5.yaml ./
# Si tienes ui5-local.yaml no es necesario para producción, pero copiamos todo por si acaso
COPY . .

# Instalar dependencias y construir
RUN npm install
RUN npm run build
# Esto generará una carpeta /app/dist con tu código optimizado

# --- ETAPA 2: Servidor Web (Production) ---
FROM nginx:alpine

# Copiar la configuración de Nginx
COPY nginx.conf /etc/nginx/nginx.conf

# 1. Copiar el código de tu App generado en la etapa anterior
COPY --from=builder /app/dist /usr/share/nginx/html

# Exponer el puerto 80
EXPOSE 80

# Arrancar Nginx
CMD ["nginx", "-g", "daemon off;"]