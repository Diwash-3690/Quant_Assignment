export const AlertSeverity = Object.freeze({
  INFO: "INFO",
  WARNING: "WARNING",
  CRITICAL: "CRITICAL",
});

export function createAlert({ severity, title, message, context }, clock = () => new Date().toISOString()) {
  return { severity, title, message, context, raisedAt: clock() };
}

export class AlertChannel {
  async send(alert) {
    throw new Error("send() not implemented");
  }
}

export class WebhookAlertChannel extends AlertChannel {
  constructor({ webhookUrl, fetchImpl = fetch }) {
    super();
    this.webhookUrl = webhookUrl;
    this.fetchImpl = fetchImpl;
  }

  async send(alert) {
    const response = await this.fetchImpl(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alert),
    });
    if (!response.ok) {
      throw new Error(`alert webhook responded with status ${response.status}`);
    }
  }
}

export class AlertDispatcher {
  constructor({ channels, logger = console }) {
    this.channels = channels;
    this.logger = logger;
  }

  async dispatch(alert) {
    for (const channel of this.channels) {
      try {
        await channel.send(alert);
      } catch (error) {
        this.logger.error("alert channel failed to send", { error, alert });
      }
    }
  }
}
