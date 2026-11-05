// Usage: pnpm hash-password
// Prompts for the dashboard password and prints the line to put into .env.
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { hashPassword } from "../auth/password.js";

const muted = new Writable({
  write(_chunk, _enc, cb) {
    cb();
  },
});

process.stdout.write("Dashboard password (min. 8 characters): ");
const rl = createInterface({ input: process.stdin, output: muted, terminal: true });
rl.question("", (pw) => {
  rl.close();
  process.stdout.write("\n");
  if (pw.length < 8) {
    console.error("Password too short.");
    process.exit(1);
  }
  // Single quotes keep dotenv from expanding the $ signs.
  console.log(`\nAdd this line to .env:\n\nDASHBOARD_PASSWORD_HASH='${hashPassword(pw)}'\n`);
});
