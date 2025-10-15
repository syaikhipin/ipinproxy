FROM node:18-alpine

WORKDIR /app

# Copy source code (zero dependencies, no npm install needed)
COPY server.js .
COPY database.js .
COPY package.json .
COPY public ./public

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

USER nodejs

# Expose port (Render uses PORT env var, default 3000)
EXPOSE 3000

# Health check (uses PORT env var or defaults to 3000)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const port = process.env.PORT || 3000; require('http').get('http://localhost:' + port + '/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start server
CMD ["npm", "start"]
