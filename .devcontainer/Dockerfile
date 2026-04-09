FROM node:24
RUN corepack enable
RUN apt-get update && apt-get install -y --no-install-recommends \
  chromium \
  ripgrep \
  && rm -rf /var/lib/apt/lists/*

USER node
# Create directories before volumes are mounted to them, so that the
# ownership will be correct.
RUN mkdir ~/.vscode-server
# Allow npm install packages with --global without sudo.
RUN mkdir ~/.npm-global \
  && npm config set -L user prefix ~/.npm-global
# Add typical tool binary locations to PATH.
ENV PATH="$PATH:/home/node/.local/bin:/home/node/.npm-global/bin"
