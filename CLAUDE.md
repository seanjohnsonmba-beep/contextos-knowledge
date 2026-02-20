# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ContextOS is an AI-powered GTM (Go-To-Market) research and automation system. It exposes a Supabase knowledge base through MCP servers and drives outbound workflows via n8n.

**Knowledge base contents (Supabase):**
- 169 deep knowledge entries
- 1,114 atomic concepts
- Domains: Claude Code, MCP, Obsidian, n8n, GTM strategies

## Architecture

```
ContextOS
├── MCP Servers          # Expose Supabase knowledge base to Claude/AI clients
├── Supabase             # PostgreSQL knowledge store (hosted)
├── n8n Workflows        # Outbound automation and orchestration
└── Obsidian Vault       # Source-of-truth notes feeding the knowledge base
```

**Data flow:** Obsidian notes → ingestion pipeline → Supabase (deep knowledge + atomic concepts) → MCP servers → Claude/AI agents → n8n outbound workflows.

## Commands

```bash
npm install          # Install dependencies (run once after cloning)
npm start            # Run the MCP server
npm run dev          # Run with hot reload (node --watch)
```

## Key Technologies

- **Supabase**: Postgres + pgvector for semantic search over knowledge entries. All knowledge queries go through Supabase.
- **MCP (Model Context Protocol)**: Servers that expose knowledge base tools to Claude and other AI clients.
- **n8n**: Workflow automation for outbound GTM sequences (email, LinkedIn, etc.).
- **Obsidian**: Note-taking vault that serves as the canonical source for knowledge entries.

## Supabase Schema

**`deep_knowledge`** (169 rows) — long-form entries sourced from YouTube transcripts, articles, etc.
- `id` (text PK, e.g. `cc_cole_medin_docling_rag_mastery`)
- `title`, `subtitle`, `author`, `source_type`, `category`, `role_focus`
- `raw_content` — full text of the entry
- `metadata` (JSONB) — contains `tags`, `global_tags`, `youtube` details, `semantic_summary`, `topic_primary`, `difficulty_tier`, etc.
- `published_date`, `source_filename`, `source_batch`, `created_at`

**`atomic_concepts`** (1,114 rows) — short, discrete facts and definitions
- `concept_name` — name/title of the concept
- `summary` — concise explanation
- `tags` (array) — topic tags

## MCP Server

The MCP server lives in `src/index.js` (Node.js ESM, `@modelcontextprotocol/sdk`). It exposes four tools to Claude:

| Tool | Table | Description |
|---|---|---|
| `search_knowledge` | `deep_knowledge` | Full-text search over 169 entries |
| `search_concepts` | `atomic_concepts` | Full-text search over 1,114 concepts |
| `get_knowledge_entry` | `deep_knowledge` | Fetch a single entry by ID |
| `list_knowledge_topics` | `deep_knowledge` | List distinct topic categories |

Search hits `title + subtitle + raw_content` on `deep_knowledge`, and `concept_name + summary` on `atomic_concepts`. Tags on `deep_knowledge` live inside `metadata->tags` (JSONB); tags on `atomic_concepts` are a native array column.

The Claude Code MCP config is at `~/.config/claude-code/mcp.json`. Credentials go there (not in this repo) since that file is outside version control.

## Environment Variables

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
```
