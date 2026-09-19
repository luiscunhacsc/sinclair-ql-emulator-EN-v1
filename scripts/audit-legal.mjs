import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const manifest = await readJson("legal/asset-provenance.json");
const review = await readJson("legal/publication-review.json");
const issues = [];
const known = new Set();
for (const asset of manifest.assets) {
  if (!/^assets\/[a-zA-Z0-9/_-]+\.png$/.test(asset.path)) throw new Error("Invalid asset path in legal inventory.");
  known.add(asset.path);
  const bytes = await readFile(new URL(asset.path, root));
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== asset.sha256) issues.push(`${asset.path}: conteúdo alterado desde a revisão.`);
  if (asset.status !== "cleared" || !asset.license || !asset.evidence?.length) {
    issues.push(`${asset.path}: direitos/proveniência por documentar.`);
  }
}
async function checkAssets(path) {
  for (const entry of await readdir(new URL(path, root), { withFileTypes: true })) {
    const child = `${path}${entry.name}`;
    if (entry.isDirectory()) await checkAssets(`${child}/`);
    else if (!known.has(child) && child !== "assets/PROVENANCE.md") issues.push(`${child}: recurso não inventariado.`);
  }
}
await checkAssets("assets/");
for (const item of review.items) {
  if (!["cleared", "mitigated"].includes(item.status)) issues.push(`${item.id}: ${item.reason}`);
  if (!item.evidence || item.evidence.includes("..") || /^[\\/]|:/.test(item.evidence)) throw new Error("Invalid review evidence path.");
  await readFile(new URL(item.evidence, root));
}
console.log("Revisão de publicação — inventário e pendências; não é uma certificação jurídica.");
if (issues.length) {
  for (const issue of issues) console.error(`PENDENTE: ${issue}`);
  process.exitCode = 1;
} else {
  console.log("Sem pendências declaradas no inventário. Validar evidências e âmbito com o responsável jurídico.");
}
