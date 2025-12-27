#!/usr/bin/env python3
"""
Pure Python embedding server for Tauri/Mutter
ZERO dependencies - just Python stdlib!
Mock embeddings for testing Tauri integration
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import time
import random
import hashlib

PORT = 8080
EMBEDDING_DIM = 384

def generate_mock_embedding(text):
    """Generate deterministic mock embedding from text"""
    # Use text hash as seed for reproducible embeddings
    seed = int(hashlib.md5(text.encode()).hexdigest(), 16) % (2**31)
    random.seed(seed)

    # Generate random embedding
    embedding = [random.gauss(0, 1) for _ in range(EMBEDDING_DIM)]

    # Normalize to unit vector
    magnitude = sum(x**2 for x in embedding) ** 0.5
    embedding = [x / magnitude for x in embedding]

    return embedding

class EmbeddingHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        """Handle CORS preflight for Tauri"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/embed':
            self.handle_embed()
        elif self.path == '/batch':
            self.handle_batch()
        else:
            self.send_error(404)

    def do_GET(self):
        if self.path == '/health':
            self.handle_health()
        else:
            self.send_error(404)

    def handle_embed(self):
        try:
            content_length = int(self.headers['Content-Length'])
            body = self.rfile.read(content_length)
            data = json.loads(body)

            text = data.get('text', '')
            if not text:
                self.send_json_response({"error": "No text provided"}, 400)
                return

            start = time.perf_counter()
            embedding = generate_mock_embedding(text)
            elapsed_ms = (time.perf_counter() - start) * 1000

            self.send_json_response({
                "embedding": embedding,
                "dimensions": EMBEDDING_DIM,
                "time_ms": round(elapsed_ms, 3),
                "mode": "mock",
                "info": "Deterministic mock embedding - same text = same embedding"
            })
        except Exception as e:
            self.send_json_response({"error": str(e)}, 500)

    def handle_batch(self):
        try:
            content_length = int(self.headers['Content-Length'])
            body = self.rfile.read(content_length)
            data = json.loads(body)

            texts = data.get('texts', [])
            if not texts:
                self.send_json_response({"error": "No texts provided"}, 400)
                return

            start = time.perf_counter()
            embeddings = [generate_mock_embedding(text) for text in texts]
            elapsed_ms = (time.perf_counter() - start) * 1000

            self.send_json_response({
                "embeddings": embeddings,
                "count": len(texts),
                "dimensions": EMBEDDING_DIM,
                "time_ms": round(elapsed_ms, 3),
                "avg_time_per_text_ms": round(elapsed_ms / len(texts), 3),
                "mode": "mock"
            })
        except Exception as e:
            self.send_json_response({"error": str(e)}, 500)

    def handle_health(self):
        self.send_json_response({
            "status": "healthy",
            "mode": "mock",
            "port": PORT,
            "embedding_dim": EMBEDDING_DIM
        })

    def send_json_response(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')  # Important for Tauri!
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}")

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 Mutter Embedding Server (MOCK MODE)")
    print("=" * 60)
    print(f"   Port: {PORT}")
    print(f"   Mode: Mock embeddings (deterministic, no ML)")
    print(f"   CORS: Enabled (works with Tauri)")
    print()
    print("📝 Endpoints:")
    print(f"   POST /embed   - Single embedding")
    print(f"   POST /batch   - Batch embeddings")
    print(f"   GET  /health  - Health check")
    print()
    print("💡 Test:")
    print(f'   curl -X POST http://localhost:{PORT}/embed \\')
    print(f'        -H "Content-Type: application/json" \\')
    print(f'        -d \'{{"text":"make this bold"}}\'')
    print()
    print("⚠️  MOCK MODE: Not real ML embeddings!")
    print("   - Same text always gives same embedding")
    print("   - Useful for testing Tauri integration")
    print("   - For real embeddings: install transformers + model")
    print("=" * 60)
    print()

    try:
        server = HTTPServer(('0.0.0.0', PORT), EmbeddingHandler)
        print("✅ Server started! Waiting for requests...\n")
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n\n👋 Shutting down server...")
    except OSError as e:
        if "Address already in use" in str(e):
            print(f"\n❌ Port {PORT} already in use!")
            print(f"   Kill existing server: pkill -f embedding-server")
        else:
            print(f"\n❌ Error: {e}")
    except Exception as e:
        print(f"\n❌ Error: {e}")
