FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
WORKDIR /srv/review
COPY --chown=node:node server.mjs ./
COPY --chown=node:node publish/index.html publish/view.bin publish/robots.txt publish/_headers ./publish/
COPY --chown=node:node publish/assets/index-*.js publish/assets/index-*.css ./publish/assets/
USER node
RUN node server.mjs --check
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.mjs"]
