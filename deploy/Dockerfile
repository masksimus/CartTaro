FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

# There are no external npm dependencies; copy only the backend, not the
# live mini-app, its history, or any development credentials.
COPY --chown=node:node server/ /app/server/

# Named volume /data is owned by the unprivileged runtime user.
RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 8787
CMD ["node", "server/src/main.mjs"]
