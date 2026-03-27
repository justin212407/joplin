#!/usr/bin/env node

// Standalone Semantic Search POC Test
// This script validates the semantic search implementation by:
// 1. Testing query classification (QueryRouter logic)
// 2. Demonstrating embedding generation concept
// 3. Showing the routing flow

function log(message = '') {
	process.stdout.write(`${message}\n`);
}

log('=== Semantic Search POC Standalone Test ===\n');

// ============================================================
// Part 1: Query Router Validation
// ============================================================
log('--- Part 1: QueryRouter Classification Tests ---\n');

// Simulates the queryRouter.classifyQuery() logic
function classifyQuery(query) {
	// Check for keyword syntax (tag:, etc.)
	if (/^(tag|notebook|created|updated|body|title):/i.test(query.trim())) {
		return { type: 'keyword', reason: 'Keyword syntax detected' };
	}

	// Check for very short queries (<=3 words)
	const wordCount = query.trim().split(/\s+/).length;
	if (wordCount <= 3) {
		return { type: 'keyword', reason: `Short query (${wordCount} words)` };
	}

	// Check for conversational markers or complex queries
	const conversationalMarkers = [
		/\b(about|from|meeting with|company|person|where|when|how|what)\b/i,
		/\b\d{4}\b/, // Year pattern
		/\b(morning|afternoon|evening|tomorrow|yesterday|last|next)\b/i,
	];

	if (query.length > 60 || conversationalMarkers.some(pattern => pattern.test(query))) {
		return { type: 'agent', reason: 'Complex conversational query or year/time reference' };
	}

	// Default to semantic search
	return { type: 'semantic', reason: 'General search query' };
}

// Test cases for QueryRouter
const testCases = [
	{ query: 'tag:work', expected: 'keyword', description: 'Tag syntax query' },
	{ query: 'rain', expected: 'keyword', description: 'Single word query' },
	{ query: 'note about a meeting with a company from Germany in 2020', expected: 'agent', description: 'Complex conversational query with year' },
	{ query: 'machine learning neural networks deep learning techniques', expected: 'semantic', description: 'Multi-word semantic query' },
	{ query: 'that time I wrote about the moon', expected: 'agent', description: 'Conversational past reference' },
];

let passCount = 0;
let failCount = 0;

for (let index = 0; index < testCases.length; index++) {
	const testCase = testCases[index];
	const result = classifyQuery(testCase.query);
	const passed = result.type === testCase.expected;
	const status = passed ? '✓ PASS' : '✗ FAIL';

	if (passed) passCount++;
	else failCount++;

	log(`${status} [${index + 1}/${testCases.length}]`);
	log(`  Description: ${testCase.description}`);
	log(`  Query: "${testCase.query}"`);
	log(`  Expected: ${testCase.expected}`);
	log(`  Got: ${result.type} (${result.reason})`);
	log('');
}

log(`Summary: ${passCount} passed, ${failCount} failed out of ${testCases.length} tests\n`);

// ============================================================
// Part 2: Embedding & VectorStore Simulation
// ============================================================
log('--- Part 2: Embedding & Vector Search Simulation ---\n');

// Simulates cosine similarity calculation
function cosineSimilarity(vecA, vecB) {
	if (vecA.length !== vecB.length) {
		throw new Error('Vector dimensions must match');
	}

	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < vecA.length; i++) {
		dotProduct += vecA[i] * vecB[i];
		normA += vecA[i] * vecA[i];
		normB += vecB[i] * vecB[i];
	}

	normA = Math.sqrt(normA);
	normB = Math.sqrt(normB);

	if (normA === 0 || normB === 0) return 0;
	return dotProduct / (normA * normB);
}

// Generates a mock 384-dimensional embedding
// (In real implementation, this comes from Xenova/all-MiniLM-L6-v2)
function generateMockEmbedding(text) {
	// Simple hash-based mock for demonstration
	let seed = 0;
	for (let i = 0; i < text.length; i++) {
		seed = ((seed << 5) - seed) + text.charCodeAt(i);
		seed = seed & seed; // Convert to 32bit integer
	}

	const embedding = new Float32Array(384);
	seed += 1;

	for (let i = 0; i < 384; i++) {
		// Pseudo-random based on seed
		const val = Math.sin(seed + i * 12.9898) * 43758.5453;
		embedding[i] = val - Math.floor(val);
	}

	// Normalize
	let norm = 0;
	for (let i = 0; i < 384; i++) {
		norm += embedding[i] * embedding[i];
	}
	norm = Math.sqrt(norm);
	for (let i = 0; i < 384; i++) {
		embedding[i] /= norm;
	}

	return embedding;
}

// Mock indexed notes
const note1 = {
	id: 'note-1',
	title: 'German Business Meeting',
	body: 'Met with the German company today to discuss business opportunities.',
};

const note2 = {
	id: 'note-2',
	title: 'Rainy Day Thoughts',
	body: 'It was raining this morning. I decided to stay inside and read.',
};

// Generate embeddings
log('Generating embeddings for 2 sample notes...');
const embedding1 = generateMockEmbedding(`${note1.title} ${note1.body}`);
const embedding2 = generateMockEmbedding(`${note2.title} ${note2.body}`);

log(`Embedding 1 dimensions: ${embedding1.length}`);
log(`Embedding 2 dimensions: ${embedding2.length}\n`);

// Search query
const searchQuery = 'German business meeting company';
const queryEmbedding = generateMockEmbedding(searchQuery);

log(`Search query: "${searchQuery}"`);
log(`Query embedding dimensions: ${queryEmbedding.length}\n`);

// Calculate similarities
const score1 = cosineSimilarity(queryEmbedding, embedding1);
const score2 = cosineSimilarity(queryEmbedding, embedding2);

log('Vector search results (ranked by relevance):');
const results = [
	{ note: note1, score: score1 },
	{ note: note2, score: score2 },
].sort((a, b) => b.score - a.score);

for (let index = 0; index < results.length; index++) {
	const result = results[index];
	log(`#${index + 1} ${result.note.id} score=${result.score.toFixed(6)}`);
	log(`    Title: ${result.note.title}`);
}

const rankingCorrect = score1 > score2;
log(`\n${rankingCorrect ? '✓ PASS' : '✗ FAIL'}: note-1 scored higher than note-2 (expected for "German business meeting" query)\n`);

// ============================================================
// Part 3: Query Router Integration Flow
// ============================================================
log('--- Part 3: Search Flow Trace ---\n');

const traceQuery = 'note about a meeting with a German company in 2020';

log(`Input query: "${traceQuery}"`);
const routerResult = classifyQuery(traceQuery);

log(`[SearchRouter] Query type: ${routerResult.type}`);
log(`[SearchRouter] Reason: ${routerResult.reason}`);

if (routerResult.type === 'semantic') {
	log('[SemanticSearchEngine] Searching vector store...');
	log('[VectorStore] Generated embedding from query text');
	log('[VectorStore] Computing cosine similarity with 2 indexed embeddings');
	log('[VectorStore] Returning top results sorted by similarity');
} else if (routerResult.type === 'agent') {
	log('[AgentSearchEngine] Translating natural language to Joplin syntax...');
	log('[AgentSearchEngine] Calling LLM (Anthropic/OpenAI API)');
	log('[AgentSearchEngine] Example translation: "note:*German* tag:meeting created:2020"');
	log('[SearchRouter] Using translated query for keyword search');
}

log('\n=== Test Complete ===');
log(`All QueryRouter tests: ${failCount === 0 ? '✓ PASSED' : '✗ SOME FAILED'}`);
