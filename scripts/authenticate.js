import "dotenv/config";
import { createInterface } from "node:readline/promises";
import KiteConnectPkg from "kiteconnect";
import { buildLoginUrl, KiteSessionManager } from "#broker/kite/session.js";

const { KiteConnect } = KiteConnectPkg;

async function main() {
  const apiKey = process.env.KITE_API_KEY;
  const apiSecret = process.env.KITE_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("set KITE_API_KEY and KITE_API_SECRET before running this script");
  }

  console.log("Visit this URL, log in, and copy the request_token from the redirected URL:");
  console.log(buildLoginUrl(apiKey));

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const requestToken = (await rl.question("Paste the request_token here: ")).trim();
  rl.close();

  const kite = new KiteConnect({ api_key: apiKey });
  const sessionManager = new KiteSessionManager({ kite });
  const session = await sessionManager.generateSession(requestToken, apiSecret);

  console.log("");
  console.log("Success. Put this in your .env as KITE_ACCESS_TOKEN:");
  console.log(session.accessToken);
  console.log(`Logged in as user: ${session.userId}`);
}

main().catch((error) => {
  console.error("authentication failed:", error);
  process.exitCode = 1;
});
