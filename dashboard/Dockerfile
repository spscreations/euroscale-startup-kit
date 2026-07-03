FROM node:24-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_BASE_URL=http://91.99.187.108:30081
ARG NEXT_PUBLIC_RPC_BASE_URL=http://91.99.187.108:30081
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_RPC_BASE_URL=$NEXT_PUBLIC_RPC_BASE_URL
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/next.config.ts ./next.config.ts
EXPOSE 3000
CMD ["npm", "run", "start"]
