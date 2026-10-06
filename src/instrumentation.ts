/** Next.js instrumentation: runs once per server process. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startTelemetry } = await import("./platform/telemetry");
  await startTelemetry("flowdeck-web");
  const { logger } = await import("./platform/logger");
  logger.info({ event: "web.started" }, "FlowDeck web started");
}

/** Every uncaught server error (pages, actions, route handlers) is logged once here. */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logger } = await import("./platform/logger");
  logger.error({ event: "request.error", err: error, path: request.path, method: request.method, route: context.routePath, type: context.routeType });
}
