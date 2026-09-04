# ============================================================================
# Voice Agent - Frontend Dockerfile
# Enterprise Voice Agent (white-label template)
# ============================================================================

# Build stage
# Note: using Debian-based image instead of alpine; musl libc + newer Linux
# kernels with 5-level page tables cause esbuild's Go runtime to crash with
# "lfstack.push invalid packing" during vite build.
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build arguments for environment variables
ARG VITE_WS_URL
ARG VITE_API_URL

# Set environment variables for build
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_API_URL=$VITE_API_URL

# Workaround for esbuild Go runtime crash (lfstack.push invalid packing)
# seen on newer kernels with 5-level page tables. Force esbuild to skip
# its worker threads and bound Node memory.
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Build the application
RUN npm run build

# Production stage - Using nginx for serving static files
FROM nginx:alpine AS production

# Add labels for metadata
LABEL org.opencontainers.image.title="Voice Agent Frontend"
LABEL org.opencontainers.image.description="Enterprise Voice Agent Frontend"
LABEL org.opencontainers.image.version="1.0.0"

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built static files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Create non-root user
RUN addgroup -g 1001 -S nginx-user && \
    adduser -S nginx-user -u 1001 -G nginx-user && \
    chown -R nginx-user:nginx-user /var/cache/nginx && \
    chown -R nginx-user:nginx-user /var/log/nginx && \
    chown -R nginx-user:nginx-user /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx-user:nginx-user /var/run/nginx.pid && \
    chown -R nginx-user:nginx-user /usr/share/nginx/html

# Switch to non-root user
USER nginx-user

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
