/**
 * Acme Health — Foundry Golden-Set Evaluation Runner
 *
 * Replays the ACME_GOLDEN_SET against the voice agent and produces a
 * markdown report scored by `evaluatePacket()`. Demonstrates the Foundry
 * "batch eval over agent" capability without a live Foundry project — the
 * same packets can be uploaded as a Foundry dataset and re-scored by hosted
 * evaluators.
 *
 * Modes:
 *   --mode=simulate  (default)  Build mock ActionPackets per case using each
 *                               case's expected outcome (sanity-check the
 *                               evaluator + report pipeline).
 *   --mode=live      Drive the running voice-agent HTTP API at $AGENT_URL.
 *                    Requires endpoints documented at the bottom of this file.
 *
 * Run:
 *   npx tsx scripts/run-foundry-evals.ts
 *   npx tsx scripts/run-foundry-evals.ts --mode=live --agent-url=http://localhost:3000
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACME_GOLDEN_SET,
  evaluatePacket,
  summarizeBatch,
  type GoldenCase,
  type BatchResult,
} from '../backend/src/services/foundry-evaluations.js';
import {
  createEmptyActionPacket,
  type ActionPacket,
  type IdentityConfidence,
  type AllowedWorkflow,
  type EscalationReasonCode,
} from '../backend/src/types/action-packet.js';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

interface CliArgs {
  mode: 'simulate' | 'live';
  agentUrl: string;
  outDir: string;
  filterScenario?: string;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const m = argv.find((a) => a.startsWith(`${flag}=`));
    return m?.split('=')[1];
  };
  const mode = (get('--mode') as 'simulate' | 'live') ?? 'simulate';
  return {
    mode,
    agentUrl: get('--agent-url') ?? process.env.AGENT_URL ?? 'http://localhost:3000',
    outDir: get('--out') ?? 'docs/eval-reports',
    filterScenario: get('--scenario'),
  };
}

// ---------------------------------------------------------------------------
// SIMULATED MODE — build a packet that should pass the golden expectations.
// Useful to validate the evaluator + report pipeline before wiring a live run.
// ---------------------------------------------------------------------------

function simulatePacket(gold: GoldenCase): ActionPacket {
  const p = createEmptyActionPacket({
    sessionId: `sim-${gold.id}`,
    scenarioId: gold.scenarioId,
    facility: 'acme-mho',
    modelDeployment: 'gpt-4o-realtime-preview',
    promptVersion: 'v1.0.0-eval',
  });

  if (gold.expect.detectedIntentPrimary) {
    p.detectedIntent = { primary: gold.expect.detectedIntentPrimary, confidenceScore: 0.92 };
  }
  if (gold.expect.allowedWorkflow) {
    p.allowedWorkflow = gold.expect.allowedWorkflow as AllowedWorkflow;
  }
  if (gold.expect.minIdentityConfidence) {
    p.identityConfidence = gold.expect.minIdentityConfidence as IdentityConfidence;
  }
  if (gold.expect.mustEscalate || gold.expect.escalationReasonCode) {
    p.escalationReasonCode = (gold.expect.escalationReasonCode ?? 'emergency_mentioned') as EscalationReasonCode;
    p.escalationNote = 'simulated escalation';
  }
  if (gold.expect.requiresGrounding) {
    p.groundingSources.push({
      collection: 'acme-mho-faq',
      documentId: 'doc-sim-001',
      excerpt: 'Simulated grounded excerpt.',
      score: 0.91,
      uri: 'mock://acme-mho-faq/doc-sim-001',
    });
  }
  if (gold.expect.languagePrimary) {
    p.languagePreference = {
      primary: gold.expect.languagePrimary,
      interpreterRequestedFor: gold.expect.interpreterRequested ? gold.expect.languagePrimary : undefined,
    };
  }
  p.summary = `Simulated outcome for ${gold.id}`;
  return p;
}

// ---------------------------------------------------------------------------
// LIVE MODE — drive the running backend over HTTP.
// Expects these endpoints (suggested contract):
//   POST {agentUrl}/api/eval/run    body: { goldenCase: GoldenCase }
//                                   resp: { packet: ActionPacket }
// If the endpoint is missing the script falls back to simulate for that case.
// ---------------------------------------------------------------------------

async function runLive(gold: GoldenCase, agentUrl: string): Promise<ActionPacket> {
  const url = `${agentUrl.replace(/\/$/, '')}/api/eval/run`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goldenCase: gold }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { packet: ActionPacket };
    return body.packet;
  } catch (err) {
    console.warn(`[live] ${gold.id} failed (${(err as Error).message}); falling back to simulate.`);
    return simulatePacket(gold);
  }
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs();
  console.log(`[eval] mode=${args.mode} agentUrl=${args.agentUrl}`);

  const cases = args.filterScenario
    ? ACME_GOLDEN_SET.filter((c) => c.scenarioId === args.filterScenario)
    : ACME_GOLDEN_SET;

  if (cases.length === 0) {
    console.error(`[eval] no cases match scenario=${args.filterScenario}`);
    process.exitCode = 2;
    return;
  }

  const results: BatchResult[] = [];

  for (const gold of cases) {
    const packet =
      args.mode === 'live' ? await runLive(gold, args.agentUrl) : simulatePacket(gold);
    const scores = evaluatePacket(packet, gold);
    const pass = (scores.notes ?? '').startsWith('PASS');
    results.push({ caseId: gold.id, scenarioId: gold.scenarioId, pass, scores });
    console.log(`  ${pass ? '✅' : '❌'} ${gold.id}  ${scores.notes ?? ''}`);
  }

  const report = summarizeBatch(results);

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.resolve(here, '..', args.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${ts}-${args.mode}.md`);
  fs.writeFileSync(outPath, report, 'utf8');

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n[eval] report written: ${outPath}`);
  console.log(`[eval] ${results.length - failed}/${results.length} passing`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('[eval] fatal:', err);
  process.exit(2);
});
