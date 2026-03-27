import { SqlQuery } from '../types';

export default (): (SqlQuery|string)[] => {
	return [
		`CREATE TABLE IF NOT EXISTS notes_embeddings (
			note_id TEXT PRIMARY KEY,
			embedding TEXT NOT NULL,
			updated_time INTEGER NOT NULL,
			model_version TEXT NOT NULL
		)`,
		'CREATE INDEX IF NOT EXISTS notes_embeddings_updated ON notes_embeddings(updated_time)',
	];
};
