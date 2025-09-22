# YT-DLP Download and setup
FROM --platform=$BUILDPLATFORM golang:bookworm AS ytdlp_cache
ARG TARGETOS
ARG TARGETARCH
RUN apt update && apt install -y wget
RUN wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp
RUN chmod a+rx /usr/local/bin/yt-dlp

# Backend setup
FROM devopsworks/golang-upx:latest as backend-builder

ENV DEBIAN_FRONTEND noninteractive
WORKDIR /app
COPY ./backend /app
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o whishper . && \
    upx whishper
RUN chmod a+rx whishper

# Frontend setup
FROM node:alpine as frontend
COPY ./frontend /app
WORKDIR /app

FROM frontend AS frontend-prod-deps
RUN npm ci --only=production

FROM frontend AS frontend-build
RUN npm ci
ENV BODY_SIZE_LIMIT=0
RUN npm run build

# Base container
FROM python:3.11-slim as base

RUN export DEBIAN_FRONTEND=noninteractive \
    && apt-get -qq update \
    && apt-get -qq install --no-install-recommends \
    ffmpeg curl nodejs nginx supervisor \
    && rm -rf /var/lib/apt/lists/*

# Python service setup
COPY ./transcription-api /app/transcription
WORKDIR /app/transcription
RUN pip3 install -r requirements.txt
RUN pip3 install python-multipart

# Node.js service setup
ENV BODY_SIZE_LIMIT=0
COPY ./frontend /app/frontend
COPY --from=frontend-build /app/build /app/frontend
COPY --from=frontend-prod-deps /app/node_modules /app/frontend/node_modules

# Golang service setup
COPY --from=backend-builder /app/whishper /bin/whishper 
RUN chmod a+rx /bin/whishper
COPY --from=ytdlp_cache /usr/local/bin/yt-dlp /bin/yt-dlp

# Nginx setup
COPY ./nginx.conf /etc/nginx/nginx.conf

# Set workdir and entrypoint
WORKDIR /app
RUN mkdir /app/uploads

# Cleanup to make the image smaller
RUN apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /usr/share/doc/* ~/.cache /var/cache

COPY ./supervisord.conf /etc/supervisor/conf.d/supervisord.conf
ENTRYPOINT ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]

# Expose ports for each service and Nginx
EXPOSE 8080 3000 5000 80