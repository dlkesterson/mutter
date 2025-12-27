/**
 * Embedding Server API Client
 * Connects to the Tauri sidecar embedding server running on localhost:8080
 */

const EMBEDDING_SERVER_URL = 'http://localhost:8080';
const EMBEDDING_DIM = 384;

export interface EmbeddingResponse {
  embedding: number[];
  dimensions: number;
  time_ms: number;
  mode?: string;
  device?: string;
  info?: string;
  warning?: string;
}

export interface BatchEmbeddingResponse {
  embeddings: number[][];
  count: number;
  dimensions: number;
  time_ms: number;
  avg_time_per_text_ms: number;
  mode?: string;
  device?: string;
}

export interface HealthResponse {
  status: string;
  mode: string;
  port: number;
  embedding_dim: number;
  device?: string;
  cuda_available?: boolean;
}

/**
 * Get a single text embedding
 */
export async function getEmbedding(text: string): Promise<EmbeddingResponse> {
  const response = await fetch(`${EMBEDDING_SERVER_URL}/embed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get embeddings for multiple texts at once (faster!)
 */
export async function getBatchEmbeddings(
  texts: string[]
): Promise<BatchEmbeddingResponse> {
  const response = await fetch(`${EMBEDDING_SERVER_URL}/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ texts }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Check if the embedding server is healthy and ready
 */
export async function checkHealth(): Promise<HealthResponse> {
  const response = await fetch(`${EMBEDDING_SERVER_URL}/health`);

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find the most similar text from a list of options
 */
export async function findMostSimilar(
  query: string,
  options: string[]
): Promise<{ text: string; similarity: number; index: number }> {
  // Get embeddings for query and all options in a single batch
  const allTexts = [query, ...options];
  const { embeddings } = await getBatchEmbeddings(allTexts);

  const queryEmbedding = embeddings[0];
  const optionEmbeddings = embeddings.slice(1);

  // Calculate similarities
  const similarities = optionEmbeddings.map((emb) =>
    cosineSimilarity(queryEmbedding, emb)
  );

  // Find the best match
  let maxSim = -1;
  let maxIdx = 0;

  for (let i = 0; i < similarities.length; i++) {
    if (similarities[i] > maxSim) {
      maxSim = similarities[i];
      maxIdx = i;
    }
  }

  return {
    text: options[maxIdx],
    similarity: maxSim,
    index: maxIdx,
  };
}

/**
 * Example usage for Mutter command routing
 */
export async function routeCommand(
  userCommand: string,
  availableCommands: string[]
): Promise<{ command: string; confidence: number }> {
  const result = await findMostSimilar(userCommand, availableCommands);

  return {
    command: result.text,
    confidence: result.similarity,
  };
}

// Export constants
export { EMBEDDING_DIM, EMBEDDING_SERVER_URL };
