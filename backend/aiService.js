// IMPORTANT: Load config first to ensure we use backend/.env
import './config.js';

import OpenAI from 'openai';

let openai = null;

// Initialize OpenAI only if API key is available and not a placeholder
if (process.env.OPENAI_API_KEY) {
  try {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Test the API key
    // TODO: uncomment this to check for valid key
    //  await openai.chat.completions.create({
    //     model: 'gpt-4o-mini',
    //     messages: [{ role: 'user', content: 'JSON' }],
    //     temperature: 0.3,
    //     response_format: { type: 'json_object' }
    //   });
    
    console.log("Key valid: ", process.env.OPENAI_API_KEY);
  } catch (error) {
    console.log("Key invalid: ", error);
    openai = null;
  }

}

/**
 * Extracts search intent from natural language query
 * Returns structured search criteria
 */
export async function interpretSearchQuery(query, documents) {
  if (!openai) {
    // Fallback to simple text matching if no API key
    return fallbackSearch(query, documents);
  }

  try {
    const prompt = `You are a search query interpreter for a document management system.
Analyze the user's search query and extract relevant search criteria.

User query: "${query}"

Available documents:
${documents.map(doc => `- ID: ${doc.id}, Title: "${doc.title}", Created: ${doc.createdAt}, Updated: ${doc.updatedAt}`).join('\n')}

Based on the query, determine:
1. Is the user looking for documents by date? If yes, extract the date/time reference.
2. Is the user looking for documents by topic/content? If yes, extract keywords.
3. Is the user looking for documents by type (essay, notes, report, etc.)? If yes, extract the type.
4. Any other relevant criteria mentioned.

Respond ONLY with a JSON object in this exact format:
{
  "keywords": ["keyword1", "keyword2"],
  "dateReference": "YYYY-MM-DD or null",
  "documentType": "essay|notes|report|null",
  "topics": ["topic1", "topic2"],
  "searchStrategy": "brief explanation of what to look for"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });
    console.log(response)

    const interpretation = JSON.parse(response.choices[0].message.content);
    return interpretation;
  } catch (error) {
    console.error('Error interpreting search query:', error);
    return fallbackSearch(query, documents);
  }
}

/**
 * Analyzes document content to extract metadata
 */
export async function analyzeDocumentContent(title, content) {
  if (!openai) {
    // Fallback to simple analysis
    return {
      topics: [],
      documentType: 'document',
      summary: ''
    };
  }

  try {
    const textContent = stripHtml(content);
    const prompt = `Analyze this document and extract metadata.

Title: "${title}"
Content: "${textContent.substring(0, 1000)}..."

Respond ONLY with a JSON object in this exact format:
{
  "topics": ["topic1", "topic2"],
  "documentType": "essay|notes|report|list|brainstorm|meeting_notes|other",
  "summary": "brief one-sentence summary"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Error analyzing document:', error);
    return {
      topics: [],
      documentType: 'document',
      summary: ''
    };
  }
}

/**
 * Scores and ranks documents based on search interpretation
 */
export async function rankDocuments(interpretation, documents) {
  if (!openai) {
    return fallbackRanking(interpretation, documents);
  }

  try {
    const prompt = `You are a document ranking system. Based on the search criteria, rank the following documents by relevance.

Search criteria:
${JSON.stringify(interpretation, null, 2)}

Documents:
${documents.map((doc, idx) => `${idx + 1}. ID: ${doc.id}
   Title: "${doc.title}"
   Created: ${doc.createdAt}
   Updated: ${doc.updatedAt}
   Topics: ${doc.metadata?.topics?.join(', ') || 'none'}
   Type: ${doc.metadata?.documentType || 'unknown'}
   Summary: ${doc.metadata?.summary || 'none'}
`).join('\n')}

Respond ONLY with a JSON object containing document IDs ranked by relevance:
{
  "rankedIds": ["id1", "id2", "id3"],
  "reasoning": "brief explanation of ranking"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const ranking = JSON.parse(response.choices[0].message.content);
    return ranking.rankedIds;
  } catch (error) {
    console.error('Error ranking documents:', error);
    return fallbackRanking(interpretation, documents);
  }
}

/**
 * Fallback search when OpenAI is not available
 */
function fallbackSearch(query, documents) {
  const lowerQuery = query.toLowerCase();
  const keywords = lowerQuery.split(/\s+/).filter(word => word.length > 2);

  // Simple date extraction
  const dateMatch = lowerQuery.match(/(\d{1,2})\/(\d{1,2})/);
  let dateReference = null;
  if (dateMatch) {
    const month = dateMatch[1].padStart(2, '0');
    const day = dateMatch[2].padStart(2, '0');
    const year = new Date().getFullYear();
    dateReference = `${year}-${month}-${day}`;
  }

  // Simple type detection
  let documentType = null;
  if (lowerQuery.includes('essay')) documentType = 'essay';
  else if (lowerQuery.includes('note')) documentType = 'notes';
  else if (lowerQuery.includes('meeting')) documentType = 'meeting_notes';

  return {
    keywords,
    dateReference,
    documentType,
    topics: keywords,
    searchStrategy: 'Simple keyword and date matching'
  };
}

/**
 * Fallback ranking using simple scoring
 */
function fallbackRanking(interpretation, documents) {
  const scored = documents.map(doc => {
    let score = 0;
    const docLower = (doc.title + ' ' + (doc.content || '')).toLowerCase();

    // Score by keywords
    if (interpretation.keywords) {
      interpretation.keywords.forEach(keyword => {
        if (docLower.includes(keyword.toLowerCase())) {
          score += 10;
        }
      });
    }

    // Score by date
    if (interpretation.dateReference && doc.createdAt) {
      const docDate = new Date(doc.createdAt).toISOString().split('T')[0];
      if (docDate === interpretation.dateReference) {
        score += 20;
      }
    }

    // Score by document type
    if (interpretation.documentType && doc.metadata?.documentType === interpretation.documentType) {
      score += 15;
    }

    return { id: doc.id, score };
  });

  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.id);
}

/**
 * Generates AI-powered text improvement suggestions
 */
export async function suggestTextImprovement(text) {
  if (!openai) {
    // Fallback to simple suggestion when OpenAI is not available
    return {
      suggestion: text,
      message: 'AI suggestions not available - OpenAI API key not configured'
    };
  }

  try {
    const prompt = `You are a professional writing assistant. Analyze the following text and suggest improvements. You can:
- Rephrase the entire sentence for better clarity
- Fix grammar and spelling errors
- Improve word choice and tone
- Make it more concise
- Enhance readability

Only suggest changes if there are meaningful improvements to make. If the text is already good, you can make minor refinements or keep it largely the same.

Original text:
"${text}"

Respond ONLY with a JSON object in this exact format:
{
  "suggestion": "the improved version of the text",
  "changes": "brief description of what you changed and why"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0].message.content);
    return result;
  } catch (error) {
    console.error('Error generating text suggestion:', error);
    return {
      suggestion: text,
      message: 'Error generating suggestion'
    };
  }
}

/**
 * Strips HTML tags from content
 */
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
