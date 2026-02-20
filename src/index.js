import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const server = new Server(
  {
    name: 'contextos-knowledge',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_knowledge',
        description: 'Full-text search across 169 deep knowledge entries (Claude Code, MCP, n8n, Obsidian guides)',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for technical implementation guides',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 5)',
              default: 5,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'search_concepts',
        description: 'Search 1,114 atomic implementation concepts with 18-step tactical applications',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for specific implementation concepts',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 10)',
              default: 10,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_knowledge_entry',
        description: 'Fetch a single deep knowledge entry by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The knowledge entry ID',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'list_knowledge_topics',
        description: 'List all available knowledge categories',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'search_meetings',
        description: 'Search 468 meeting transcripts for customer pain points, objections, use cases, and company context',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for meeting content (customer objections, pricing discussions, use cases)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 5)',
              default: 5,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_meeting',
        description: 'Fetch a specific meeting transcript by ID',
        inputSchema: {
          type: 'object',
          properties: {
            meeting_id: {
              type: 'string',
              description: 'The meeting ID',
            },
          },
          required: ['meeting_id'],
        },
      },
      {
        name: 'list_meeting_sources',
        description: 'List all unique meeting sources/types',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'search_knowledge') {
      const { data, error } = await supabase
        .from('deep_knowledge')
        .select('id, title, category, author, raw_content')
        .textSearch('raw_content', args.query, { type: 'plain' })
        .limit(args.limit || 5);

      if (error) throw error;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    if (name === 'search_concepts') {
      const searchPattern = `%${args.query}%`;
      const { data, error } = await supabase
        .from('atomic_concepts')
        .select('*')
        .or(`concept_name.ilike.${searchPattern},summary.ilike.${searchPattern}`)
        .limit(args.limit || 10);

      if (error) throw error;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    if (name === 'get_knowledge_entry') {
      const { data, error } = await supabase
        .from('deep_knowledge')
        .select('*')
        .eq('id', args.id)
        .single();

      if (error) throw error;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    if (name === 'list_knowledge_topics') {
      const { data, error } = await supabase
        .from('deep_knowledge')
        .select('category')
        .order('category');

      if (error) throw error;

      const categories = [...new Set(data.map((row) => row.category))];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ categories, count: categories.length }, null, 2),
          },
        ],
      };
    }

    if (name === 'search_meetings') {
      const { data, error } = await supabase
        .from('raw_meeting_intelligence')
        .select('meeting_id, source_relpath, payload')
        .textSearch('payload', args.query, { type: 'plain' })
        .limit(args.limit || 5);

      if (error) throw error;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    if (name === 'get_meeting') {
      const { data, error } = await supabase
        .from('raw_meeting_intelligence')
        .select('*')
        .eq('meeting_id', args.meeting_id)
        .single();

      if (error) throw error;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    if (name === 'list_meeting_sources') {
      const { data, error } = await supabase
        .from('raw_meeting_intelligence')
        .select('source_relpath')
        .order('source_relpath');

      if (error) throw error;

      const sources = [...new Set(data.map((row) => row.source_relpath))];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ sources, count: sources.length }, null, 2),
          },
        ],
      };
    }

    throw new Error('Unknown tool: ' + name);
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: ' + error.message,
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport);
