FROM python:3.12-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libffi-dev && \
    rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY . .

# Create storage dirs
RUN mkdir -p /data /app/jobs_storage

# Non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app /data
USER appuser

ENV DATABASE_URL=sqlite:////data/jobscheduler.db
ENV SCHEDULER_DATABASE_URL=sqlite:////data/scheduler.db
ENV JOBS_STORAGE_DIR=/app/jobs_storage

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
