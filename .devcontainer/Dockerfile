FROM node:18-alpine
RUN npm --global install pnpm
RUN apk add --no-cache \
  chromium \
  git \
  openssh \
  ripgrep
USER node
ENV CHROME_BIN=chromium-browser
