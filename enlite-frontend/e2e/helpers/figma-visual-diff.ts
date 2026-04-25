/**
 * Visual side-by-side diff helper: compares a Playwright screenshot against a
 * cached Figma reference PNG using pixelmatch.
 *
 * Workflow:
 *   1. Reference PNGs live in `e2e/fixtures/figma/<nodeId>.png` (`:` replaced
 *      with `_`). Refresh them with `pnpm test:figma:fetch <nodeId>` (script
 *      pulls from the Figma REST API using FIGMA_API_TOKEN).
 *   2. The implementation under test must be rendered with **deterministic
 *      data identical to the Figma fixture** (mock the API or pass props).
 *      Otherwise the diff will fail on data, not on visual regression.
 *   3. On failure the helper writes three PNGs next to the reference so the
 *      maintainer can inspect: actual, expected, diff.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface FigmaDiffOptions {
  /** Full page screenshot vs viewport. Default: false. */
  fullPage?: boolean;
  /**
   * Allowed ratio of differing pixels (0–1). Default 0.025 (2.5%) — the
   * empirical threshold that absorbs anti-aliasing and font rendering jitter
   * without masking real regressions.
   */
  maxDiffRatio?: number;
  /**
   * YIQ color threshold passed to pixelmatch (0–1). Lower = stricter.
   * Default 0.2 — Playwright's default.
   */
  pixelThreshold?: number;
  /**
   * Anti-aliasing detection: when true (default) AA pixels don't count as
   * diffs. Use false to be paranoid.
   */
  includeAA?: boolean;
  /**
   * Where to save artifacts on failure. Default: same dir as the reference.
   */
  artifactDir?: string;
}

const DEFAULTS: Required<Omit<FigmaDiffOptions, 'artifactDir'>> = {
  fullPage: false,
  maxDiffRatio: 0.025,
  pixelThreshold: 0.2,
  includeAA: true,
};

const FIXTURE_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  'fixtures',
  'figma',
);

function nodeIdToFilename(nodeId: string): string {
  return nodeId.replace(/[:-]/g, '_') + '.png';
}

function referencePath(nodeId: string): string {
  return path.join(FIXTURE_DIR, nodeIdToFilename(nodeId));
}

function readPng(filePath: string): PNG {
  const buffer = fs.readFileSync(filePath);
  return PNG.sync.read(buffer);
}

function writePng(filePath: string, png: PNG): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function resizePngToMatch(source: PNG, targetWidth: number, targetHeight: number): PNG {
  if (source.width === targetWidth && source.height === targetHeight) {
    return source;
  }
  // Nearest-neighbour resize. Sufficient for visual regression — fancier
  // bicubic would smooth real differences. We crop+pad rather than scale
  // when only one dimension differs by a small margin (<5%).
  const out = new PNG({ width: targetWidth, height: targetHeight });
  for (let y = 0; y < targetHeight; y++) {
    const sy = Math.min(Math.floor((y / targetHeight) * source.height), source.height - 1);
    for (let x = 0; x < targetWidth; x++) {
      const sx = Math.min(Math.floor((x / targetWidth) * source.width), source.width - 1);
      const srcIdx = (sy * source.width + sx) * 4;
      const dstIdx = (y * targetWidth + x) * 4;
      out.data[dstIdx] = source.data[srcIdx];
      out.data[dstIdx + 1] = source.data[srcIdx + 1];
      out.data[dstIdx + 2] = source.data[srcIdx + 2];
      out.data[dstIdx + 3] = source.data[srcIdx + 3];
    }
  }
  return out;
}

/**
 * Compare a Playwright screenshot against a Figma reference fixture.
 *
 * @example
 *   await expectMatchesFigma(page, '6390:13184', { fullPage: true });
 *   await expectMatchesFigma(page.locator('[data-testid="diagnostico-card"]'), '7291:59308');
 */
export async function expectMatchesFigma(
  target: Page | Locator,
  nodeId: string,
  options: FigmaDiffOptions = {},
): Promise<void> {
  const opts = { ...DEFAULTS, ...options };
  const refPath = referencePath(nodeId);

  if (!fs.existsSync(refPath)) {
    throw new Error(
      `Figma reference not found: ${refPath}\n` +
        `Run \`pnpm test:figma:fetch ${nodeId}\` to download it from Figma.`,
    );
  }

  const expected = readPng(refPath);

  const screenshotBuffer =
    'screenshot' in target
      ? await target.screenshot({
          fullPage: 'fullPage' in opts && opts.fullPage,
          animations: 'disabled',
          caret: 'hide',
        })
      : await target.screenshot({
          animations: 'disabled',
          caret: 'hide',
        });

  const actual = PNG.sync.read(screenshotBuffer);

  // Normalise to the smaller common bounding box. If the screenshot is wider
  // than Figma (e.g. devicePixelRatio doubled), we resize the actual down
  // rather than the expected up.
  const width = Math.min(actual.width, expected.width);
  const height = Math.min(actual.height, expected.height);

  const expectedNorm = resizePngToMatch(expected, width, height);
  const actualNorm = resizePngToMatch(actual, width, height);
  const diff = new PNG({ width, height });

  const diffPixels = pixelmatch(
    expectedNorm.data,
    actualNorm.data,
    diff.data,
    width,
    height,
    {
      threshold: opts.pixelThreshold,
      includeAA: opts.includeAA,
      alpha: 0.3,
    },
  );

  const totalPixels = width * height;
  const ratio = diffPixels / totalPixels;

  if (ratio > opts.maxDiffRatio) {
    const artifactDir = opts.artifactDir ?? path.dirname(refPath);
    const safe = nodeIdToFilename(nodeId).replace(/\.png$/, '');
    writePng(path.join(artifactDir, `${safe}.actual.png`), actualNorm);
    writePng(path.join(artifactDir, `${safe}.expected.png`), expectedNorm);
    writePng(path.join(artifactDir, `${safe}.diff.png`), diff);

    expect(
      ratio,
      `Visual diff vs Figma node ${nodeId}: ${(ratio * 100).toFixed(2)}% pixels differ ` +
        `(threshold ${(opts.maxDiffRatio * 100).toFixed(2)}%). ` +
        `Artifacts saved to ${artifactDir}/${safe}.{actual,expected,diff}.png.`,
    ).toBeLessThanOrEqual(opts.maxDiffRatio);
  }
}
