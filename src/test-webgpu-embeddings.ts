/**
 * WebGPU Embeddings Prototype
 *
 * Tests Transformers.js BERT embeddings with WebGPU acceleration
 * to compare against current Candle/Rust implementation.
 */

import { pipeline, env } from '@xenova/transformers';

// Configuration
env.allowLocalModels = false;
env.allowRemoteModels = true;

interface BenchmarkResult {
  device: 'webgpu' | 'wasm' | 'cpu';
  text: string;
  embeddingTime: number;
  totalTime: number;
  dimensions: number[];
  firstValues: number[];
}

/**
 * Test WebGPU availability
 */
async function checkWebGPUAvailability(): Promise<boolean> {
  if (!navigator.gpu) {
    console.error('❌ WebGPU not available in this browser');
    return false;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      console.error('❌ No WebGPU adapter found');
      return false;
    }

    console.log('✅ WebGPU available');
    console.log('   Adapter:', adapter.info);
    return true;
  } catch (error) {
    console.error('❌ WebGPU check failed:', error);
    return false;
  }
}

/**
 * Run embedding with specified device
 */
async function runEmbedding(
  text: string,
  device: 'webgpu' | 'wasm' | 'cpu'
): Promise<BenchmarkResult> {
  console.log(`\n🧪 Testing with device: ${device.toUpperCase()}`);
  console.log(`   Input: "${text}"`);

  const totalStart = performance.now();

  // Load model
  console.log('   Loading model...');
  const loadStart = performance.now();
  const embedder = await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2',
    {
      device,
      dtype: device === 'webgpu' ? 'fp32' : undefined,
      progress_callback: (progress: any) => {
        if (progress.status === 'progress') {
          console.log(`   Download: ${progress.file} - ${Math.round(progress.progress)}%`);
        }
      }
    }
  );
  const loadTime = performance.now() - loadStart;
  console.log(`   Model loaded in ${loadTime.toFixed(2)}ms`);

  // Generate embedding
  console.log('   Generating embedding...');
  const embedStart = performance.now();
  const output = await embedder(text, {
    pooling: 'mean',
    normalize: true
  });
  const embedTime = performance.now() - embedStart;

  const totalTime = performance.now() - totalStart;

  // Extract results
  const embedding = output as any;
  const firstValues = Array.from(embedding.data.slice(0, 5) as Float32Array);

  console.log(`   ✓ Embedding generated in ${embedTime.toFixed(2)}ms`);
  console.log(`   ✓ Total time: ${totalTime.toFixed(2)}ms`);
  console.log(`   Shape: [${embedding.dims.join(', ')}]`);
  console.log(`   First 5 values: [${firstValues.map(v => v.toFixed(4)).join(', ')}]`);

  return {
    device,
    text,
    embeddingTime: embedTime,
    totalTime,
    dimensions: embedding.dims,
    firstValues
  };
}

/**
 * Test with multiple command examples
 */
async function testCommandEmbeddings(): Promise<void> {
  const testCommands = [
    'make this bold',
    'heading one',
    'create task',
    'search for authentication',
    'undo that'
  ];

  console.log('\n📝 Testing with real Mutter command examples:');

  const results: BenchmarkResult[] = [];

  for (const command of testCommands) {
    const result = await runEmbedding(command, 'webgpu');
    results.push(result);
  }

  // Calculate statistics
  const avgTime = results.reduce((sum, r) => sum + r.embeddingTime, 0) / results.length;
  const minTime = Math.min(...results.map(r => r.embeddingTime));
  const maxTime = Math.max(...results.map(r => r.embeddingTime));

  console.log('\n📊 Performance Statistics:');
  console.log(`   Average: ${avgTime.toFixed(2)}ms`);
  console.log(`   Min: ${minTime.toFixed(2)}ms`);
  console.log(`   Max: ${maxTime.toFixed(2)}ms`);
}

/**
 * Compare WebGPU vs WASM performance
 */
async function compareDevices(): Promise<void> {
  const testText = 'make this bold';

  console.log('\n⚡ Performance Comparison:');

  // Test WebGPU
  const webgpuResult = await runEmbedding(testText, 'webgpu');

  // Test WASM fallback
  const wasmResult = await runEmbedding(testText, 'wasm');

  // Calculate speedup
  const speedup = wasmResult.embeddingTime / webgpuResult.embeddingTime;

  console.log('\n📈 Results:');
  console.log(`   WebGPU: ${webgpuResult.embeddingTime.toFixed(2)}ms`);
  console.log(`   WASM:   ${wasmResult.embeddingTime.toFixed(2)}ms`);
  console.log(`   Speedup: ${speedup.toFixed(2)}x faster with WebGPU`);

  if (speedup > 10) {
    console.log('   🚀 Massive speedup! WebGPU is significantly faster.');
  } else if (speedup > 2) {
    console.log('   ✅ Good speedup. WebGPU provides clear benefit.');
  } else {
    console.log('   ⚠️  Modest speedup. May not justify migration.');
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log('='.repeat(80));
  console.log('Mutter WebGPU Embeddings Prototype');
  console.log('Testing Transformers.js with WebGPU acceleration');
  console.log('='.repeat(80));

  // Check WebGPU availability
  const hasWebGPU = await checkWebGPUAvailability();

  if (!hasWebGPU) {
    console.error('\n❌ Cannot proceed without WebGPU support');
    console.error('   Make sure you\'re running in a WebGPU-capable browser');
    console.error('   (Chrome 113+, Edge 113+, Firefox with flag enabled)');
    return;
  }

  try {
    // Run tests
    await testCommandEmbeddings();
    await compareDevices();

    console.log('\n✅ All tests complete!');
    console.log('\nNext steps:');
    console.log('1. Compare these results with current Candle implementation');
    console.log('2. Test with full command registry (20+ commands)');
    console.log('3. Integrate into Mutter\'s classification pipeline');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main, runEmbedding, checkWebGPUAvailability, compareDevices };
