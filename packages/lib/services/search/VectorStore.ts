import SearchEngine from './SearchEngine';
import EmbeddingService from './EmbeddingService';
import Logger from '@joplin/utils/Logger';
import JoplinDatabase from '../../JoplinDatabase';

const logger = Logger.create('VectorStore');

interface NoteEmbeddingRow {
	note_id: string;
	embedding: string;
}

interface SearchResult {
	id: string;
	score: number;
}

export default class VectorStore {

	public static instance_: VectorStore|null = null;
	private static readonly modelVersion = 'all-MiniLM-L6-v2';

	public static instance() {
		if (VectorStore.instance_) return VectorStore.instance_;
		VectorStore.instance_ = new VectorStore();
		return VectorStore.instance_;
	}

	public async indexNote(noteId: string, text: string): Promise<void> {
		logger.info(`[VectorStore] Indexing note: ${noteId}`);

		const embedding = await EmbeddingService.instance().embed(text);
		const db = this.db_();
		const embeddingBase64 = this.embeddingToBase64_(embedding);

		await db.exec(
			'INSERT OR REPLACE INTO notes_embeddings (note_id, embedding, updated_time, model_version) VALUES (?, ?, ?, ?)',
			[noteId, embeddingBase64, Date.now(), VectorStore.modelVersion],
		);
	}

	public async search(queryText: string, topN = 10, minScore = 0.3): Promise<SearchResult[]> {
		logger.info('[VectorStore] Running vector search');

		const queryEmbedding = await EmbeddingService.instance().embed(queryText);
		const db = this.db_();
		const rows = await db.selectAll<NoteEmbeddingRow>('SELECT note_id, embedding FROM notes_embeddings');

		const scored = rows.map(row => {
			const noteEmbedding = this.base64ToEmbedding_(row.embedding);
			return {
				id: row.note_id,
				score: this.cosineSimilarity(queryEmbedding, noteEmbedding),
			};
		});

		scored.sort((a, b) => {
			if (a.score < b.score) return 1;
			if (a.score > b.score) return -1;
			return 0;
		});

		const filtered = scored
			.filter(r => r.score >= minScore)
			.sort((a, b) => b.score - a.score)
			.slice(0, topN);

		logger.info(`[VectorStore] Top score: ${scored[0]?.score.toFixed(3)}, results above threshold: ${filtered.length}`);

		return filtered;
	}

	private cosineSimilarity(a: number[], b: number[]): number {
		if (!a.length || !b.length) return 0;

		const length = Math.min(a.length, b.length);

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		if (!normA || !normB) return 0;

		return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
	}

	private db_(): JoplinDatabase {
		const db = SearchEngine.instance().db();
		if (!db) {
			throw new Error('[VectorStore] Search engine database is not initialized.');
		}
		return db;
	}

	private embeddingToBase64_(embedding: number[]): string {
		if (!embedding || !embedding.length) return '';
		const floatArray = new Float32Array(embedding);
		const buffer = Buffer.from(floatArray.buffer);
		return buffer.toString('base64');
	}

	private base64ToEmbedding_(base64: string): number[] {
		if (!base64) return [];
		const buffer = Buffer.from(base64, 'base64');
		const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / Float32Array.BYTES_PER_ELEMENT);
		return Array.from(floatArray);
	}
}
