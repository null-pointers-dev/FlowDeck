import { config } from "./config";
import { logger } from "./logger";

/** Email through Azure Communication Services. Returns false when email isn't configured. */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const cfg = config.email;
  if (!cfg) return false;
  const { EmailClient } = await import("@azure/communication-email");
  const client = new EmailClient(cfg.connectionString);
  const poller = await client.beginSend({
    senderAddress: cfg.sender,
    content: { subject, plainText: text },
    recipients: { to: [{ address: to }] },
  });
  const result = await poller.pollUntilDone();
  logger.info({ event: "email.sent", status: result.status });
  return true;
}
