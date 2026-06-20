# CI/CD setup

This backend follows the same high-level flow as `chatmenow-be`:

1. Run CI on `main` and `prod`
2. Build and push Docker image to GHCR
3. Deploy to server over SSH

## Files added

- `.github/workflows/ci-cd.yml`
- `Dockerfile`
- `.dockerignore`

## Branch behavior

- `main` -> build image tag `dev-latest` -> deploy container `photo-gallery-manager-be-dev`
- `prod` -> build image tag `prod-latest` -> deploy container `photo-gallery-manager-be-prod`

## Required GitHub secrets

- `SSH_HOST`
- `SSH_PORT`
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `GHCR_TOKEN`

`GHCR_TOKEN` should have permission to pull packages from `ghcr.io`.

## Remote server structure

Create these folders on the target server:

- `$HOME/photo-gallery-manager-be-dev`
- `$HOME/photo-gallery-manager-be-prod`

Put a `.env` file inside each folder.

Examples:

- `$HOME/photo-gallery-manager-be-dev/.env`
- `$HOME/photo-gallery-manager-be-prod/.env`

## Required runtime env vars

- `PORT`
- `FRONTEND_URL`
- `DATABASE_URL`
- `JWT_SECRET`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `S3_BUCKET_NAME`

Recommended extras:

- `JWT_EXPIRES_IN`
- `JWT_REMEMBER_EXPIRES_IN`
- `JWT_REMEMBER_SECRET`
- `API_KEY`

`API_KEY` chỉ cần nếu bạn tự thêm middleware bảo vệ kiểu `x-api-key` giống `chatmenow-be`.

## Notes

- The workflow only deploys the backend container. MongoDB and S3 are expected to be managed separately.
- If your GHCR namespace is different, adjust the image naming logic in `.github/workflows/ci-cd.yml`.
