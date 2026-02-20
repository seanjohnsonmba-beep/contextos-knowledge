// src/sync.js
// Obsidian vault → Supabase ingestion pipeline
// Usage: node src/sync.js

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join, basename, extname } from 'path';
import { readFileSync, readdirSync, statSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAULT_PATH } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const vaultPath = VAULT_PATH || join(__dirname, '../ContextOS');

// Parse YAML frontmatter from markdown content
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { frontmatter: {}, body: content.trim() };

  const body = content.slice(match[0].length).trim();
  const frontmatter = {};

  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (!value) continue;

    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

// Recursively collect .md files (skip dotfiles and README/_ prefixed files)
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

// Route file to correct Supabase table based on vault folder
function getTargetTable(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.includes('/10-Deep-Knowledge/')) return 'deep_knowledge';
  if (normalized.includes('/20-Concepts/')) return 'atomic_concepts';
  if (normalized.includes('/30-Meetings/')) return 'raw_meeting_intelligence';
  return null;
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

async function syncFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(content);
  const table = getTargetTable(filePath);
  if (!table) return 'skipped';

  const filename = basename(filePath, '.md');

  if (table === 'deep_knowledge') {
    const id = frontmatter.id || slugify(frontmatter.title || filename);
    const record = {
      id,
      title: frontmatter.title || filename,
      subtitle: frontmatter.subtitle || null,
      author: frontmatter.author || null,
      source_type: frontmatter.source_type || 'obsidian',
      category: frontmatter.category || null,
      role_focus: frontmatter.role_focus || null,
      raw_content: body,
      metadata: {
        tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
        topic_primary: frontmatter.topic_primary || null,
        difficulty_tier: frontmatter.difficulty_tier || null,
      },
      published_date: frontmatter.published_date || null,
      source_filename: basename(filePath),
      source_batch: 'obsidian_sync',
    };
    const { error } = await supabase
      .from('deep_knowledge')
      .upsert(record, { onConflict: 'id' });
    if (error) throw error;
    return `deep_knowledge:${id}`;
  }

  if (table === 'atomic_concepts') {
    const concept_name =
      frontmatter.concept_name || frontmatter.title || filename;
    const record = {
      concept_name,
      summary: body.split('\n').find((l) => l.trim()) || body.slice(0, 300),
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
    };
    const { error } = await supabase
      .from('atomic_concepts')
      .upsert(record, { onConflict: 'concept_name' });
    if (error) throw error;
    return `atomic_concepts:${concept_name}`;
  }

  if (table === 'raw_meeting_intelligence') {
    const meeting_id =
      frontmatter.meeting_id || slugify(frontmatter.title || filename);
    const record = {
      meeting_id,
      source_relpath: filePath.replace(/\\/g, '/'),
      payload: body,
    };
    const { error } = await supabase
      .from('raw_meeting_intelligence')
      .upsert(record, { onConflict: 'meeting_id' });
    if (error) throw error;
    return `raw_meeting_intelligence:${meeting_id}`;
  }
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
        console.log(`✓ ${result}`);
        synced++;
      }
    } catch (err) {
      console.error(`✗ ${basename(file)}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone: ${synced} synced, ${skipped} skipped, ${errors} errors`);
  if (errors > 0) process.exit(1);
}

main();
