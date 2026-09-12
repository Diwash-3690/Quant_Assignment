import "dotenv/config";
import pg from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  
  const pool = new pg.Pool({
    connectionString: connectionString,
  });

  const urlObj = new URL(connectionString);

  console.log("resolved connection target:");
  console.log({
    host: urlObj.hostname,
    port: parseInt(urlObj.port || "5432", 10),
    database: urlObj.pathname.split("/")[1],
    user: urlObj.username,
    passwordLoaded: Boolean(urlObj.password),
    passwordLength: urlObj.password?.length ?? 0,
  });

  const result = await pool.query("SELECT current_user, current_database(), now()");
  console.log("connected successfully:");
  console.log(result.rows[0]);

  await pool.end();
}

main().catch((error) => {
  console.error("connection check failed:", error.message);
  process.exitCode = 1;
});
