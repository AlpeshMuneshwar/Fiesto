# ============================================
# Stage 1: Build
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code and config
COPY . .

# Set environment variable for build time.
# Leave API_URL empty to use same-origin proxying via nginx on the VPS.
ARG API_URL=
ENV EXPO_PUBLIC_API_URL=${API_URL}

# Export web build
RUN npx expo export --platform web

# ============================================
# Stage 2: Production
# ============================================
FROM nginx:alpine AS production

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy exported web app from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Ship Android APK downloads with the landing page
COPY downloads /usr/share/nginx/html/downloads

# Expose port (Internal 80)
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
