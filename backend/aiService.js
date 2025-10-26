// IMPORTANT: Load config first to ensure we use backend/.env
import './config.js';

import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

// Get AI provider from environment (defaults to 'gemini')
const AI_PROVIDER = process.env.AI_PROVIDER || 'gemini';

let genAI = null;
let geminiModel = null;
let openai = null;

// Initialize the selected AI provider
if (AI_PROVIDER === 'gemini' && process.env.GEMINI_API_KEY) {
  try {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    geminiModel = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        responseMimeType: 'application/json',
      }
    });
    console.log("AI Provider: Gemini (gemini-2.0-flash-exp)");
  } catch (error) {
    console.log("Gemini initialization error: ", error);
    genAI = null;
    geminiModel = null;
  }
} else if (AI_PROVIDER === 'openai' && process.env.OPENAI_API_KEY) {
  try {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log("AI Provider: OpenAI (gpt-4o-mini)");
  } catch (error) {
    console.log("OpenAI initialization error: ", error);
    openai = null;
  }
} else {
  console.log(`AI Provider not configured. Set AI_PROVIDER to 'openai' or 'gemini' and provide the corresponding API key.`);
}

/**
 * Helper function to call AI API (supports both OpenAI and Gemini)
 * @param {string} prompt - The prompt to send to the AI
 * @param {boolean} jsonMode - Whether to request JSON format (default: true)
 */
async function callAI(prompt, jsonMode = true) {
  if (AI_PROVIDER === 'openai' && openai) {
    const config = {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    };

    // Only add JSON format if requested and prompt mentions JSON
    if (jsonMode) {
      config.response_format = { type: 'json_object' };
    }

    const response = await openai.chat.completions.create(config);
    return response.choices[0].message.content;
  } else if (AI_PROVIDER === 'gemini' && geminiModel) {
    const result = await geminiModel.generateContent(prompt);
    const response = result.response;
    return response.text();
  } else {
    throw new Error('No AI provider configured');
  }
}

/**
 * Extracts search intent from natural language query
 * Returns structured search criteria
 */
export async function interpretSearchQuery(query, documents) {
  if (!geminiModel && !openai) {
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

    const text = await callAI(prompt);
    console.log(text);

    const interpretation = JSON.parse(text);
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
  if (!geminiModel && !openai) {
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

    const text = await callAI(prompt);
    return JSON.parse(text);
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
  if (!geminiModel && !openai) {
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

    const text = await callAI(prompt);
    const ranking = JSON.parse(text);
    return ranking.rankedIds;
  } catch (error) {
    console.error('Error ranking documents:', error);
    return fallbackRanking(interpretation, documents);
  }
}

/**
 * Fallback search when AI is not available
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
  if (!geminiModel && !openai) {
    // Fallback to simple suggestion when AI is not available
    return {
      suggestion: text,
      message: 'AI suggestions not available - API key not configured'
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

    const responseText = await callAI(prompt);
    const parsedResult = JSON.parse(responseText);
    return parsedResult;
  } catch (error) {
    console.error('Error generating text suggestion:', error);
    return {
      suggestion: text,
      message: 'Error generating suggestion'
    };
  }
}

/**
 * Detects if an action item is email-related
 */
function isEmailTask(description, details) {
  const text = `${description} ${details || ''}`.toLowerCase();
  const hasEmailKeyword = text.includes('mail');
  const hasEmailAddress = /\S+@\S+\.\S+/.test(text);
  return hasEmailKeyword || hasEmailAddress;
}

/**
 * Detects if an action item is calendar-related
 */
function isCalendarTask(description, details) {
  const text = `${description} ${details || ''}`.toLowerCase();
  const hasCalendarKeyword = 
    text.includes('meet') ||
    text.includes('schedule') ||
    text.includes('call') ||
    text.includes('appointment') ||
    text.includes('reminder') ||
    text.includes('conference');
  const hasDate = /\d{1,2}\/\d{1,2}/.test(text) || /\d{1,2}-\d{1,2}/.test(text);
  const hasTime = /\d{1,2}:\d{2}/.test(text) || /\d{1,2}\s?(am|pm)/i.test(text);
  
  return hasCalendarKeyword || (hasDate && hasTime);
}

/**
 * Detects if an action item is word/text editing related
 */
function isWordEditTask(description, details) {
  const text = `${description} ${details || ''}`.toLowerCase();
  
  const editKeywords = [
    'edit', 'rewrite', 'revise', 'improve', 'fix', 'update',
    'rephrase', 'clarify', 'enhance', 'polish', 'proofread',
    'change', 'modify', 'adjust', 'refine'
  ];
  
  const contentKeywords = [
    'paragraph', 'section', 'sentence', 'text', 'content',
    'introduction', 'conclusion', 'summary', 'chapter',
    'wording', 'grammar', 'tone', 'intro', 'body'
  ];
  
  const hasEditKeyword = editKeywords.some(k => text.includes(k));
  const hasContentKeyword = contentKeywords.some(k => text.includes(k));
  
  return hasEditKeyword && hasContentKeyword;
}

/**
 * Extracts action items from document content
 */
export async function extractActionItems(documentId, title, content) {
  if (!geminiModel && !openai) {
    // Fallback to simple pattern matching
    return fallbackExtractActionItems(documentId, title, content);
  }

  try {
    const textContent = stripHtml(content);
    const prompt = `You are an action item detector. Analyze the following document and extract any action items, tasks, or TODOs mentioned.

Document Title: "${title}"
Content: "${textContent}"

Look for:
- TODO items
- Action items
- Tasks to complete
- Things that need to be done
- Emails to send
- Calls to make
- Deadlines or reminders

For each action item found, extract:
1. The complete action description (KEEP email addresses, names, and subjects in the description - do NOT remove them)
2. Any additional context or notes (only use this for extra information that isn't part of the core task)
3. Priority (if mentioned)

IMPORTANT: Keep the description complete and intact. For example:
- "Email john@example.com about project update" should stay as "Email john@example.com about project update"
- Do NOT split the email address into the details field
- Only put supplementary information in details

Respond ONLY with a JSON object in this exact format:
{
  "actionItems": [
    {
      "description": "the complete action item description with all names, emails, and subjects",
      "details": "only additional context if any, empty string if none",
      "priority": "high|medium|low|none"
    }
  ]
}

If no action items are found, return an empty array.`;

    const text = await callAI(prompt);
    const result = JSON.parse(text);

    // Add document ID and email detection to each action item
    return result.actionItems.map(item => ({
      ...item,
      documentId,
      documentTitle: title,
      createdAt: new Date().toISOString(),
      isEmailTask: isEmailTask(item.description, item.details),
      emailDraft: null,
      isCalendarTask: isCalendarTask(item.description, item.details),
      calendarEvent: null,
      isWordEditTask: isWordEditTask(item.description, item.details),
      wordEdit: null
    }));
  } catch (error) {
    console.error('Error extracting action items:', error);
    return fallbackExtractActionItems(documentId, title, content);
  }
}

/**
 * Checks if two action items are semantically similar/duplicates
 * Returns true if tasks are essentially the same despite different wording
 */
export async function areTasksSimilar(task1, task2) {
  if (!geminiModel && !openai) {
    // Fallback to exact string matching
    return task1.description.toLowerCase().trim() === task2.description.toLowerCase().trim();
  }

  try {
    const prompt = `You are a task similarity detector. Determine if these two tasks are essentially the same action item, even if worded differently.

Task 1: "${task1.description}"
Details 1: "${task1.details || 'none'}"

Task 2: "${task2.description}"
Details 2: "${task2.details || 'none'}"

Consider tasks as duplicates if:
- They describe the same action with the same recipient/subject
- Minor wording differences like "send email" vs "send an email"
- Same core action even with slight variations

Do NOT consider as duplicates if:
- The recipient or subject is different
- The action is different
- The context or purpose is different

Respond ONLY with a JSON object in this exact format:
{
  "areSimilar": true or false,
  "reasoning": "brief explanation why they are or aren't similar"
}`;

    const text = await callAI(prompt);
    const result = JSON.parse(text);
    return result.areSimilar;
  } catch (error) {
    console.error('Error checking task similarity:', error);
    // Fallback to exact string matching on error
    return task1.description.toLowerCase().trim() === task2.description.toLowerCase().trim();
  }
}

/**
 * Drafts an email from an action item task
 */
export async function draftEmailFromTask(task, documentContext) {
  if (!geminiModel && !openai) {
    // Fallback to simple template
    return fallbackEmailDraft(task);
  }

  try {
    const prompt = `You are an email writing assistant. Draft a professional email based on this action item.

Action item: "${task.description}"
Additional details: "${task.details || 'none'}"
Document title: "${task.documentTitle || 'Untitled'}"
Document context: "${documentContext ? documentContext.substring(0, 500) : 'none'}"

Extract and provide:
1. Recipient email address (if mentioned, otherwise leave as empty string)
2. Appropriate subject line based on the context
3. Professional email body with proper greeting and signature

Respond ONLY with a JSON object in this exact format:
{
  "recipient": "email@example.com or empty string if not found",
  "subject": "Subject line",
  "body": "Email body with proper greeting and closing\\n\\nBest regards"
}`;

    const text = await callAI(prompt);
    const result = JSON.parse(text);
    
    // Generate mailto link
    const mailtoLink = createMailtoLink(result.recipient, result.subject, result.body);
    
    return {
      to: result.recipient,
      subject: result.subject,
      body: result.body,
      mailtoLink,
      draftedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error drafting email:', error);
    return fallbackEmailDraft(task);
  }
}

/**
 * Fallback email draft when AI is not available
 */
function fallbackEmailDraft(task) {
  // Try to extract email from description
  const emailMatch = task.description.match(/\S+@\S+\.\S+/);
  const recipient = emailMatch ? emailMatch[0] : '';
  
  // Simple subject based on description
  const subject = task.description.replace(/email|send|to/gi, '').trim().substring(0, 50);
  
  // Simple body template
  const body = `Hi,\n\nRegarding: ${task.description}\n\n[Please add your message here]\n\nBest regards`;
  
  const mailtoLink = createMailtoLink(recipient, subject, body);
  
  return {
    to: recipient,
    subject: subject || 'Follow-up',
    body,
    mailtoLink,
    draftedAt: new Date().toISOString()
  };
}

/**
 * Creates a mailto link from email components
 */
function createMailtoLink(to, subject, body) {
  const params = [];
  
  if (subject) {
    params.push(`subject=${encodeURIComponent(subject)}`);
  }
  
  if (body) {
    params.push(`body=${encodeURIComponent(body)}`);
  }
  
  const recipientPart = to || '';
  const paramString = params.join('&');
  
  return `mailto:${recipientPart}${paramString ? '?' + paramString : ''}`;
}

/**
 * Creates a calendar event from an action item task
 */
export async function createCalendarEventFromTask(task, documentContext) {
  if (!geminiModel && !openai) {
    return fallbackCalendarEvent(task);
  }

  try {
    const today = new Date();
    const currentDate = today.toISOString().split('T')[0];
    const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' });
    const monthName = today.toLocaleDateString('en-US', { month: 'long' });
    const dayOfMonth = today.getDate();
    const currentYear = today.getFullYear();
    
    const prompt = `You are a calendar event creator. Extract event details from this action item.

Action item: "${task.description}"
Additional details: "${task.details || 'none'}"
Document title: "${task.documentTitle || 'Untitled'}"
Document context: "${documentContext ? documentContext.substring(0, 500) : 'none'}"

CURRENT DATE INFORMATION:
- Today is: ${dayOfWeek}, ${monthName} ${dayOfMonth}, ${currentYear}
- Today's date: ${currentDate}

Extract and provide:
1. Event title (concise and clear)
2. Start date in YYYY-MM-DD format
3. Start time in HH:MM 24-hour format (e.g., 14:00 for 2pm)
4. Duration in minutes (default 60 if not specified)
5. Description (from context)
6. Location (if mentioned, otherwise empty)
7. Is it an all-day event? (true/false)

IMPORTANT DATE CALCULATIONS:
- For relative dates like "tomorrow", "next week", "next Tuesday", calculate the actual date based on TODAY being ${currentDate} (${dayOfWeek})
- For specific dates like "12/25", use the current year ${currentYear} unless context suggests otherwise
- For times like "3pm" convert to 24-hour format
- If no specific time is given, use 09:00 as default

Respond ONLY with a JSON object in this exact format:
{
  "title": "Event title",
  "startDate": "YYYY-MM-DD",
  "startTime": "HH:MM",
  "durationMinutes": 60,
  "description": "Event description",
  "location": "Location or empty string",
  "isAllDay": false
}`;

    const text = await callAI(prompt);
    const result = JSON.parse(text);
    
    const eventData = {
      title: result.title,
      startDate: result.startDate,
      startTime: result.startTime,
      durationMinutes: result.durationMinutes,
      description: result.description,
      location: result.location,
      isAllDay: result.isAllDay
    };
    
    const icsContent = generateICS(eventData);
    const googleCalendarURL = generateGoogleCalendarURL(eventData);
    
    return {
      ...eventData,
      icsContent,
      googleCalendarURL,
      createdAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return fallbackCalendarEvent(task);
  }
}

/**
 * Fallback calendar event when AI is not available
 */
function fallbackCalendarEvent(task) {
  const today = new Date();
  let startDate = today.toISOString().split('T')[0];
  let startTime = '09:00';
  
  const description = task.description.toLowerCase();
  
  // Check for relative dates
  if (description.includes('tomorrow')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    startDate = tomorrow.toISOString().split('T')[0];
  } else if (description.includes('next week')) {
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    startDate = nextWeek.toISOString().split('T')[0];
  }
  
  // Try to extract specific date (MM/DD format)
  const dateMatch = task.description.match(/(\d{1,2})\/(\d{1,2})/);
  if (dateMatch) {
    const month = dateMatch[1].padStart(2, '0');
    const day = dateMatch[2].padStart(2, '0');
    startDate = `${today.getFullYear()}-${month}-${day}`;
  }
  
  // Try to extract time
  const timeMatch = task.description.match(/(\d{1,2}):?(\d{2})?\s?(am|pm)/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] || '00';
    const meridiem = timeMatch[3]?.toLowerCase();
    
    if (meridiem === 'pm' && hours !== 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    
    startTime = `${hours.toString().padStart(2, '0')}:${minutes}`;
  }
  
  const title = task.description.substring(0, 50);
  const eventData = {
    title,
    startDate,
    startTime,
    durationMinutes: 60,
    description: task.details || '',
    location: '',
    isAllDay: false
  };
  
  const icsContent = generateICS(eventData);
  const googleCalendarURL = generateGoogleCalendarURL(eventData);
  
  return {
    ...eventData,
    icsContent,
    googleCalendarURL,
    createdAt: new Date().toISOString()
  };
}

/**
 * Generates Google Calendar URL for event
 */
function generateGoogleCalendarURL(event) {
  const [year, month, day] = event.startDate.split('-');
  const [hours, minutes] = event.startTime.split(':');
  
  const startDateTime = new Date(year, month - 1, day, hours, minutes);
  const endDateTime = new Date(startDateTime.getTime() + event.durationMinutes * 60000);
  
  const formatGoogleDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${y}${m}${d}T${h}${min}${s}`;
  };
  
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatGoogleDate(startDateTime)}/${formatGoogleDate(endDateTime)}`,
    details: event.description,
    location: event.location
  });
  
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generates ICS file content for calendar event
 */
function generateICS(event) {
  const now = new Date();
  const uid = `${now.getTime()}@doceditor`;
  
  // Parse start date and time
  const [year, month, day] = event.startDate.split('-');
  const [hours, minutes] = event.startTime.split(':');
  
  const startDateTime = new Date(year, month - 1, day, hours, minutes);
  const endDateTime = new Date(startDateTime.getTime() + event.durationMinutes * 60000);
  
  // Format dates for ICS (YYYYMMDDTHHMMSS)
  const formatICSDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${y}${m}${d}T${h}${min}${s}`;
  };
  
  const formatAllDayDate = (dateStr) => {
    const [y, m, d] = dateStr.split('-');
    return `${y}${m}${d}`;
  };
  
  const startStr = event.isAllDay ? formatAllDayDate(event.startDate) : formatICSDate(startDateTime);
  const endStr = event.isAllDay ? formatAllDayDate(event.startDate) : formatICSDate(endDateTime);
  const dateType = event.isAllDay ? ';VALUE=DATE' : '';
  
  // Escape special characters in ICS format
  const escapeICS = (str) => {
    return str.replace(/[\\,;]/g, '\\$&').replace(/\n/g, '\\n');
  };
  
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//DocEditor//Calendar//EN
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${formatICSDate(now)}
DTSTART${dateType}:${startStr}
DTEND${dateType}:${endStr}
SUMMARY:${escapeICS(event.title)}
DESCRIPTION:${escapeICS(event.description)}
LOCATION:${escapeICS(event.location)}
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;
}

/**
 * Generates a word/text edit from an action item task
 */
export async function generateWordEdit(task, documentContext) {
  if (!geminiModel && !openai) {
    return fallbackWordEdit(task, documentContext);
  }

  try {
    const textContent = stripHtml(documentContext);
    
    const prompt = `You are a professional editor. Analyze this editing task and the document content.

Task: "${task.description}"
Additional details: "${task.details || 'none'}"
Document title: "${task.documentTitle || 'Untitled'}"

Full document content:
"${textContent.substring(0, 3000)}"

Your job:
1. Identify the specific text section that needs editing based on the task description
2. Provide an improved version of that text
3. Explain what you changed and why

IMPORTANT:
- Find the most relevant text section (max 500 characters)
- If the task mentions "introduction", "conclusion", "paragraph 2", etc., find that specific section
- Improve grammar, clarity, tone, and engagement
- Keep the same general meaning unless asked to change it

Respond ONLY with a JSON object in this exact format:
{
  "targetText": "the original text section you identified",
  "suggestedEdit": "your improved version of the text",
  "explanation": "brief explanation of what you changed and why",
  "location": "where in document (e.g., 'introduction', 'second paragraph', 'conclusion')"
}`;

    const text = await callAI(prompt);
    const result = JSON.parse(text);
    
    return {
      targetText: result.targetText,
      suggestedEdit: result.suggestedEdit,
      explanation: result.explanation,
      location: result.location,
      createdAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error generating word edit:', error);
    return fallbackWordEdit(task, documentContext);
  }
}

/**
 * Fallback word edit when AI is not available
 */
function fallbackWordEdit(task, documentContext) {
  const textContent = stripHtml(documentContext);
  
  // Try to find a section to edit (first paragraph as fallback)
  const paragraphs = textContent.split('\n').filter(p => p.trim().length > 0);
  const targetText = paragraphs[0] ? paragraphs[0].substring(0, 500) : 'No text found to edit';
  
  return {
    targetText,
    suggestedEdit: targetText,
    explanation: 'AI editing not available. Please manually edit the text.',
    location: 'first paragraph',
    createdAt: new Date().toISOString()
  };
}

/**
 * Fallback action item extraction using pattern matching
 */
function fallbackExtractActionItems(documentId, title, content) {
  const textContent = stripHtml(content);
  const actionItems = [];

  // Simple pattern matching for TODO items
  const todoPattern = /(?:TODO|Action|Task|FIXME|NOTE):\s*([^\n.!?]+)/gi;
  const matches = textContent.matchAll(todoPattern);

  for (const match of matches) {
    const description = match[1].trim();
    actionItems.push({
      description,
      details: '',
      priority: 'none',
      documentId,
      documentTitle: title,
      createdAt: new Date().toISOString(),
      isEmailTask: isEmailTask(description, ''),
      emailDraft: null,
      isCalendarTask: isCalendarTask(description, ''),
      calendarEvent: null,
      isWordEditTask: isWordEditTask(description, ''),
      wordEdit: null
    });
  }

  return actionItems;
}

/**
 * Processes AI commands for highlighted text
 * @param {string} highlightedText - The text highlighted by the user
 * @param {string} tabType - The type of tab (summary, definitions, questions, etc.)
 * @param {string} customPrompt - Optional custom prompt from the user
 * @returns {Promise<string>} The AI-generated response
 */
export async function processAICommand(highlightedText, tabType, customPrompt = '') {
  if (!geminiModel && !openai) {
    return `AI not available. Please configure an AI provider.`;
  }

  try {
    let systemPrompt = '';

    // Define system prompts based on tab type
    if (customPrompt) {
      // User provided a custom prompt - use it
      systemPrompt = customPrompt;
    } else {
      // Use default prompts based on tab type
      switch (tabType) {
        case 'summary':
          systemPrompt = 'Provide a concise summary of the following text:';
          break;
        case 'definitions':
          systemPrompt = 'Define or explain the following text/term:';
          break;
        case 'questions':
          systemPrompt = 'Answer the following question or provide insights about:';
          break;
        default:
          systemPrompt = 'Analyze and provide insights about the following text:';
      }
    }

    const prompt = `${systemPrompt}\n\n"${highlightedText}"\n\nProvide a clear, concise response (2-3 sentences maximum unless more detail is specifically requested).`;

    // Call AI with the prompt in plain text mode (not JSON)
    const responseText = await callAI(prompt, false);

    // Return the response directly
    return responseText.trim();
  } catch (error) {
    console.error('Error processing AI command:', error);
    return `Error processing AI request: ${error.message}`;
  }
}

/**
 * Processes edit commands - suggests edits to the highlighted text
 * @param {string} originalText - The original text to edit
 * @param {string} editInstruction - The user's editing instruction
 * @returns {Promise<Object>} Object containing editedText and explanation
 */
export async function processEditCommand(originalText, editInstruction) {
  if (!geminiModel && !openai) {
    return {
      editedText: originalText,
      explanation: 'AI not available. Please configure an AI provider.'
    };
  }

  try {
    const prompt = `You are a text editing assistant. The user wants you to edit the following text according to their instruction.

Original text: "${originalText}"

Editing instruction: "${editInstruction}"

Apply the requested changes to the text. Respond with a JSON object containing:
1. "editedText": The edited version of the text with the changes applied
2. "explanation": A brief explanation (1-2 sentences) of what changes you made

Important: Keep the edited text concise and focused on the requested changes only.

Respond ONLY with valid JSON in this format:
{
  "editedText": "the edited text here",
  "explanation": "brief explanation of changes"
}`;

    const responseText = await callAI(prompt, true); // Use JSON mode
    const parsed = JSON.parse(responseText);

    return {
      editedText: parsed.editedText || originalText,
      explanation: parsed.explanation || 'Text edited as requested'
    };
  } catch (error) {
    console.error('Error processing edit command:', error);
    return {
      editedText: originalText,
      explanation: `Error processing edit request: ${error.message}`
    };
  }
}

/**
 * Strips HTML tags from content
 */
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
