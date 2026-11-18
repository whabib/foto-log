# syntax=docker/dockerfile:1

# Docker Hardened Images (the free Community tier, from dhi.io; pulling needs
# a `docker login dhi.io`). The -dev variant has a shell and npm, for
# building. The runtime variant has neither and runs as a non-root user.
# Tags rather than digests, so every build picks up the latest patched base.
ARG NODE_TAG=24-alpine3.23

FROM dhi.io/node:${NODE_TAG}-dev AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dhi.io/node:${NODE_TAG}-dev AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM dhi.io/node:${NODE_TAG} AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=8080
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/drizzle ./drizzle
EXPOSE 8080
# Set both, since the hardened image's own entrypoint differs from the official one's.
ENTRYPOINT ["node"]
CMD ["server.js"]
