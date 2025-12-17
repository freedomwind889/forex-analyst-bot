import { initDatabase } from './database.js';
import { handleEvent, handleInternalAnalyze } from './handlers.js';
import { verifyLineSignature } from './utils.js';

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Internal endpoint for background analysis (Free-plan friendly: self-invocation)
    const url = new URL(request.url);
    const isInternal = (url.pathname === '/internal/analyze') || (url.searchParams.get('__internal') === 'analyze');
    if (isInternal) {
      // Initialize database for internal handler as well
      await initDatabase(env);
      return await handleInternalAnalyze(request, env, ctx);
    }

    try {
      // 1. Verify LINE Signature
      const signature = request.headers.get('x-line-signature');
      const bodyText = await request.text(); // Read raw body for verification

      if (!env.LINE_CHANNEL_SECRET) {
        console.error("Missing LINE_CHANNEL_SECRET in env");
        return new Response('Server Config Error', { status: 500 });
      }

      const isValid = await verifyLineSignature(bodyText, signature, env.LINE_CHANNEL_SECRET);
      if (!isValid) {
        console.warn("Invalid Signature");
        return new Response('Unauthorized', { status: 401 });
      }

      await initDatabase(env);

      // Parse JSON after verification
      const body = JSON.parse(bodyText);
      const events = body.events;

      if (!events || events.length === 0) {
        return new Response('OK', { status: 200 });
      }

      for (const event of events) {
        ctx.waitUntil(handleEvent(event, env, ctx, request.url));
      }

      return new Response('OK', { status: 200 });

    } catch (err) {
      console.error(err);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
};