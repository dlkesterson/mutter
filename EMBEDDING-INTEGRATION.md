# Embedding Server Integration Guide

## Overview

Mutter now includes a lightweight embedding server that runs as a Tauri sidecar. This provides fast semantic embeddings for command routing and text understanding.

## Architecture

```
┌─────────────────────────────────────────────┐
│          Mutter Tauri App                   │
│                                             │
│  ┌────────────────────────────────────┐    │
│  │     Frontend (React/TypeScript)    │    │
│  │                                    │    │
│  │  • useEmbeddings() hook           │    │
│  │  • embedding-api.ts                │    │
│  └─────────────┬──────────────────────┘    │
│                │ HTTP (localhost:8080)      │
│  ┌─────────────▼──────────────────────┐    │
│  │   Embedding Server Sidecar        │    │
│  │   (Python - No Dependencies)       │    │
│  │                                    │    │
│  │  • Pure Python HTTP server         │    │
│  │  • Mock embeddings (dev)           │    │
│  │  • Real ML (production)            │    │
│  └────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

## Files Added

### Sidecar Binary
- `src-tauri/binaries/embedding-server` - Shell wrapper script
- `src-tauri/binaries/embedding-server.py` - Python embedding server

### Rust Integration
- `src-tauri/src/lib.rs` - Added sidecar startup code
- `src-tauri/Cargo.toml` - Added `tauri-plugin-shell` dependency
- `src-tauri/tauri.conf.json` - Configured sidecar and CSP

### Frontend API
- `src/lib/embedding-api.ts` - API client for embedding server
- `src/hooks/useEmbeddings.ts` - React hook for easy usage

## Usage Examples

### Basic Usage

```typescript
import { getEmbedding } from '@/lib/embedding-api';

// Get a single embedding
const result = await getEmbedding("make this bold");
console.log(result.embedding); // [0.0365, 0.0024, ...]
console.log(result.time_ms);   // 0.4ms
```

### Batch Embeddings (Faster!)

```typescript
import { getBatchEmbeddings } from '@/lib/embedding-api';

const commands = ["make this bold", "heading one", "create task"];
const result = await getBatchEmbeddings(commands);
// Returns all embeddings in ~1ms total
```

### Command Routing

```typescript
import { routeCommand } from '@/lib/embedding-api';

const availableCommands = [
  "make this bold",
  "heading one",
  "create task",
  "search for authentication"
];

const userInput = "make text bold";
const match = await routeCommand(userInput, availableCommands);

console.log(match.command);     // "make this bold"
console.log(match.confidence);  // 0.89
```

### React Hook

```tsx
import { useEmbeddings } from '@/hooks/useEmbeddings';

function CommandInput() {
  const { route, isHealthy, isLoading } = useEmbeddings();

  const handleCommand = async (userCommand: string) => {
    const match = await route(userCommand, availableCommands);
    if (match && match.confidence > 0.7) {
      executeCommand(match.command);
    }
  };

  return (
    <div>
      {!isHealthy && <span>⚠️ Embedding server offline</span>}
      {/* ... rest of component */}
    </div>
  );
}
```

## API Endpoints

The sidecar server provides:

- `POST /embed` - Single text embedding
- `POST /batch` - Multiple text embeddings
- `GET /health` - Server health check

## Current Status

### Mock Mode (Development)
- ✅ Zero dependencies (pure Python)
- ✅ Deterministic embeddings (same text = same vector)
- ✅ Sub-millisecond response times (~0.3ms)
- ✅ Perfect for testing Tauri integration

### Production Mode (Future)
To upgrade to real ML embeddings:

```bash
pip install transformers sentence-transformers torch
```

Then replace `embedding-server.py` with the full model version.

Expected performance with CUDA:
- Single embedding: ~1-2ms
- Batch (10 texts): ~0.5ms per text

## Testing

```bash
# Start Mutter in dev mode
cd /home/linuxdesktop/Code/mutter
pnpm tauri dev

# The embedding server starts automatically!
# Test it:
curl -X POST http://localhost:8080/embed \
  -H 'Content-Type: application/json' \
  -d '{"text":"make this bold"}'
```

## Troubleshooting

### Server won't start
- Check logs in Tauri console
- Verify Python 3 is installed: `python3 --version`
- Check port 8080 isn't in use: `lsof -i :8080`

### Frontend can't connect
- Check CSP in `tauri.conf.json` includes `http://localhost:8080`
- Verify server is running: `curl http://localhost:8080/health`

### Want real embeddings
- Install: `pip install transformers sentence-transformers`
- Replace `embedding-server.py` with production version
- Restart Mutter

## Performance Benchmarks

### Mock Server (Current)
- Single embedding: **0.24-0.41ms**
- Batch (3 texts): **0.43ms avg**
- Startup time: **Instant**

### With Real Model (Future)
- Single embedding: **1-2ms** (with CUDA)
- Batch (10 texts): **~0.5ms avg** (with CUDA)
- Startup time: **2-3 seconds** (model loading)

## Next Steps

1. ✅ Integration complete and working
2. ⏭️ Use mock embeddings for UI development
3. ⏭️ Install ML dependencies when ready for production
4. ⏭️ Implement command routing in Mutter UI
5. ⏭️ Build semantic search features

---

Built with ❤️ for Mutter
