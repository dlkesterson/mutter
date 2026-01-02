#!/usr/bin/env node
/**
 * Mutter Sync Server
 *
 * A simple WebSocket-based Automerge sync server for CRDT document synchronization.
 * This server acts as a relay to sync documents between multiple Mutter instances.
 *
 * Usage: node sync-server.mjs --port 3030
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Resolve node_modules from the project root (two levels up from binaries/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

// Create a require function that can resolve from the project root
const require = createRequire(join(projectRoot, 'node_modules', '/'));

// Import dependencies using dynamic import with resolved paths
const { WebSocketServer } = await import('ws');
const { Repo } = await import('@automerge/automerge-repo');

// NodeWSServerAdapter might be in a different package
let NodeWSServerAdapter;
try {
  const wsModule = await import('@automerge/automerge-repo-network-websocket');
  NodeWSServerAdapter = wsModule.NodeWSServerAdapter;
} catch (e) {
  console.error('[SyncServer] Failed to import NodeWSServerAdapter:', e.message);
  console.error('[SyncServer] Make sure @automerge/automerge-repo-network-websocket is installed');
  process.exit(1);
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let port = 3030;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(`Invalid port: ${args[i + 1]}`);
        process.exit(1);
      }
    }
  }

  return { port };
}

async function main() {
  const { port } = parseArgs();

  console.log(`[SyncServer] Starting Automerge sync server...`);

  // Create WebSocket server
  const wss = new WebSocketServer({ port });

  // Track connected clients for logging
  let clientCount = 0;

  wss.on('connection', (ws, req) => {
    clientCount++;
    const clientId = req.socket.remoteAddress || 'unknown';
    console.log(`[SyncServer] Client connected from ${clientId} (total: ${clientCount})`);

    ws.on('close', () => {
      clientCount--;
      console.log(`[SyncServer] Client disconnected (total: ${clientCount})`);
    });

    ws.on('error', (err) => {
      console.error(`[SyncServer] WebSocket error:`, err.message);
    });
  });

  // Create Automerge Repo with the WebSocket adapter
  const adapter = new NodeWSServerAdapter(wss);

  const repo = new Repo({
    network: [adapter],
    // No storage - this is a relay-only server
    // Documents are stored on the clients
  });

  console.log(`[SyncServer] Listening on ws://localhost:${port}`);
  console.log(`[SyncServer] Press Ctrl+C to stop`);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[SyncServer] Shutting down...');
    wss.close(() => {
      console.log('[SyncServer] Server closed');
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    console.log('\n[SyncServer] Received SIGTERM, shutting down...');
    wss.close(() => {
      console.log('[SyncServer] Server closed');
      process.exit(0);
    });
  });

  // Keep the process alive
  process.stdin.resume();
}

main().catch((err) => {
  console.error('[SyncServer] Fatal error:', err);
  process.exit(1);
});
