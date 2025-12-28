/**
 * React hook for using the embedding server
 */

import { useState, useCallback, useEffect } from 'react';
import {
  getEmbedding,
  getBatchEmbeddings,
  checkHealth,
  routeCommand,
  type EmbeddingResponse,
  type BatchEmbeddingResponse,
} from '../lib/embedding-api';

export function useEmbeddings() {
  const [isHealthy, setIsHealthy] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Check server health on mount
  useEffect(() => {
    checkHealth()
      .then(() => setIsHealthy(true))
      .catch((err) => {
        console.warn('Embedding server not ready:', err);
        setIsHealthy(false);
      });
  }, []);

  const embed = useCallback(async (text: string): Promise<EmbeddingResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getEmbedding(text);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const embedBatch = useCallback(async (
    texts: string[]
  ): Promise<BatchEmbeddingResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getBatchEmbeddings(texts);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const route = useCallback(async (
    userCommand: string,
    availableCommands: string[]
  ): Promise<{ command: string; confidence: number } | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await routeCommand(userCommand, availableCommands);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isHealthy,
    isLoading,
    error,
    embed,
    embedBatch,
    route,
  };
}

/**
 * Example usage in a component:
 *
 * ```tsx
 * function CommandInput() {
 *   const { route, isHealthy, isLoading } = useEmbeddings();
 *   const [command, setCommand] = useState('');
 *
 *   const availableCommands = [
 *     'make this bold',
 *     'heading one',
 *     'create task',
 *     'search for',
 *     'undo that'
 *   ];
 *
 *   const handleSubmit = async () => {
 *     const result = await route(command, availableCommands);
 *     if (result) {
 *       console.log(`Matched: ${result.command} (${result.confidence})`);
 *       // Execute the matched command
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <input
 *         value={command}
 *         onChange={(e) => setCommand(e.target.value)}
 *         disabled={!isHealthy || isLoading}
 *       />
 *       <button onClick={handleSubmit} disabled={!isHealthy || isLoading}>
 *         {isLoading ? 'Processing...' : 'Submit'}
 *       </button>
 *       {!isHealthy && <span>⚠️ Embedding server not available</span>}
 *     </div>
 *   );
 * }
 * ```
 */
