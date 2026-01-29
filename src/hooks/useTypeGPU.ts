import { useEffect, useRef, useState, useCallback } from 'react';

interface UseTypeGPUOptions {
	canvas: HTMLCanvasElement | null;
	width: number;
	height: number;
	gridCols?: number;
	gridRows?: number;
}

interface UseTypeGPUResult {
	isSupported: boolean;
	isReady: boolean;
	error: Error | null;
	updateFrequencyData: (data: Float32Array) => void;
	updateParams: (time: number, isRecording: boolean) => void;
	render: () => void;
}

// Check if WebGPU is available
async function checkWebGPUSupport(): Promise<boolean> {
	if (typeof navigator === 'undefined' || !navigator.gpu) {
		return false;
	}
	try {
		const adapter = await navigator.gpu.requestAdapter();
		return adapter !== null;
	} catch {
		return false;
	}
}

export function useTypeGPU({
	canvas,
	width,
	height,
	gridCols = 32,
	gridRows = 8,
}: UseTypeGPUOptions): UseTypeGPUResult {
	const [isSupported, setIsSupported] = useState<boolean>(false);
	const [isReady, setIsReady] = useState<boolean>(false);
	const [error, setError] = useState<Error | null>(null);

	const deviceRef = useRef<GPUDevice | null>(null);
	const contextRef = useRef<GPUCanvasContext | null>(null);
	const pipelineRef = useRef<GPURenderPipeline | null>(null);
	const paramsBufferRef = useRef<GPUBuffer | null>(null);
	const frequencyBufferRef = useRef<GPUBuffer | null>(null);
	const bindGroupRef = useRef<GPUBindGroup | null>(null);
	const formatRef = useRef<GPUTextureFormat>('bgra8unorm');

	// Check WebGPU support on mount
	useEffect(() => {
		checkWebGPUSupport().then(setIsSupported);
	}, []);

	// Initialize WebGPU
	useEffect(() => {
		if (!canvas || !isSupported) return;

		let mounted = true;

		const init = async () => {
			try {
				const adapter = await navigator.gpu.requestAdapter();
				if (!adapter || !mounted) return;

				const device = await adapter.requestDevice();
				if (!mounted) {
					device.destroy();
					return;
				}
				deviceRef.current = device;

				const context = canvas.getContext('webgpu');
				if (!context) throw new Error('Failed to get WebGPU context');
				contextRef.current = context;

				const format = navigator.gpu.getPreferredCanvasFormat();
				formatRef.current = format;

				context.configure({
					device,
					format,
					alphaMode: 'premultiplied',
				});

				// Create uniform buffer for params (time, gridSize, isRecording, padding)
				const paramsBuffer = device.createBuffer({
					size: 32, // 4 floats + padding for alignment
					usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
				});
				paramsBufferRef.current = paramsBuffer;

				// Create storage buffer for frequency data
				const frequencyBuffer = device.createBuffer({
					size: gridCols * 4, // f32 per column
					usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
				});
				frequencyBufferRef.current = frequencyBuffer;

				// Create shader module
				const shaderModule = device.createShaderModule({
					code: createShaderCode(gridCols, gridRows),
				});

				// Create bind group layout
				const bindGroupLayout = device.createBindGroupLayout({
					entries: [
						{
							binding: 0,
							visibility: GPUShaderStage.FRAGMENT,
							buffer: { type: 'uniform' },
						},
						{
							binding: 1,
							visibility: GPUShaderStage.FRAGMENT,
							buffer: { type: 'read-only-storage' },
						},
					],
				});

				// Create pipeline layout
				const pipelineLayout = device.createPipelineLayout({
					bindGroupLayouts: [bindGroupLayout],
				});

				// Create render pipeline
				const pipeline = device.createRenderPipeline({
					layout: pipelineLayout,
					vertex: {
						module: shaderModule,
						entryPoint: 'vertexMain',
					},
					fragment: {
						module: shaderModule,
						entryPoint: 'fragmentMain',
						targets: [{ format }],
					},
					primitive: {
						topology: 'triangle-list',
					},
				});
				pipelineRef.current = pipeline;

				// Create bind group
				const bindGroup = device.createBindGroup({
					layout: bindGroupLayout,
					entries: [
						{ binding: 0, resource: { buffer: paramsBuffer } },
						{ binding: 1, resource: { buffer: frequencyBuffer } },
					],
				});
				bindGroupRef.current = bindGroup;

				if (mounted) {
					setIsReady(true);
				}
			} catch (e) {
				if (mounted) {
					setError(e as Error);
					console.error('WebGPU initialization failed:', e);
				}
			}
		};

		init();

		return () => {
			mounted = false;
			// Cleanup
			paramsBufferRef.current?.destroy();
			frequencyBufferRef.current?.destroy();
			deviceRef.current?.destroy();
			paramsBufferRef.current = null;
			frequencyBufferRef.current = null;
			pipelineRef.current = null;
			bindGroupRef.current = null;
			deviceRef.current = null;
			contextRef.current = null;
			setIsReady(false);
		};
	}, [canvas, isSupported, width, height, gridCols, gridRows]);

	const updateFrequencyData = useCallback((data: Float32Array) => {
		const device = deviceRef.current;
		const buffer = frequencyBufferRef.current;
		if (!device || !buffer) return;

		device.queue.writeBuffer(buffer, 0, data.buffer, data.byteOffset, data.byteLength);
	}, []);

	const updateParams = useCallback((time: number, isRecording: boolean) => {
		const device = deviceRef.current;
		const buffer = paramsBufferRef.current;
		if (!device || !buffer) return;

		const params = new Float32Array([
			time,
			isRecording ? 1.0 : 0.0,
			0.0, // padding
			0.0, // padding
		]);
		device.queue.writeBuffer(buffer, 0, params.buffer, params.byteOffset, params.byteLength);
	}, []);

	const render = useCallback(() => {
		const device = deviceRef.current;
		const context = contextRef.current;
		const pipeline = pipelineRef.current;
		const bindGroup = bindGroupRef.current;

		if (!device || !context || !pipeline || !bindGroup) return;

		const commandEncoder = device.createCommandEncoder();
		const textureView = context.getCurrentTexture().createView();

		const renderPass = commandEncoder.beginRenderPass({
			colorAttachments: [
				{
					view: textureView,
					clearValue: { r: 0.071, g: 0.071, b: 0.071, a: 1.0 }, // #121212
					loadOp: 'clear',
					storeOp: 'store',
				},
			],
		});

		renderPass.setPipeline(pipeline);
		renderPass.setBindGroup(0, bindGroup);
		renderPass.draw(6); // Fullscreen quad (2 triangles)
		renderPass.end();

		device.queue.submit([commandEncoder.finish()]);
	}, []);

	return {
		isSupported,
		isReady,
		error,
		updateFrequencyData,
		updateParams,
		render,
	};
}

function createShaderCode(gridCols: number, gridRows: number): string {
	return /* wgsl */ `
struct Params {
  time: f32,
  isRecording: f32,
  _pad0: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> frequencyData: array<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Fullscreen quad using 6 vertices (2 triangles)
  var positions = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
  );
  var uvs = array<vec2f, 6>(
    vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(0.0, 0.0),
    vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0)
  );

  var output: VertexOutput;
  output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
  output.uv = uvs[vertexIndex];
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;
  let gridWidth = f32(${gridCols});
  let gridHeight = f32(${gridRows});

  // Which cell are we in?
  let cellX = floor(uv.x * gridWidth);
  let cellY = floor(uv.y * gridHeight);

  // Position within the cell (0-1)
  let cellUV = fract(vec2f(uv.x * gridWidth, uv.y * gridHeight));

  // LED circle centered in cell
  let ledCenter = vec2f(0.5, 0.5);
  let dist = distance(cellUV, ledCenter);

  // LED radius with soft edges
  let ledRadius = 0.32;
  let glowRadius = 0.42;

  // LED mask with anti-aliased edges
  let ledMask = smoothstep(glowRadius, ledRadius, dist);
  let glow = smoothstep(glowRadius + 0.15, glowRadius, dist) * 0.4;

  // Get frequency magnitude for this column
  let colIndex = u32(cellX);
  let magnitude = frequencyData[colIndex];

  // LED is "on" if row is below magnitude threshold (flip Y for bottom-up)
  let rowFlipped = gridHeight - 1.0 - cellY;
  let threshold = magnitude * gridHeight;
  let isOn = rowFlipped < threshold;

  // Colors
  let pacificBlue = vec3f(0.0, 0.627, 0.706); // #00A0B4
  let dimGray = vec3f(0.15, 0.15, 0.15);

  // Time-based glow animation
  let glowPulse = 1.0 + 0.15 * sin(params.time * 4.0);

  if (params.isRecording > 0.5 && isOn) {
    // Active LED - Pacific Blue with glow
    let intensity = ledMask * glowPulse + glow;
    return vec4f(pacificBlue * intensity, intensity);
  } else {
    // Idle LED - subtle ambient pulse
    let ambientPulse = 0.12 + 0.06 * sin(params.time * 2.0 + cellX * 0.4);
    let intensity = ledMask * ambientPulse;
    return vec4f(dimGray * intensity, intensity * 0.6);
  }
}
`;
}
