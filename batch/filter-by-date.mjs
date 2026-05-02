#!/usr/bin/env node

/**
 * filter-by-date.mjs — Filter batch-input.tsv by posting date
 *
 * Filters job postings to only include those posted within past 3 days.
 * Today: 2026-04-22, Range: 2026-04-19 to 2026-04-22
 *
 * Usage: node filter-by-date.mjs
 */

import { chromium } from 'playwright';
import { readFile, writeFile } from 'fs/promises';

const TODAY = new Date('2026-04-22');
const MIN_DATE = new Date('2026-04-19');
const MAX_DATE = new Date('2026-04-22');

function parseDate(dateStr) {
  if (!dateStr) return null;
  // Handle YYYY-MM-DD format
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function isWithinRange(date) {
  if (!date) return false;
  return date >= MIN_DATE && date <= MAX_DATE;
}

async function extractDatePosted(page, url) {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    if (response?.status() === 404 || response?.status() === 410) {
      return { date: null, status: 'expired', reason: `HTTP ${response.status()}` };
    }

    // Wait for JS to hydrate
    await page.waitForTimeout(2000);

    // Try to extract datePosted from JSON-LD
    const datePosted = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);
          // Handle array of objects
          if (Array.isArray(data)) {
            for (const item of data) {
              if (item.datePosted) return item.datePosted;
            }
          }
          // Handle single object
          if (data.datePosted) return data.datePosted;
        } catch (e) {
          // Invalid JSON, continue
        }
      }
      return null;
    });

    let parsedDate = parseDate(datePosted);

    // If no datePosted in JSON-LD, try to find in page text
    if (!parsedDate) {
      const textDate = await page.evaluate(() => {
        const body = document.body?.innerText || '';

        // Common patterns for posting dates
        const patterns = [
          /posted\s+(\d+)\s+days?\s+ago/i,
          /posted\s+(today|yesterday)/i,
          /posted\s+on\s+(\w+\s+\d+,\s+\d{4})/i,
          /posted\s+(\w+\s+\d+)/i,
          /date\s+posted[:\s]+(\d{4}-\d{2}-\d{2})/i,
          /updated?\s+(\d+)\s+days?\s+ago/i,
        ];

        for (const pattern of patterns) {
          const match = body.match(pattern);
          if (match) {
            return match[0];
          }
        }
        return null;
      });

      if (textDate) {
        // Try to parse "X days ago" relative to today
        const daysAgoMatch = textDate.match(/(\d+)\s+days?\s+ago/i);
        if (daysAgoMatch) {
          const daysAgo = parseInt(daysAgoMatch[1]);
          parsedDate = new Date(TODAY);
          parsedDate.setDate(parsedDate.getDate() - daysAgo);
        } else if (textDate.toLowerCase().includes('today')) {
          parsedDate = new Date(TODAY);
        } else if (textDate.toLowerCase().includes('yesterday')) {
          parsedDate = new Date(TODAY);
          parsedDate.setDate(parsedDate.getDate() - 1);
        }
      }
    }

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

async function main() {
  // Read batch-input.tsv
  const input = await readFile('/Users/nitingoyal/Developer/career-ops/batch/batch-input.tsv', 'utf-8');
  const lines = input.split('\n').filter(l => l.trim());

  // Parse header
  const header = lines[0].split('\t');
  const dataLines = lines.slice(1);

  console.log(`Processing ${dataLines.length} URLs...\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let kept = 0, skipped = 0, errors = 0, unknown = 0;
  const results = [];

  // Process each URL
  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    const cols = line.split('\t');
    const id = cols[0];
    const url = cols[1];
    const source = cols[2] || '';
    const notes = cols[3] || '';

    process.stdout.write(`[${i + 1}/${dataLines.length}] Checking ${url.substring(0, 60)}... `);

    const result = await extractDatePosted(page, url);

    if (result.status === 'keep') {
      kept++;
      console.log(`✅ KEEP (${result.date})`);
      results.push({ id, url, source, notes, status: 'keep', date: result.date });
    } else if (result.status === 'skip') {
      skipped++;
      console.log(`❌ SKIP (${result.date}) - ${result.reason}`);
      results.push({ id, url, source, notes, status: 'skip', date: result.date });
    } else if (result.status === 'unknown') {
      unknown++;
      console.log(`⚠️  UNKNOWN - ${result.reason}`);
      results.push({ id, url, source, notes, status: 'unknown', date: null });
    } else {
      errors++;
      console.log(`❌ ERROR - ${result.reason}`);
      results.push({ id, url, source, notes, status: 'error', date: null, error: result.reason });
    }
  }

  await browser.close();

  // Write results
  console.log(`\n=== Summary ===`);
  console.log(`Kept (within 3 days): ${kept}`);
  console.log(`Skipped (old posting): ${skipped}`);
  console.log(`Unknown (no date found): ${unknown}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total: ${dataLines.length}`);

  // Write filtered input (only keep ones within range)
  const filteredLines = results
    .filter(r => r.status === 'keep')
    .map(r => `${r.id}\t${r.url}\t${r.source}\t${r.notes}`);

  const filteredContent = [lines[0], ...filteredLines].join('\n');
  await writeFile('/Users/nitingoyal/Developer/career-ops/batch/batch-input-filtered.tsv', filteredContent, 'utf-8');
  console.log(`\nFiltered input written to batch-input-filtered.tsv (${filteredLines.length} entries)`);

  // Write status update for batch-state.tsv
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