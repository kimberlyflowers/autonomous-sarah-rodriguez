FROM python:3.11-slim

# Install system deps for Playwright (even though we use Browserless for Chrome,
# browser-use still imports playwright internally)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install playwright browsers/deps — needed for browser-use's internal imports
# even though actual Chrome runs on Browserless
RUN playwright install --with-deps chromium

# Copy app
COPY main.py .

# Railway injects PORT env var
EXPOSE 8080

CMD ["python", "main.py"]
