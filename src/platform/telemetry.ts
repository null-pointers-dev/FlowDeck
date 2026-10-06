import { logger } from "./logger";

let started = false;

/** Starts OpenTelemetry → Application Insights when a connection string is set. Safe to call twice. */
export async function startTelemetry(serviceName: string) {
  if (started) return;
  started = true;
  process.env.OTEL_SERVICE_NAME ??= serviceName;
  const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  if (!connectionString) {
    logger.info({ event: "telemetry.disabled" }, "No Application Insights connection string; logging to stdout only");
    return;
  }
  const { useAzureMonitor } = await import("@azure/monitor-opentelemetry");
  useAzureMonitor({ azureMonitorExporterOptions: { connectionString } });
  logger.info({ event: "telemetry.started" }, "OpenTelemetry exporting to Application Insights");
}
