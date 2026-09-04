"""Foundry tracing helper.

Set ENABLE_FOUNDRY_TRACING=true and call enable_foundry_tracing() at the top
of a lab notebook to send every chat-completion / embedding call to Azure
Application Insights, which then shows up in the Microsoft Foundry portal
under your project's Tracing tab.

Idempotent: safe to call from every notebook even if you re-run the cell.
"""
from __future__ import annotations

import os
import logging

_ENABLED = False  # module-level guard so re-running cells doesn't double-instrument


def enable_foundry_tracing(service_name: str | None = None) -> bool:
    """Wire OpenTelemetry -> Application Insights -> Foundry Tracing tab.

    Returns True if tracing is now enabled, False if skipped.

    The default service name is derived from the CLIENT_SLUG env var (set via
    /config/client.config.json) so traces are grouped per client.
    """
    global _ENABLED
    if service_name is None:
        slug = os.environ.get("CLIENT_SLUG", "client")
        service_name = f"{slug}-fine-tuning-lab"
    if _ENABLED:
        print(f"[tracing] already enabled (service={service_name}) - skipping.")
        return True

    tracing_enabled = os.environ.get("ENABLE_FOUNDRY_TRACING", "false").lower()
    if tracing_enabled not in {"1", "true", "yes"}:
        print("[tracing] disabled (set ENABLE_FOUNDRY_TRACING=true to enable).")
        return False

    conn = os.environ.get("APPLICATIONINSIGHTS_CONNECTION_STRING")
    if not conn:
        print("[tracing] APPLICATIONINSIGHTS_CONNECTION_STRING not set - tracing disabled.")
        return False

    # 1) Configure Azure Monitor exporter (sends spans/metrics/logs to App Insights).
    os.environ["OTEL_SERVICE_NAME"] = service_name
    # Capture prompt/response content on spans so Foundry can render them.
    capture_mode = os.environ.get("OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT", "true")
    if capture_mode.lower() in {"true", "false"}:
        os.environ["OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT"] = (
            "SPAN_AND_EVENT" if capture_mode.lower() == "true" else "NO_CONTENT"
        )

    try:
        from azure.monitor.opentelemetry import configure_azure_monitor
        from opentelemetry.instrumentation.openai_v2 import OpenAIInstrumentor
    except ModuleNotFoundError as error:
        print(
            "[tracing] optional tracing SDKs are not installed - tracing disabled. "
            "Run: pip install -r requirements.txt"
        )
        print(f"[tracing] missing module: {error.name}")
        return False

    configure_azure_monitor(
        connection_string=conn,
        logger_name=service_name,
        disable_logging=True,
        disable_metrics=True,
        disable_offline_storage=True,
    )

    # 2) Auto-instrument OpenAI SDK so every chat completion becomes a span.
    OpenAIInstrumentor().instrument()

    # Quiet down the noisy uploader logs.
    logging.getLogger("azure.monitor.opentelemetry.exporter").setLevel(logging.WARNING)
    logging.getLogger("azure.core.pipeline.policies.http_logging_policy").setLevel(logging.WARNING)

    _ENABLED = True
    print(f"[tracing] enabled. Service name : {service_name}")
    print(f"[tracing] Open Foundry portal -> your project -> Tracing tab")
    print(f"[tracing] (also visible under App Insights: appi-foundry-labs)")
    return True
