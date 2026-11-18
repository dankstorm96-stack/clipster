FROM node:22-bookworm-slim

# ffmpeg (with libass for captions), the caption font, and yt-dlp for link imports
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core python3 python3-pip ca-certificates \
 && pip3 install --no-cache-dir --break-system-packages "yt-dlp[default]" \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "npx next start -p ${PORT:-3000}"]
