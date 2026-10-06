// Mark this process before anything imports the logger.
process.env.FLOWDECK_PROCESS = "worker";
process.env.OTEL_SERVICE_NAME ??= "flowdeck-worker";
await import("./main");

export {};
