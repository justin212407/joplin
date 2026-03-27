import Note from '../../models/Note';
import Logger from '@joplin/utils/Logger';
import VectorStore from './VectorStore';
import SearchEngine from './SearchEngine';
import JoplinDatabase from '../../JoplinDatabase';
import { NoteEntity } from '../database/types';

const logger = Logger.create('SemanticIndexer');

interface NoteIdRow {
	id: string;
}

export default class SemanticIndexer {

	public static instance_: SemanticIndexer|null = null;
	private static readonly maxTextLength = 2000;
	private isRunning_ = false;

	public static instance() {
		if (SemanticIndexer.instance_) return SemanticIndexer.instance_;
		SemanticIndexer.instance_ = new SemanticIndexer();
		return SemanticIndexer.instance_;
	}

	public async indexNote(noteId: string): Promise<void> {
		const notes = await Note.previews('', {
			order: [],
			fields: ['id', 'title', 'body', 'encryption_applied'],
			conditions: ['id = ?'],
			conditionsParams: [noteId],
		});

		if (!notes.length) {
			logger.info(`[SemanticIndexer] Skipping note ${noteId}: not found`);
			return;
		}

		const note = notes[0] as NoteEntity;
		if (note.encryption_applied) {
			logger.info(`[SemanticIndexer] Skipping note ${noteId}: encrypted`);
			return;
		}

		const text = `${note.title || ''}\n\n${note.body || ''}`.slice(0, SemanticIndexer.maxTextLength);
		await VectorStore.instance().indexNote(noteId, text);
		logger.info(`[SemanticIndexer] Indexed note: ${note.title || '(untitled)'}`);
	}

	public async indexAll(): Promise<void> {
		if (this.isRunning_) {
			logger.info('[SemanticIndexer] indexAll already running; skipping');
			return;
		}

		this.isRunning_ = true;

		try {
			const notes = await Note.all({ fields: ['id'] }) as NoteIdRow[];
			logger.info(`[SemanticIndexer] Starting full indexing: ${notes.length} notes`);

			for (const note of notes) {
				await this.indexNote(note.id);
			}

			logger.info('[SemanticIndexer] Full indexing complete');
		} finally {
			this.isRunning_ = false;
		}
	}

	public async deleteNote(noteId: string): Promise<void> {
		await this.db_().exec('DELETE FROM notes_embeddings WHERE note_id = ?', [noteId]);
		logger.info(`[SemanticIndexer] Deleted note embedding: ${noteId}`);
	}

	private db_(): JoplinDatabase {
		const db = SearchEngine.instance().db();
		if (!db) {
			throw new Error('[SemanticIndexer] Search engine database is not initialized.');
		}
		return db;
	}
}
