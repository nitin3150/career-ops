#!/usr/bin/env node

/**
 * filter-by-date-parallel.mjs — Filter batch-input.tsv by posting date (PARALLEL VERSION)
 *
 * Filters job postings to only include those posted within past 3 days.
 * Uses parallel browser contexts for speed.
 * Today: 2026-04-22, Range: 2026-04-19 to 2026-04-22
 *
 * Usage: node filter-by-date-parallel.mjs
 */

import { chromium } from 'playwright';
import { readFile, writeFile } from 'fs/promises';

const CONCURRENCY = 10; // Number of parallel browser contexts
const TODAY = new Date('2026-04-22');
const MIN_DATE = new Date('2026-04-19');
const MAX_DATE = new Date('2026-04-22');

function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function isWithinRange(date) {
  if (!date) return false;
  return date >= MIN_DATE && date <= MAX_DATE;
}

async function extractDatePosted(page, url) {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    if (response?.status() === 404 || response?.status() === 410) {
      return { date: null, status: 'expired', reason: `HTTP ${response.status()}` };
    }

    await page.waitForTimeout(1500);

    const datePosted = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);
          if (Array.isArray(data)) {
            for (const item of data) {
              if (item.datePosted) return item.datePosted;
            }
          }
          if (data.datePosted) return data.datePosted;
        } catch (e) {
          // continue
        }
      }
      return null;
    });

    const parsedDate = parseDate(datePosted);

    if (!parsedDate) {
      return { date: null, status: 'unknown', reason: 'no datePosted found' };
    }

    if (isWithinRange(parsedDate)) {
      return { date: parsedDate.toISOString().split('T')[0], status: 'keep', reason: 'within 3 days' };
    } else {
      return { date: parsedDate.toISOString().split('T')[0], status: 'skip', reason: `old posting: ${parsedDate.toISOString().split('T')[0]}` };
    }
  } catch (err) {
    return { date: null, status: 'error', reason: err.message.split('\n')[0] };
  }
}

async function processBatch(urls, browser) {
  const page = await browser.newPage();
  const results = [];

  for (const url of urls) {
    const result = await extractDatePosted(page, url);
    results.push({ url, ...result });
  }

  await page.close();
  return results;
}

async function main() {
  const input = await readFile('/Users/nitingoyal/Developer/career-ops/batch/batch-input.tsv', 'utf-8');
  const lines = input.split('\n').filter(l => l.trim());
  const dataLines = lines.slice(1);

  // Parse URLs and metadata
  const jobs = dataLines.map(line => {
    const cols = line.split('\t');
    return {
      id: cols[0],
      url: cols[1],
      source: cols[2] || '',
      notes: cols[3] || ''
    };
  });

  console.log(`Processing ${jobs.length} URLs with ${CONCURRENCY} parallel workers...\n`);

  const browser = await chromium.launch({ headless: true });

  // Split jobs into batches
  const batches = [];
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    batches.push(jobs.slice(i, i + CONCURRENCY).map(j => j.url));
  }

  let processed = 0;
  let kept = 0, skipped = 0, unknown = 0, errors = 0;
  const results = [];

  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(async (url) => {
        const page = await browser.newPage();
        const result = await extractDatePosted(page, url);
        await page.close();
        return { url, ...result };
      })
    );

    for (const r of batchResults) {
      const job = jobs.find(j => j.url === r.url);

      if (r.status === 'keep') {
        kept++;
        console.log(`✅ [${processed + 1}/${jobs.length}] KEEP (${r.date}) ${r.url.substring(0, 50)}...`);
        results.push({ ...job, status: 'keep', date: r.date });
      } else if (r.status === 'skip') {
        skipped++;
        console.log(`❌ [${processed + 1}/${jobs.length}] SKIP (${r.date}) ${r.url.substring(0, 50)}...`);
        results.push({ ...job, status: 'skip', date: r.date });
      } else if (r.status === 'unknown') {
        unknown++;
        console.log(`⚠️  [${processed + 1}/${jobs.length}] UNKNOWN ${r.url.substring(0, 50)}...`);
        results.push({ ...job, status: 'unknown', date: null });
      } else {
        errors++;
        console.log(`❌ [${processed + 1}/${jobs.length}] ERROR: ${r.reason} ${r.url.substring(0, 50)}...`);
        results.push({ ...job, status: 'error', date: null, error: r.reason });
      }

      processed++;
    }
  }

  await browser.close();

  console.log(`\n=== Summary ===`);
  console.log(`Kept (within 3 days): ${kept}`);
  console.log(`Skipped (old posting): ${skipped}`);
  console.log(`Unknown (no date found): ${unknown}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total: ${jobs.length}`);

  // Write filtered input
  const filteredLines = results
    .filter(r => r.status === 'keep')
    .map(r => `${r.id}\t${r.url}\t${r.source}\t${r.notes}`);

  const filteredContent = [lines[0], ...filteredLines].join('\n');
  await writeFile('/Users/nitingoyal/Developer/career-ops/batch/batch-input-filtered.tsv', filteredContent, 'utf-8');
  console.log(`\nFiltered input written to batch-input-filtered.tsv (${filteredLines.length} entries)`);

  // Write state updates for skipped entries
  const stateUpdates = results
    .filter(r => r.status === 'skip')
    .map(r => `${r.id}\t${r.url}\told-posting\t${r.date || ''}\t\t\t`)
    .join('\n');

  if (stateUpdates) {
    await writeFile('/Users/nitingoyal/Developer/career-ops/batch/batch-state-old-postings.tsv', stateUpdates, 'utf-8');
    console.log(`State updates written to batch-state-old-postings.tsv (${skipped} entries)`);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});