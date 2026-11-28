FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
WORKDIR /srv/demo
COPY --chown=node:node server.mjs index.html ./
USER node
RUN node server.mjs --check
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.mjs"]
