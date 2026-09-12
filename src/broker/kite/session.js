export function buildLoginUrl(apiKey) {
  return `https://kite.zerodha.com/connect/login?api_key=${encodeURIComponent(apiKey)}&v=3`;
}

export class KiteSessionManager {
  constructor({ kite }) {
    this.kite = kite;
  }

  async generateSession(requestToken, apiSecret) {
    const session = await this.kite.generateSession(requestToken, apiSecret);
    if (!session.access_token) {
      throw new Error("kite session response did not include an access token");
    }
    return {
      accessToken: session.access_token,
      userId: session.user_id,
      loginTime: session.login_time,
    };
  }
}
