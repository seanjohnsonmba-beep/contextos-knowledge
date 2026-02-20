// src/sync.js
// Obsidian vault → n8n webhook → Supabase ingestion pipeline
// Usage: node src/sync.js

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join, basename, extname } from 'path';
import { readFileSync, readdirSync, statSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const { N8N_WEBHOOK_URL, VAULT_PATH } = process.env;

if (!N8N_WEBHOOK_URL) {
  console.error('Missing required env var: N8N_WEBHOOK_URL');
  process.exit(1);
}

const vaultPath = VAULT_PATH || join(__dirname, '../ContextOS');

// Recursively collect .md files (skip dotfiles, READMEs, templates)
function walkDir(dir, fileList = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      walkDir(fullPath, fileList);
    } else if (
      extname(entry) === '.md' &&
      !entry.startsWith('_') &&
      entry !== 'README.md'
    ) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

// Determine which vault folder a file belongs to (for n8n routing)
function getFolder(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.includes('/10-Deep-Knowledge/')) return '10-Deep-Knowledge';
  if (normalized.includes('/20-Concepts/')) return '20-Concepts';
  if (normalized.includes('/30-Meetings/')) return '30-Meetings';
  return null;
}

async function syncFile(filePath) {
  const folder = getFolder(filePath);
  if (!folder) return 'skipped';

  const content = readFileSync(filePath, 'utf-8');

  const res = await fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filePath: filePath.replace(/\\/g, '/'),
      folder,
      content,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`n8n webhook error (${res.status}): ${text}`);
  }

  const result = await res.json();
  if (result.skipped) return 'skipped';
  return `${result.table}:${basename(filePath, '.md')}`;
}

async function main() {
  console.log(`Scanning vault: ${vaultPath}`);
  const files = walkDir(vaultPath);
  console.log(`Found ${files.length} markdown files\n`);

  let synced = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    try {
      const result = await syncFile(file);
      if (result === 'skipped') {
        skipped++;
      } else {
        console.log(`\u2713 ${result}`);
        synced++;
      }
    } catch (err) {
      console.error(`\u2717 ${basename(file)}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone: ${synced} synced, ${skipped} skipped, ${errors} errors`);
  if (errors > 0) process.exit(1);
}

main();
