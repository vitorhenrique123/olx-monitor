# Builder Stage
FROM node:20 AS builder
WORKDIR /usr/app
COPY ./src ./
RUN npm ci --only=production

# Final Stage
FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
ARG NODE_ENV
WORKDIR /usr/app
COPY --from=builder /usr/app/ ./
EXPOSE 3000
CMD [ "npm", "start" ]
