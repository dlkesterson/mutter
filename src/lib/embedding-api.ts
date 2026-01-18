/**
 * Embedding API Client
 * Uses Tauri commands to access the ML embedding engine
 */

import { invoke } from '@tauri-apps/api/core';

const EMBEDDING_DIM = 384;

export interface EmbeddingResponse {
  embedding: number[];
  dimensions: number;
  time_ms: number;
}

/**
 * Get a single text embedding via Tauri command
 */
export async function getEmbedding(text: string): Promise<EmbeddingResponse> {
  const startTime = performance.now();
  const embedding = await invoke<number[]>('get_embedding', { text });
  const timeMs = performance.now() - startTime;

  return {
    embedding,
    dimensions: embedding.length,
    time_ms: timeMs,
  };
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

export { EMBEDDING_DIM };
