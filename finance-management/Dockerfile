# Use specific Node.js 22 Alpine version for smaller footprint
FROM node:22.4.0-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files first to leverage Docker cache on dependency installs
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy app source code
COPY . .

# Create non-root user and group for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Ensure logs directory exists and is writable by container user (adjust if logs directory is different)
RUN mkdir -p logs && chown -R appuser:appgroup logs

# Use non-root user
USER appuser

# Set NODE_ENV to production for optimizations
ENV NODE_ENV=production

# Expose port that your Express app listens on
EXPOSE 3000

# Use npm start command from package.json to start app
CMD ["npm", "start"]
