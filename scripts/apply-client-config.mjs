#!/usr/bin/env node
/**
 * apply-client-config.mjs
 *
 * Propagates /config/client.config.json (the single source of truth for
 * white-label customization) into the app and labs:
 *
 *   - frontend/src/styles/globals.css   -> brand color CSS variables (:root)
 *   - frontend/.env.local               -> VITE_BRAND_* values
 *   - frontend/index.html               -> <title> + description
 *   - backend/.env                      -> BRAND_* + AZURE_* (key-by-key upsert)
 *   - fine-tuning/.env                  -> CLIENT_* + AZURE_* (key-by-key upsert)
 *
 * Env files are upserted key-by-key so existing secrets are preserved.
 *
 * Usage:
 *   node scripts/apply-client-config.mjs          # apply
 *   node scripts/apply-client-config.mjs --check  # validate only, no writes
 *
 * Dependency-free (Node >= 20 built-ins only).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const CHECK = process.argv.includes('--check');

const VOICE_AGENT_DIR = join(repoRoot, 'examples', 'voice-agent');
const CONFIG_PATH = join(repoRoot, 'config', 'client.config.json');
const EXAMPLE_PATH = join(repoRoot, 'config', 'client.config.example.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(msg) {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  process.exit(1);
}

function info(msg) {
  console.log(`  ${msg}`);
}

/** Convert "#RRGGBB" -> "r g b" (space-separated channel triplet). */
function hexToRgbTriplet(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) fail(`Invalid hex color: "${hex}" (expected #RRGGBB)`);
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Upsert KEY=value lines into an existing dotenv-style file, preserving the rest. */
function upsertEnv(filePath, updates) {
  let lines = existsSync(filePath)
    ? readFileSync(filePath, 'utf8').split(/\r?\n/)
    : [];
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=`);
    const idx = lines.findIndex((l) => re.test(l));
    const line = `${key}=${value}`;
    if (idx >= 0) lines[idx] = line;
    else lines.push(line);
  }
  // Trim trailing blank lines, ensure single trailing newline.
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.join('\n') + '\n';
}

function write(filePath, content, label) {
  if (CHECK) {
    info(`would update ${label}`);
    return;
  }
  writeFileSync(filePath, content, 'utf8');
  info(`updated ${label}`);
}

// ---------------------------------------------------------------------------
// Load + validate config
// ---------------------------------------------------------------------------

if (!existsSync(CONFIG_PATH)) {
  fail(
    `Missing config/client.config.json.\n` +
      `  Copy the template first:\n` +
      `    cp config/client.config.example.json config/client.config.json\n` +
      `  (template: ${EXAMPLE_PATH})`,
  );
}

let cfg;
try {
  cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  fail(`config/client.config.json is not valid JSON: ${e.message}`);
}

const client = cfg.client ?? {};
const brand = cfg.brand ?? {};
const colors = brand.colors ?? {};
const azure = cfg.azure ?? {};
const deployments = cfg.deployments ?? {};

for (const [path, val] of [
  ['client.slug', client.slug],
  ['client.name', client.name],
  ['brand.productName', brand.productName],
]) {
  if (!val) fail(`Required field "${path}" is missing in client.config.json`);
}

console.log(`\nApplying client config: \x1b[36m${client.name}\x1b[0m (${client.slug})`);
if (CHECK) console.log('(check mode — no files will be written)\n');

// ---------------------------------------------------------------------------
// 1) Frontend brand CSS variables
// ---------------------------------------------------------------------------

const cssPath = join(VOICE_AGENT_DIR, 'frontend', 'src', 'styles', 'globals.css');
if (existsSync(cssPath)) {
  const css = readFileSync(cssPath, 'utf8');
  const triplets = {
    '--brand-primary': colors.primary,
    '--brand-secondary': colors.secondary,
    '--brand-accent': colors.accent,
    '--brand-success': colors.success,
    '--brand-warning': colors.warning,
    '--brand-error': colors.error,
  };
  let next = css;
  for (const [name, hex] of Object.entries(triplets)) {
    if (!hex) continue;
    const rgb = hexToRgbTriplet(hex);
    const re = new RegExp(`(${name}:\\s*)[^;]*;[^\\n]*`);
    if (re.test(next)) {
      next = next.replace(re, `$1${rgb}; /* ${hex} */`);
    }
  }
  if (next !== css) write(cssPath, next, 'frontend/src/styles/globals.css (brand colors)');
  else info('frontend brand colors already up to date');
}

// ---------------------------------------------------------------------------
// 2) Frontend .env.local (VITE_BRAND_*)
// ---------------------------------------------------------------------------

const feEnvPath = join(VOICE_AGENT_DIR, 'frontend', '.env.local');
const feEnv = upsertEnv(feEnvPath, {
  VITE_BRAND_ORG_NAME: client.name,
  VITE_BRAND_SHORT_NAME: client.shortName ?? client.name,
  VITE_BRAND_PRODUCT_NAME: brand.productName,
  VITE_BRAND_ASSISTANT_NAME: brand.assistantName ?? `${client.shortName ?? client.name} Assistant`,
  VITE_BRAND_COORDINATOR_LABEL: `${client.shortName ?? client.name} Coordinator`,
});
write(feEnvPath, feEnv, 'frontend/.env.local');

// ---------------------------------------------------------------------------
// 3) Frontend index.html (title + description)
// ---------------------------------------------------------------------------

const htmlPath = join(VOICE_AGENT_DIR, 'frontend', 'index.html');
if (existsSync(htmlPath)) {
  let html = readFileSync(htmlPath, 'utf8');
  const title = brand.productName;
  const desc = `${client.name} — ${brand.tagline ?? 'Enterprise voice agent'}`;
  html = html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(
      /(<meta name="description" content=")[^"]*(")/,
      `$1${desc}$2`,
    );
  write(htmlPath, html, 'frontend/index.html (title + description)');
}

// ---------------------------------------------------------------------------
// 4) Backend .env (BRAND_* + AZURE_*)
// ---------------------------------------------------------------------------

const beEnvPath = join(VOICE_AGENT_DIR, 'backend', '.env');
const beEnv = upsertEnv(beEnvPath, {
  BRAND_ORG_NAME: client.name,
  BRAND_SHORT_NAME: client.shortName ?? client.name,
  BRAND_PRODUCT_NAME: brand.productName,
  BRAND_ASSISTANT_NAME: brand.assistantName ?? `${client.shortName ?? client.name} Assistant`,
  BRAND_INDUSTRY: client.industry ?? 'healthcare',
  BRAND_SUPPORT_PHONE: client.supportPhone ?? '',
  BRAND_SUPPORT_URL: client.supportUrl ?? '',
  ...(azure.subscriptionId ? { AZURE_SUBSCRIPTION_ID: azure.subscriptionId } : {}),
  ...(azure.tenantId ? { AZURE_TENANT_ID: azure.tenantId } : {}),
  ...(azure.resourceGroup ? { AZURE_RESOURCE_GROUP: azure.resourceGroup } : {}),
  ...(azure.foundryResourceName ? { AZURE_RESOURCE_NAME: azure.foundryResourceName } : {}),
});
write(beEnvPath, beEnv, 'backend/.env (branding + Azure)');

// ---------------------------------------------------------------------------
// 5) Fine-tuning .env (CLIENT_* + AZURE_*)
// ---------------------------------------------------------------------------

const ftEnvPath = join(repoRoot, 'fine-tuning', '.env');
const ftEnv = upsertEnv(ftEnvPath, {
  CLIENT_SLUG: client.slug,
  CLIENT_NAME: client.name,
  ...(azure.subscriptionId ? { AZURE_SUBSCRIPTION_ID: azure.subscriptionId } : {}),
  ...(azure.tenantId ? { AZURE_TENANT_ID: azure.tenantId } : {}),
  ...(azure.resourceGroup ? { AZURE_RESOURCE_GROUP: azure.resourceGroup } : {}),
  ...(azure.foundryResourceName ? { AZURE_RESOURCE_NAME: azure.foundryResourceName } : {}),
  ...(deployments.finetunePrefix ? { FINETUNE_PREFIX: deployments.finetunePrefix } : {}),
});
write(ftEnvPath, ftEnv, 'fine-tuning/.env (client + Azure)');

console.log(
  CHECK
    ? '\n\x1b[32m✓ Config is valid.\x1b[0m Run `npm run apply:config` to write changes.\n'
    : '\n\x1b[32m✓ Client config applied.\x1b[0m Restart dev servers to pick up new env values.\n',
);
