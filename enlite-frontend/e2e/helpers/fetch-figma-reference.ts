/**
 * Fetch a Figma node screenshot via the Figma REST API and cache it under
 * `e2e/fixtures/figma/<nodeId>.png` for use by `expectMatchesFigma`.
 *
 * Usage:
 *   FIGMA_API_TOKEN=xxxxx pnpm test:figma:fetch <fileKey> <nodeId>...
 *
 * Defaults FILE_KEY to the App EnLite Pro file when only nodeIds are passed:
 *   FIGMA_API_TOKEN=xxxxx pnpm test:figma:fetch 6390:13184 5808:13866
 *
 * Generate a personal access token at https://www.figma.com/developers/api#access-tokens
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const DEFAULT_FILE_KEY = '6weibfyKiLH2VWWcxcIRiA';
const FIXTURE_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  'fixtures',
  'figma',
);

function nodeIdToFilename(nodeId: string): string {
  return nodeId.replace(/[:-]/g, '_') + '.png';
}

function isNodeId(s: string): boolean {
  return /^\d+[:-]\d+$/.test(s);
}

async function fetchScreenshot(token: string, fileKey: string, nodeId: string, scale: number) {
  const figmaNodeId = nodeId.replace(/-/g, ':');
  const url =
    `https://api.figma.com/v1/images/${fileKey}` +
    `?ids=${encodeURIComponent(figmaNodeId)}&format=png&scale=${scale}`;

  const headers = { 'X-Figma-Token': token };
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Figma API ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as { err?: string; images: Record<string, string | null> };
  if (body.err) {
    throw new Error(`Figma API error: ${body.err}`);
  }
  const imgUrl = body.images[figmaNodeId];
  if (!imgUrl) {
    throw new Error(`No image returned for node ${figmaNodeId}`);
  }

  const imgRes = await fetch(imgUrl);
  if (!imgRes.ok) {
    throw new Error(`Image download ${imgRes.status} from ${imgUrl}`);
  }
  return Buffer.from(await imgRes.arrayBuffer());
}

async function main(): Promise<void> {
  const token = process.env.FIGMA_API_TOKEN;
  if (!token) {
    console.error('ERROR: FIGMA_API_TOKEN env var not set.');
    console.error('Generate one at https://www.figma.com/developers/api#access-tokens');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: pnpm test:figma:fetch [fileKey] <nodeId>...');
    process.exit(1);
  }

  let fileKey = DEFAULT_FILE_KEY;
  let nodeIds = args;
  if (!isNodeId(args[0])) {
    fileKey = args[0];
    nodeIds = args.slice(1);
  }
  if (nodeIds.length === 0) {
    console.error('No node IDs provided.');
    process.exit(1);
  }

  const scale = Number(process.env.FIGMA_SCALE ?? '2');
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });

  for (const nodeId of nodeIds) {
    const outFile = path.join(FIXTURE_DIR, nodeIdToFilename(nodeId));
    process.stdout.write(`Fetching ${nodeId} (scale=${scale}) → ${outFile} ... `);
    try {
      const buffer = await fetchScreenshot(token, fileKey, nodeId, scale);
      fs.writeFileSync(outFile, buffer);
      console.log(`✓ ${(buffer.length / 1024).toFixed(1)} KB`);
    } catch (err) {
      console.log(`✗`);
      console.error(`  ${err instanceof Error ? err.message : err}`);
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
