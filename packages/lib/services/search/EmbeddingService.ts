import { pipeline } from '@xenova/transformers';
import Logger from '@joplin/utils/Logger';

type EmbeddingOptions = {
	pooling: 'mean';
	normalize: true;
};

type EmbeddingPipeline = (input: string, options: EmbeddingOptions)=> Promise<unknown>;

type EmbeddingResultWithData = {
	data: Float32Array|number[];
};

const logger = Logger.create('EmbeddingService');

export default class EmbeddingService {

	public static instance_: EmbeddingService|null = null;
	private static readonly modelId = 'Xenova/all-MiniLM-L6-v2';
	private static readonly maxTextLength = 2000;

	private embeddingPipeline_: EmbeddingPipeline|null = null;
	private initializingPromise_: Promise<void>|null = null;

	public static instance() {
		if (EmbeddingService.instance_) return EmbeddingService.instance_;
		EmbeddingService.instance_ = new EmbeddingService();
		return EmbeddingService.instance_;
	}

	public async initialize(): Promise<void> {
		if (this.embeddingPipeline_) return;
		if (this.initializingPromise_) return this.initializingPromise_;

		this.initializingPromise_ = (async () => {
			logger.info('[EmbeddingService] Initializing embedding model...');

			try {
				const loadedPipeline = await pipeline('feature-extraction', EmbeddingService.modelId);
				this.embeddingPipeline_ = loadedPipeline as unknown as EmbeddingPipeline;
				logger.info('[EmbeddingService] Embedding model initialized.');
			} catch (error) {
				const message = this.errorToMessage_(error);
				throw new Error(`[EmbeddingService] Failed to initialize embedding model "${EmbeddingService.modelId}": ${message}`);
			} finally {
				this.initializingPromise_ = null;
			}
		})();

		return this.initializingPromise_;
	}

	public async embed(text: string): Promise<number[]> {
		await this.initialize();

		if (!this.embeddingPipeline_) {
			throw new Error('[EmbeddingService] Embedding pipeline is not initialized.');
		}

		const truncatedText = text.slice(0, EmbeddingService.maxTextLength);
		const output = await this.embeddingPipeline_(truncatedText, {
			pooling: 'mean',
			normalize: true,
		});

		if (Array.isArray(output)) {
			return output.map(v => Number(v));
		}

		if (output instanceof Float32Array) {
			return Array.from(output);
		}

		if (this.isEmbeddingResultWithData_(output)) {
			const data = output.data;
			return Array.isArray(data) ? data.map(v => Number(v)) : Array.from(data);
		}

		throw new Error('[EmbeddingService] Invalid embedding output format.');
	}

	public isInitialized(): boolean {
		return !!this.embeddingPipeline_;
	}

	private isEmbeddingResultWithData_(value: unknown): value is EmbeddingResultWithData {
		if (!value || typeof value !== 'object') return false;

		if (!('data' in value)) return false;
		const data = (value as { data: unknown }).data;
		return Array.isArray(data) || data instanceof Float32Array;
	}

	private errorToMessage_(error: unknown): string {
		if (error instanceof Error) return error.message;
		if (typeof error === 'string') return error;
		return 'Unknown initialization error';
	}
}
