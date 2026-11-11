import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { openDatabase } from "./db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.resolve(here, "../../client/dist");

const db = openDatabase();
const app = createApp(db, { staticDir });
const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log(`Ajaia Docs listening on http://localhost:${port}`);
});
