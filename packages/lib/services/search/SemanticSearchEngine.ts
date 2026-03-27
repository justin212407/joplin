import EmbeddingService from './EmbeddingService';
import VectorStore from './VectorStore';
import SearchEngine from './SearchEngine';
import JoplinDatabase from '../../JoplinDatabase';
import Logger from '@joplin/utils/Logger';

const logger = Logger.create('SemanticSearchEngine');

interface SearchResult {
	id: string;
	score: number;
}

interface CountRow {
	total: number;
}

export default class SemanticSearchEngine {

	public static instance_: SemanticSearchEngine|null = null;

	public static instance() {
		if (SemanticSearchEngine.instance_) return SemanticSearchEngine.instance_;
		SemanticSearchEngine.instance_ = new SemanticSearchEngine();
		return SemanticSearchEngine.instance_;
	}

	public async search(query: string, topN = 10): Promise<SearchResult[]> {
		logger.info(`[SemanticSearch] Query: ${query}`);

		try {
			const results = await VectorStore.instance().search(query, topN);
			logger.info(`[SemanticSearch] Result count: ${results.length}`);
			return results;
		} catch (error) {
			logger.warn('[SemanticSearch] Search failed, returning empty results', error);
			return [];
		}
	}

	public isReady(): boolean {
		return EmbeddingService.instance().isInitialized();
	}

	public async getIndexedCount(): Promise<number> {
		const row = await this.db_().selectOne('SELECT COUNT(*) as total FROM notes_embeddings') as CountRow;
		return row && row.total ? row.total : 0;
	}

	private db_(): JoplinDatabase {
		const db = SearchEngine.instance().db();
		if (!db) {
			throw new Error('[SemanticSearch] Search engine database is not initialized.');
		}
		return db;
	}
}
