import fs from 'fs-extra';
import Logger from '@joplin/utils/Logger';
import JoplinDatabase from '../JoplinDatabase';
import SearchEngine from '../services/search/SearchEngine';
import EmbeddingService from '../services/search/EmbeddingService';
import VectorStore from '../services/search/VectorStore';
import { classifyQuery } from '../services/search/QueryRouter';

const logger = Logger.create('semanticSearchPocTest');

const { DatabaseDriverNode } = require('../database-driver-node.js');

const note1Text = 'Monday meeting with Klaus from Berlin about contracts';
const note2Text = 'Recipe for chocolate cake with almonds';

const run = async () => {
	const dbPath = `${process.cwd()}/tmp/semantic-poc-test.sqlite`;

	await fs.mkdirp(`${process.cwd()}/tmp`);

	const db = new JoplinDatabase(new DatabaseDriverNode());
	db.setLogExcludedQueryTypes(['SELECT']);
	await db.open({ name: dbPath });

	SearchEngine.instance().setDb(db);

	const embeddingService = EmbeddingService.instance();
	const vectorStore = VectorStore.instance();

	logger.info('--- Embedding sanity check ---');
	const embedding1 = await embeddingService.embed(note1Text);
	const embedding2 = await embeddingService.embed(note2Text);
	logger.info('Embedding #1 length:', embedding1.length);
	logger.info('Embedding #2 length:', embedding2.length);

	await db.exec('DELETE FROM notes_embeddings');

	logger.info('--- Vector index + search test ---');
	await vectorStore.indexNote('note-1', note1Text);
	await vectorStore.indexNote('note-2', note2Text);

	const ranked = await vectorStore.search('German business meeting', 10);
	for (let i = 0; i < ranked.length; i++) {
		const row = ranked[i];
		logger.info(`#${i + 1} ${row.id} score=${row.score.toFixed(6)}`);
	}

	const note1 = ranked.find(r => r.id === 'note-1');
	const note2 = ranked.find(r => r.id === 'note-2');
	if (note1 && note2 && note1.score > note2.score) {
		logger.info('PASS: note-1 scored higher than note-2 as expected.');
	} else {
		logger.warn('expected note-1 to score higher than note-2, but it did not.');
	}

	logger.info('--- QueryRouter classifyQuery test cases ---');
	const testCases: { input: string; expected: 'keyword' | 'semantic' | 'agent' }[] = [
		{ input: 'tag:work meeting', expected: 'keyword' },
		{ input: 'rain', expected: 'keyword' },
		{ input: 'note about a meeting with a company from Germany in 2020', expected: 'agent' },
		{ input: 'machine learning neural networks deep learning', expected: 'semantic' },
		{ input: 'that time I wrote about the moon', expected: 'agent' },
	];

	for (const testCase of testCases) {
		const actual = classifyQuery(testCase.input);
		const status = actual === testCase.expected ? 'PASS' : 'FAIL';
		logger.info(`[${status}] ${testCase.input} => ${actual} (expected: ${testCase.expected})`);
	}

	await db.close();
};

void run();
