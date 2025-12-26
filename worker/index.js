/**
 * Thymer Queue Worker
 *
 * Cloudflare Worker that acts as a message queue for Thymer content.
 *
 * Endpoints:
 *   POST /queue - Add content to queue
 *   GET /pending - Get and remove oldest item
 *   GET /health - Health check (no auth)
 *
 * Environment variables (set in Cloudflare dashboard):
 *   THYMER_TOKEN - Bearer token for auth
 *   THYMER_KV - KV namespace binding
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS headers for browser requests
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check - no auth required
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Auth check for all other endpoints
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (token !== env.THYMER_TOKEN) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /queue - Add to queue
    if (url.pathname === '/queue' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { content, action = 'append', collection, title } = body;

        if (!content) {
          return new Response(JSON.stringify({ error: 'content required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Create queue item with timestamp key for ordering
        const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
        const item = {
          id,
          content,
          action,
          collection,
          title,
          createdAt: new Date().toISOString(),
        };

        await env.THYMER_KV.put(`queue:${id}`, JSON.stringify(item));

        return new Response(JSON.stringify({ success: true, id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // GET /pending - Get oldest item and delete it
    if (url.pathname === '/pending' && request.method === 'GET') {
      try {
        // List all queue items
        const list = await env.THYMER_KV.list({ prefix: 'queue:' });

        if (list.keys.length === 0) {
          return new Response(null, {
            status: 204,
            headers: corsHeaders,
          });
        }

        // Get oldest (first key is oldest due to timestamp prefix)
        const oldestKey = list.keys[0].name;
        const item = await env.THYMER_KV.get(oldestKey, 'json');

        // Delete it
        await env.THYMER_KV.delete(oldestKey);

        return new Response(JSON.stringify(item), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // GET /peek - Preview queue without removing (useful for debugging)
    if (url.pathname === '/peek' && request.method === 'GET') {
      try {
        const list = await env.THYMER_KV.list({ prefix: 'queue:' });
        const items = await Promise.all(
          list.keys.slice(0, 10).map(k => env.THYMER_KV.get(k.name, 'json'))
        );
        return new Response(JSON.stringify({ count: list.keys.length, items }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  },
};
