"""Webhook notification service for job completion events."""
import json
import logging
from datetime import datetime, timezone

import requests

logger = logging.getLogger(__name__)


def send_webhook_notification(
    webhook_url: str,
    job_name: str,
    job_id: str,
    run_id: str,
    status: str,
    exit_code: int | None,
    duration_ms: int | None,
    error_message: str | None = None,
) -> bool:
    """Send a POST request to the configured webhook URL.

    Returns True if the webhook was delivered successfully.
    """
    payload = {
        "event": "job_completed",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "job": {
            "id": job_id,
            "name": job_name,
        },
        "run": {
            "id": run_id,
            "status": status,
            "exit_code": exit_code,
            "duration_ms": duration_ms,
            "error_message": error_message,
        },
    }

    try:
        from app.config import settings as _settings
        resp = requests.post(
            webhook_url,
            json=payload,
            headers={"Content-Type": "application/json", "User-Agent": "JobScheduler/1.0"},
            timeout=10,
            verify=_settings.HTTP_SSL_VERIFY,
        )
        if resp.status_code < 400:
            logger.info(f"Webhook sent to {webhook_url} for job '{job_name}' (status={status})")
            return True
        else:
            logger.warning(
                f"Webhook {webhook_url} returned {resp.status_code}: {resp.text[:200]}"
            )
            return False
    except Exception as e:
        logger.warning(f"Webhook delivery failed for {webhook_url}: {e}")
        return False


def should_notify(notify_on: str, run_status: str) -> bool:
    """Determine whether to send a notification based on config and run status."""
    if notify_on == "none":
        return False
    if notify_on == "both":
        return True
    if notify_on == "failure" and run_status in ("failed",):
        return True
    if notify_on == "success" and run_status in ("success",):
        return True
    return False
