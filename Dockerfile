# StudyPal app: FastAPI + the React reader in one container.
# Stage 1 builds the UI into /static; stage 2 is the Python server that serves it.
FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM python:3.13-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    STUDYPAL_DATA=/data
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py ./
COPY --from=web /static ./static
EXPOSE 8000
# Render sets $PORT.
CMD ["sh", "-c", "exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
