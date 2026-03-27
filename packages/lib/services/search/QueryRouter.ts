export type QueryType = 'keyword' | 'semantic' | 'agent';

const keywordSyntaxRegex = /\b(title|tag|notebook|type|created|updated):/i;
const conversationalRegex = /\b(about|with|from|when|where|meeting|wrote|note|list|find|look|remember)\b/i;
const conversationalPhraseRegex = /(that time|i wrote|i had)/i;
const yearRegex = /\b\d{4}\b/;
const stopWords = new Set(['is', 'a', 'the', 'in', 'of', 'to', 'for', 'with', 'and', 'or', 'but', 'not']);

const tokenCount = (query: string): number => {
	if (!query.trim()) return 0;
	return query.trim().split(/\s+/).length;
};

const firstMatchingSyntaxPrefix = (query: string): string => {
	const match = query.match(keywordSyntaxRegex);
	return match ? match[1].toLowerCase() : '';
};

const conversationalKeyword = (query: string): string => {
	const match = query.match(conversationalRegex);
	return match ? match[1] : '';
};

const conversationalPhrase = (query: string): string => {
	const match = query.match(conversationalPhraseRegex);
	return match ? match[1] : '';
};

const yearMatch = (query: string): string => {
	const match = query.match(yearRegex);
	return match ? match[0] : '';
};

const queryWords = (query: string): string[] => {
	if (!query.trim()) return [];
	return query
		.toLowerCase()
		.split(/\s+/)
		.map(w => w.replace(/[^a-z]/g, ''))
		.filter(w => !!w);
};

const isShortAllStopWordsQuery = (query: string): boolean => {
	const words = queryWords(query);
	if (!words.length || words.length > 4) return false;
	return words.every(w => stopWords.has(w));
};

const isShortMostlyStopWordsQuery = (query: string): boolean => {
	const words = queryWords(query);
	if (!words.length || words.length > 4) return false;

	const stopWordCount = words.filter(w => stopWords.has(w)).length;
	return stopWordCount >= Math.ceil(words.length / 2);
};

// Classifies a user-entered search query into one of three routing categories.
//
// Priority order:
// 1. KEYWORD if query includes Joplin syntax prefixes.
// 2. KEYWORD if query has 3 words or fewer.
// 3. KEYWORD if query is very short and all/mostly stop words.
// 4. AGENT for conversational/long/year-based queries.
// 5. SEMANTIC for all remaining queries.
export function classifyQuery(query: string): QueryType {
	if (firstMatchingSyntaxPrefix(query)) return 'keyword';
	if (tokenCount(query) <= 3) return 'keyword';
	if (isShortAllStopWordsQuery(query)) return 'keyword';
	if (isShortMostlyStopWordsQuery(query)) return 'keyword';

	const hasConversationalKeyword = !!conversationalKeyword(query);
	const hasConversationalPhrase = !!conversationalPhrase(query);
	const isLongQuery = query.length > 60;
	const hasYear = !!yearMatch(query);

	if (hasConversationalKeyword || hasConversationalPhrase || isLongQuery || hasYear) {
		return 'agent';
	}

	return 'semantic';
}

// Returns a human-readable explanation for how and why the query was routed.
//
// The explanation follows the same priority logic as classifyQuery().
export function explainRouting(query: string): string {
	const syntaxPrefix = firstMatchingSyntaxPrefix(query);
	if (syntaxPrefix) {
		return `Classified as KEYWORD: contains Joplin syntax prefix '${syntaxPrefix}:'`;
	}

	const words = tokenCount(query);
	if (words <= 3) {
		return `Classified as KEYWORD: short query (${words} word${words === 1 ? '' : 's'})`;
	}

	if (isShortAllStopWordsQuery(query)) {
		return 'Classified as KEYWORD: very short query composed entirely of stop words';
	}

	if (isShortMostlyStopWordsQuery(query)) {
		return 'Classified as KEYWORD: very short query composed mostly of stop words';
	}

	const reasons: string[] = [];

	const phrase = conversationalPhrase(query);
	if (phrase) reasons.push(`conversational phrase '${phrase}'`);

	const keyword = conversationalKeyword(query);
	if (keyword) reasons.push(`conversational keyword '${keyword}'`);

	if (query.length > 60) reasons.push(`length ${query.length} (> 60)`);

	const year = yearMatch(query);
	if (year) reasons.push(`contains year '${year}'`);

	if (reasons.length) {
		return `Classified as AGENT: ${reasons.join(' and ')}`;
	}

	return 'Classified as SEMANTIC: descriptive query without keyword syntax or conversational markers';
}

// Test cases (input => expected classifyQuery output)
// 1. "title:project notes" => keyword
// 2. "tag:work meeting" => keyword
// 3. "meeting notes" => keyword
// 4. "find that time I wrote about Berlin" => agent
// 5. "notes from 2020 trip" => agent
// 6. "where is the note with onboarding checklist" => agent
// 7. "show me notes about the customer discussion from last quarter and what I had promised" => agent
// 8. "neural network optimization techniques" => semantic
// 9. "garden ideas for spring" => semantic
// 10. "created:day-30 roadmap" => keyword
