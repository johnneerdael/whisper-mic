#!/bin/bash

# Whishper Docker Management Script

set -e

IMAGE_NAME="johnneerdael/whishper-mic"
TAG="latest"

case "$1" in
  "build-and-push")
    echo "Building and pushing new image..."
    docker compose -f docker-compose.yml -f docker-compose.dev.yml build whishper
    docker tag whishper-recording-whishper:dev $IMAGE_NAME:$TAG
    docker push $IMAGE_NAME:$TAG
    echo "Image pushed successfully!"
    ;;
  "dev")
    echo "Starting in development mode (builds from source)..."
    docker compose -f docker-compose.yml -f docker-compose.dev.yml down
    docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
    ;;
  "prod")
    echo "Starting in production mode (uses Docker Hub image)..."
    docker compose down
    docker compose up -d
    ;;
  "logs")
    docker logs whishper --tail 20
    ;;
  "status")
    docker compose ps
    ;;
  *)
    echo "Usage: $0 {build-and-push|dev|prod|logs|status}"
    echo ""
    echo "Commands:"
    echo "  build-and-push  - Build new image and push to Docker Hub"
    echo "  dev            - Run in development mode (builds from source)"
    echo "  prod           - Run in production mode (uses Docker Hub image)"
    echo "  logs           - Show recent logs"
    echo "  status         - Show container status"
    exit 1
    ;;
esac