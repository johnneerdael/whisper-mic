# Whishper Docker Management Script for Windows

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("build-and-push", "dev", "prod", "logs", "status")]
    [string]$Action
)

$IMAGE_NAME = "johnneerdael/whishper-mic"
$TAG = "latest"

switch ($Action) {
    "build-and-push" {
        Write-Host "Building and pushing new image..." -ForegroundColor Green
        docker compose -f docker-compose.yml -f docker-compose.dev.yml build whishper
        docker tag whishper-recording-whishper:dev "${IMAGE_NAME}:${TAG}"
        docker push "${IMAGE_NAME}:${TAG}"
        Write-Host "Image pushed successfully!" -ForegroundColor Green
    }
    "dev" {
        Write-Host "Starting in development mode (builds from source)..." -ForegroundColor Yellow
        docker compose -f docker-compose.yml -f docker-compose.dev.yml down
        docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
    }
    "prod" {
        Write-Host "Starting in production mode (uses Docker Hub image)..." -ForegroundColor Cyan
        docker compose down
        docker compose up -d
    }
    "logs" {
        docker logs whishper --tail 20
    }
    "status" {
        docker compose ps
    }
}