import { describe, expect, it, vi } from "vitest";
import {
  AlertChannel,
  AlertDispatcher,
  AlertSeverity,
  createAlert,
  WebhookAlertChannel,
} from "#observability/alerts.js";

describe("createAlert", () => {
  it("shapes an alert and timestamps it via the injected clock", () => {
    const alert = createAlert(
      {
        severity: AlertSeverity.CRITICAL,
        title: "Grid kill switch triggered",
        message: "max loss breached",
        context: { tradingSymbol: "CRUDEOIL25DECFUT" },
      },
      () => "2026-09-11T09:15:00.000Z",
    );

    expect(alert).toEqual({
      severity: AlertSeverity.CRITICAL,
      title: "Grid kill switch triggered",
      message: "max loss breached",
      context: { tradingSymbol: "CRUDEOIL25DECFUT" },
      raisedAt: "2026-09-11T09:15:00.000Z",
    });
  });
});

describe("AlertChannel", () => {
  it("throws on send when not implemented", async () => {
    await expect(new AlertChannel().send({})).rejects.toThrow("not implemented");
  });
});

describe("WebhookAlertChannel", () => {
  it("posts the alert as JSON to the configured URL", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    const channel = new WebhookAlertChannel({ webhookUrl: "https://example.com/hook", fetchImpl });
    const alert = { severity: AlertSeverity.WARNING, title: "t", message: "m", context: {}, raisedAt: "x" };

    await channel.send(alert);

    expect(fetchImpl).toHaveBeenCalledWith("https://example.com/hook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alert),
    });
  });

  it("throws when the webhook responds with a non-ok status", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 }));
    const channel = new WebhookAlertChannel({ webhookUrl: "https://example.com/hook", fetchImpl });

    await expect(channel.send({})).rejects.toThrow("status 500");
  });
});

describe("AlertDispatcher", () => {
  it("sends the alert to every channel", async () => {
    const channelA = { send: vi.fn(async () => {}) };
    const channelB = { send: vi.fn(async () => {}) };
    const dispatcher = new AlertDispatcher({ channels: [channelA, channelB] });
    const alert = { title: "t" };

    await dispatcher.dispatch(alert);

    expect(channelA.send).toHaveBeenCalledWith(alert);
    expect(channelB.send).toHaveBeenCalledWith(alert);
  });

  it("logs and continues when one channel fails, without blocking the others", async () => {
    const failingChannel = {
      send: vi.fn(async () => {
        throw new Error("webhook down");
      }),
    };
    const workingChannel = { send: vi.fn(async () => {}) };
    const logger = { error: vi.fn() };
    const dispatcher = new AlertDispatcher({ channels: [failingChannel, workingChannel], logger });
    const alert = { title: "t" };

    await dispatcher.dispatch(alert);

    expect(logger.error).toHaveBeenCalledWith(
      "alert channel failed to send",
      expect.objectContaining({ alert }),
    );
    expect(workingChannel.send).toHaveBeenCalledWith(alert);
  });
});
