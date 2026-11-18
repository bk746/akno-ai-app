# Akno voice-bridge — à construire DEPUIS LA RACINE du projet (le prompt vient de src/lib/voice/script.ts) :
#   docker build -f voice-bridge/Dockerfile -t akno-voice-bridge .
FROM node:22-slim AS build
WORKDIR /app
COPY src/lib/voice/script.ts src/lib/voice/receptionist.ts src/lib/voice/
COPY src/lib/tarifs.ts src/lib/phone.ts src/lib/
COPY voice-bridge/package.json voice-bridge/package-lock.json* voice-bridge/
RUN cd voice-bridge && npm install --no-audit --no-fund
COPY voice-bridge/src voice-bridge/src
RUN cd voice-bridge && npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/voice-bridge/node_modules ./node_modules
COPY --from=build /app/voice-bridge/build/server.mjs ./server.mjs
EXPOSE 8080
CMD ["node", "server.mjs"]
