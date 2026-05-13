# Bun 1.x on Alpine for the smallest production image.
# Drop-in replacement for the previous Node 22 image — Bun runs Express/Mongoose/bcrypt
# unchanged via its Node compatibility layer.
FROM oven/bun:1-alpine

WORKDIR /usr/src/app

# Copy manifest + lockfile first so Docker can cache the install layer.
# bun.lock is Bun 1.3+ JSON lockfile (older builds used bun.lockb); we accept either.
COPY package.json bun.lock* bun.lockb* package-lock.json* ./

# --frozen-lockfile errors out if the lockfile is stale instead of silently mutating it.
# --production skips devDependencies (mocha, chai, nodemon, mongodb-memory-server).
RUN bun install --frozen-lockfile --production

# Copy app source after deps so source edits don't bust the install cache.
COPY . .

# Non-root user — the base image's default `bun` user has UID 1000; we use a named
# system user to match the previous Node image's posture and own the logs dir.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && mkdir -p logs && chown -R appuser:appgroup logs

USER appuser

ENV NODE_ENV=production

EXPOSE 3000

# `bun app.js` runs the entrypoint directly — no `bun run` indirection needed.
CMD ["bun", "app.js"]
