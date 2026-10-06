import pino from "pino";
import { trace } from "@opentelemetry/api";

/**
 * Structured JSON to stdout. No pino transports (they use worker threads that bundlers
 * and serverless runtimes break); App Service collects stdout into Log Analytics, and
 * Application Insights links lines to traces through traceId.
 *
 * Log only at the choke points: the action wrapper, the job wrapper, outbound clients.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: process.env.OTEL_SERVICE_NAME ?? (process.env.FLOWDECK_PROCESS === "worker" ? "flowdeck-worker" : "flowdeck-web") },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  redact: {
    paths: ["token", "*.token", "secret", "*.secret", "privateKey", "*.privateKey", "authorization", "*.authorization", "cookie", "*.cookie", "inputs.*password*"],
    censor: "[redacted]",
  },
  mixin() {
    const span = trace.getActiveSpan();
    return span ? { traceId: span.spanContext().traceId } : {};
  },
});

export type Logger = pino.Logger;
