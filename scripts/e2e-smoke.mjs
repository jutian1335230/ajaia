// Browser smoke test of the main user flows against a running server.
// Usage: npm start (in another terminal), then
//   E2E_BASE_URL=http://localhost:3001 npm run e2e
// Uses an installed Edge/Chrome via playwright-core (E2E_BROWSER=chrome|msedge),
// so no browser download is needed. Screenshots go to docs/screenshots.
import fs from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3001";
const SHOTS = "docs/screenshots";
fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ channel: process.env.E2E_BROWSER ?? "msedge", headless: true });
const step = (m) => console.log("✓", m);

async function loginAs(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
  await page.goto(BASE);
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page.getByText("My documents").waitFor();
  return page;
}

// Alice: create, rename, format, autosave, reload
const alice = await loginAs("Alice Chen");
await alice.screenshot({ path: `${SHOTS}/01-dashboard.png` });
step("alice dashboard");

await alice.getByRole("button", { name: "+ New document" }).click();
await alice.waitForURL(/\/docs\/\d+/);
const docUrl = alice.url();
const title = alice.getByLabel("Document title");
await title.fill("Launch plan");
await title.press("Enter");

const editor = alice.locator(".ProseMirror");
await editor.click();
await alice.getByLabel("Text style").selectOption("h1");
await alice.keyboard.type("Launch plan");
await alice.keyboard.press("Enter");
await alice.keyboard.type("This is ");
await alice.keyboard.press("Control+b");
await alice.keyboard.type("bold");
await alice.keyboard.press("Control+b");
await alice.keyboard.type(", ");
await alice.keyboard.press("Control+i");
await alice.keyboard.type("italic");
await alice.keyboard.press("Control+i");
await alice.keyboard.type(" and ");
await alice.keyboard.press("Control+u");
await alice.keyboard.type("underlined");
await alice.keyboard.press("Control+u");
await alice.keyboard.press("Enter");
await alice.getByRole("button", { name: "Bulleted list" }).click();
await alice.keyboard.type("First bullet");
await alice.keyboard.press("Enter");
await alice.keyboard.type("Second bullet");
await alice.keyboard.press("Enter");
await alice.keyboard.press("Enter");
await alice.getByRole("button", { name: "Numbered list" }).click();
await alice.keyboard.type("Step one");
await alice.getByText(/^Saved/).waitFor({ timeout: 5000 });
step("autosaved");
await alice.screenshot({ path: `${SHOTS}/02-editor.png` });

await alice.reload();
await alice.locator(".ProseMirror h1").waitFor();
const html = await alice.locator(".ProseMirror").innerHTML();
for (const frag of ["<h1>Launch plan</h1>", "<strong>bold</strong>", "<em>italic</em>", "<u>underlined</u>", "<ul>", "<ol>"]) {
  if (!html.includes(frag)) throw new Error(`missing after reload: ${frag}\n${html}`);
}
if ((await alice.getByLabel("Document title").inputValue()) !== "Launch plan") throw new Error("title not persisted");
step("formatting + title persisted after reload");

// Share with Carol as viewer
await alice.getByRole("button", { name: /^Share/ }).click();
await alice.getByPlaceholder("Add people by email").fill("carol@ajaia.test");
await alice.getByLabel("Access level", { exact: true }).selectOption("viewer");
await alice.getByRole("dialog").getByRole("button", { name: "Share", exact: true }).click();
await alice.locator(".share-list").getByText("Carol Singh").waitFor();
await alice.getByPlaceholder("Add people by email").fill("nobody@ajaia.test");
await alice.getByRole("dialog").getByRole("button", { name: "Share", exact: true }).click();
await alice.getByText("No user found with email nobody@ajaia.test").waitFor();
await alice.getByPlaceholder("Add people by email").fill("");
await alice.screenshot({ path: `${SHOTS}/03-share-dialog.png` });
await alice.getByRole("button", { name: "Done" }).click();
step("shared with carol (viewer), unknown email rejected");

// Carol: sees it under Shared with me, view-only
const carol = await loginAs("Carol Singh");
const sharedSection = carol.locator(".doc-section", { hasText: "Shared with me" });
await sharedSection.getByText("Launch plan").waitFor();
await sharedSection.getByText("View only").waitFor();
await carol.screenshot({ path: `${SHOTS}/04-shared-with-me.png` });
await sharedSection.getByText("Launch plan").click();
await carol.getByText("You have view-only access").waitFor();
if (await carol.locator(".toolbar").count()) throw new Error("viewer should not see toolbar");
if ((await carol.locator(".ProseMirror").getAttribute("contenteditable")) !== "false") throw new Error("viewer editor is editable");
await carol.screenshot({ path: `${SHOTS}/05-viewer.png` });
step("carol view-only");

await alice.locator(".ProseMirror").click();
await alice.keyboard.press("Control+End");
await alice.keyboard.press("Enter");
await alice.keyboard.type("Added after sharing");
await alice.getByText(/^Saved/).waitFor({ timeout: 5000 });
await carol.locator(".ProseMirror", { hasText: "Added after sharing" }).waitFor({ timeout: 10000 });
step("viewer sees owner's new edits without reloading");

// Bob: cannot open Alice's doc by URL
const bob = await loginAs("Bob Martinez");
await bob.getByText("Welcome to Ajaia Docs").waitFor();
await bob.goto(docUrl);
await bob.getByRole("heading", { name: "Document not found" }).waitFor();
step("bob blocked from unshared doc");

// Bob opens the seeded doc he can edit, imports a markdown file into it
await bob.goto(BASE);
await bob.locator(".doc-section", { hasText: "Shared with me" }).getByText("Welcome to Ajaia Docs").click();
await bob.getByText(/Can edit · shared by Alice Chen/).waitFor();
await bob.locator(".ProseMirror").click();
await bob.keyboard.press("Control+End");
await bob.locator('input[type="file"]').setInputFiles({
  name: "notes.md",
  mimeType: "text/markdown",
  buffer: Buffer.from("## Imported section\n\n- from **markdown**\n"),
});
await bob.locator(".ProseMirror h2", { hasText: "Imported section" }).waitFor();
await bob.getByText(/^Saved/).waitFor({ timeout: 5000 });
step("bob inserted markdown file into shared doc");

// Conflict: Alice opens the same doc, Bob saves a newer version, Alice's stale save is rejected
const welcomeUrl = bob.url();
await alice.goto(welcomeUrl);
await alice.locator(".ProseMirror h1").waitFor();
await bob.locator(".ProseMirror").click();
await bob.keyboard.press("Control+End");
await bob.keyboard.type(" Bob was here.");
await bob.getByText(/^Saved/).waitFor({ timeout: 5000 });
await alice.locator(".ProseMirror").click();
await alice.keyboard.press("Control+End");
await alice.keyboard.type(" Alice too.");
await alice.getByText(/changed by someone else/).waitFor({ timeout: 5000 });
if ((await alice.locator(".ProseMirror").getAttribute("contenteditable")) !== "false") throw new Error("editor should lock on conflict");
if (await alice.locator(".toolbar").count()) throw new Error("toolbar should hide on conflict");
const reloadBox = await alice.getByRole("button", { name: "Reload" }).boundingBox();
if (!reloadBox || reloadBox.y < 0 || reloadBox.y > 860) throw new Error("conflict banner should stay in view");
await alice.screenshot({ path: `${SHOTS}/06-conflict.png` });
await alice.getByRole("button", { name: "Reload" }).click();
await alice.locator(".ProseMirror", { hasText: "Bob was here." }).waitFor();
step("stale save rejected with conflict banner; reload shows the newer version");

// Empty title reverts instead of saving
await alice.goto(docUrl);
const titleInput = alice.getByLabel("Document title");
await titleInput.fill("   ");
await titleInput.press("Enter");
if ((await titleInput.inputValue()) !== "Launch plan") throw new Error("empty title should revert");
step("empty title reverts");

// Export to Markdown
const [download] = await Promise.all([
  alice.waitForEvent("download"),
  alice.getByRole("button", { name: "Export .md" }).click(),
]);
const md = fs.readFileSync(await download.path(), "utf8");
if (download.suggestedFilename() !== "Launch plan.md" || !md.includes("# Launch plan") || !md.includes("**bold**")) {
  throw new Error(`unexpected export: ${download.suggestedFilename()}\n${md}`);
}
step("markdown export");

// Revoke Carol's access
await alice.getByRole("button", { name: /^Share/ }).click();
await alice.getByRole("button", { name: "Remove Carol Singh" }).click();
await alice.locator(".share-list").getByText("Carol Singh").waitFor({ state: "detached" });
await alice.getByRole("button", { name: "Done" }).click();
await carol.reload();
await carol.getByRole("heading", { name: "Document not found" }).waitFor();
step("revoked viewer loses access");

// Owner deletes the document
await alice.goto(BASE);
alice.once("dialog", (d) => d.accept());
const myDocs = alice.locator(".doc-section", { hasText: "My documents" });
await myDocs.getByRole("button", { name: "Delete Launch plan" }).click();
await myDocs.getByText("Launch plan").waitFor({ state: "detached" });
await alice.reload();
await alice.getByText("My documents").waitFor();
if (await myDocs.getByText("Launch plan").count()) throw new Error("deleted doc came back after reload");
step("owner deletes document");

await browser.close();
console.log("ALL E2E CHECKS PASSED");

