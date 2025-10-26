// IMPORTANT: Load config first to clear global env vars and load local .env
import './config.js';

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { interpretSearchQuery, analyzeDocumentContent, rankDocuments, suggestTextImprovement, extractActionItems, areTasksSimilar, draftEmailFromTask, createCalendarEventFromTask, processAICommand, generateWordEdit, processEditCommand } from './aiService.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Simple root endpoint so Render knows server is running
app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

// In-memory storage for documents (replace with database in production)
let documents = [
  {
    id: '1',
    title: 'Welcome Document',
    content: '<h1>Welcome to DocEditor</h1><p>This is your first document. Start editing!</p>',
    createdAt: new Date('2025-01-15').toISOString(),
    updatedAt: new Date('2025-01-15').toISOString(),
    comments: [],
    tabs: {
      summary: [],
      definitions: [],
      questions: [],
      notes: [],
      edits: [],
      versions: []
    },
    customTabs: [],
    metadata: {
      topics: ['introduction', 'getting started'],
      documentType: 'document',
      summary: 'A welcome document for new users'
    }
  },
  {
    id: '2',
    title: 'Meeting Notes',
    content: '<h2>Team Meeting - Q1 2024</h2><ul><li>Discuss project goals</li><li>Review timeline</li></ul>',
    createdAt: new Date('2024-12-02').toISOString(),
    updatedAt: new Date('2024-12-02').toISOString(),
    comments: [],
    tabs: {
      summary: [],
      definitions: [],
      questions: [],
      notes: [],
      edits: [],
      versions: []
    },
    customTabs: [],
    metadata: {
      topics: ['meeting', 'planning', 'Q1'],
      documentType: 'meeting_notes',
      summary: 'Team meeting notes for Q1 planning'
    }
  },
  {
    id: '3',
    title: 'Public Health Essay Draft',
    content: '<h1>The Impact of Vaccination Programs on Public Health</h1><p>In this essay, I will examine the profound effects of vaccination programs on public health outcomes...</p><h2>Introduction</h2><p>Vaccination programs have been instrumental in reducing infectious diseases worldwide.</p>',
    createdAt: new Date('2024-11-20').toISOString(),
    updatedAt: new Date('2024-12-01').toISOString(),
    comments: [],
    tabs: {
      summary: [],
      definitions: [],
      questions: [],
      notes: [],
      edits: [],
      versions: []
    },
    customTabs: [],
    metadata: {
      topics: ['public health', 'vaccination', 'healthcare'],
      documentType: 'essay',
      summary: 'An essay about vaccination programs and public health'
    }
  },
  {
    id: '4',
    title: 'response to sylvia plath',
    content: `When I read The Bell Jar by Sylvia Plath, one quote — the quote that has stuck with me and probably everybody else who read it goes as follows:

  <br>“I saw my life branching out before me like the green fig tree in the story. From the tip of every branch, like a fat purple fig, a wonderful future beckoned and winked. One fig was a husband and a happy home and children, and another fig was a famous poet and another fig was a brilliant professor, and another fig was Ee Gee, the amazing editor, and another fig was Europe and Africa and South America, and another fig was Constantin and Socrates and Attila and a pack of other lovers with queer names and offbeat professions, and another fig was an Olympic lady crew champion, and beyond and above these figs were many more figs I couldn't quite make out. I saw myself sitting in the crotch of this fig tree, starving to death, just because I couldn't make up my mind which of the figs I would choose. I wanted each and every one of them, but choosing one meant losing all the rest, and, as I sat there, unable to decide, the figs began to wrinkle and go black, and, one by one, they plopped to the ground at my feet.”

  <br>My figs are not the same as hers, but they constantly grow outwards. A part of me wants to become a writer and finally finish writing that sci-fi book and spend the rest of my life writing poetry on the value & meaning & fragility of life; a part of me wants to go into the start-up world and make something of value that will change things in the world and if not the world then maybe for just one person; a part of me wants to become a quizzer and kill it on Jeopardy since Who Wants to be a Millionaire now only features … millionaires; a part of me wants to go into politics and make it on the Hill where I can claim to be a “just politician” and truly be one. But each one of these dreams are so big and require so much time and effort that doing each one of them is unfeasible.`,
    createdAt: new Date('2025-01-25').toISOString(),
    updatedAt: new Date('2025-01-25').toISOString(),
    comments: [],
    tabs: {
      summary: [],
      definitions: [],
      questions: [],
      notes: [],
      edits: [],
      versions: []
    },
    customTabs: [],
    metadata: {
      topics: ['slyvia path', 'substack', 'post'],
      documentType: 'blog',
      summary: 'A response to quote from slyvia path'
    }
  }
];

// In-memory storage for action items
let actionItems = [];

// Get all documents
app.get('/api/documents', (req, res) => {
  res.json(documents.map(doc => ({
    id: doc.id,
    title: doc.title,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    metadata: doc.metadata
  })));
});

// Get a single document
app.get('/api/documents/:id', (req, res) => {
  const doc = documents.find(d => d.id === req.params.id);
  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }
  res.json(doc);
});

// Create a new document
app.post('/api/documents', async (req, res) => {
  const newDoc = {
    id: Date.now().toString(),
    title: req.body.title || 'Untitled Document',
    content: req.body.content || '',
    comments: [],
    tabs: {
      summary: [],
      definitions: [],
      questions: [],
      notes: [],
      edits: [],
      versions: []
    },
    customTabs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      topics: [],
      documentType: 'document',
      summary: ''
    }
  };

  // Analyze content if available
  if (newDoc.content && newDoc.content.length > 10) {
    try {
      const analysis = await analyzeDocumentContent(newDoc.title, newDoc.content);
      newDoc.metadata = analysis;
    } catch (error) {
      console.error('Error analyzing document:', error);
    }
  }

  documents.push(newDoc);
  res.status(201).json(newDoc);
});

// Update a document
app.put('/api/documents/:id', async (req, res) => {
  const docIndex = documents.findIndex(d => d.id === req.params.id);
  if (docIndex === -1) {
    return res.status(404).json({ error: 'Document not found' });
  }

  documents[docIndex] = {
    ...documents[docIndex],
    title: req.body.title || documents[docIndex].title,
    content: req.body.content !== undefined ? req.body.content : documents[docIndex].content,
    comments: req.body.comments !== undefined ? req.body.comments : documents[docIndex].comments,
    tabs: req.body.tabs !== undefined ? req.body.tabs : documents[docIndex].tabs,
    customTabs: req.body.customTabs !== undefined ? req.body.customTabs : documents[docIndex].customTabs,
    updatedAt: new Date().toISOString()
  };

  // Re-analyze content if it was updated
  if (req.body.content !== undefined && req.body.content.length > 10) {
    try {
      const analysis = await analyzeDocumentContent(
        documents[docIndex].title,
        documents[docIndex].content
      );
      documents[docIndex].metadata = analysis;
    } catch (error) {
      console.error('Error analyzing document:', error);
    }
  }

  res.json(documents[docIndex]);
});

// Delete a document
app.delete('/api/documents/:id', (req, res) => {
  const docIndex = documents.findIndex(d => d.id === req.params.id);
  if (docIndex === -1) {
    return res.status(404).json({ error: 'Document not found' });
  }

  documents.splice(docIndex, 1);
  res.status(204).send();
});

// AI-powered search
app.post('/api/search', async (req, res) => {
  const { query } = req.body;

  if (!query || query.trim().length === 0) {
    return res.json({ documents: [], interpretation: null });
  }

  try {
    // Step 1: Interpret the search query
    const interpretation = await interpretSearchQuery(query, documents);

    // Step 2: Rank documents based on interpretation
    const rankedIds = await rankDocuments(interpretation, documents);

    // Step 3: Return ranked documents
    const rankedDocuments = rankedIds
      .map(id => documents.find(d => d.id === id))
      .filter(doc => doc !== undefined)
      .map(doc => ({
        id: doc.id,
        title: doc.title,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        metadata: doc.metadata
      }));

    res.json({
      documents: rankedDocuments,
      interpretation: interpretation
    });
  } catch (error) {
    console.error('Error processing search:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Extract action items from a document
app.post('/api/documents/:id/extract-actions', async (req, res) => {
  const doc = documents.find(d => d.id === req.params.id);
  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  try {
    const newActionItems = await extractActionItems(doc.id, doc.title, doc.content);

    // Remove duplicates using AI-based similarity detection
    const uniqueNewItems = [];
    for (const newItem of newActionItems) {
      let isDuplicate = false;

      // Check similarity against existing action items from the same document
      for (const existingItem of actionItems) {
        if (existingItem.documentId === newItem.documentId) {
          const isSimilar = await areTasksSimilar(newItem, existingItem);
          if (isSimilar) {
            isDuplicate = true;
            console.log(`Detected duplicate: "${newItem.description}" similar to "${existingItem.description}"`);
            break;
          }
        }
      }

      if (!isDuplicate) {
        uniqueNewItems.push(newItem);
      }
    }

    // Add unique items to the action items list
    actionItems.push(...uniqueNewItems);

    res.json({
      extractedCount: newActionItems.length,
      addedCount: uniqueNewItems.length,
      actionItems: uniqueNewItems
    });
  } catch (error) {
    console.error('Error extracting action items:', error);
    res.status(500).json({ error: 'Failed to extract action items' });
  }
});

// Get all action items
app.get('/api/action-items', (_req, res) => {
  res.json(actionItems);
});

// Delete an action item
app.delete('/api/action-items/:index', (req, res) => {
  const index = parseInt(req.params.index);
  if (index < 0 || index >= actionItems.length) {
    return res.status(404).json({ error: 'Action item not found' });
  }

  actionItems.splice(index, 1);
  res.status(204).send();
});

// Mark action item as complete
app.patch('/api/action-items/:index/complete', (req, res) => {
  const index = parseInt(req.params.index);
  if (index < 0 || index >= actionItems.length) {
    return res.status(404).json({ error: 'Action item not found' });
  }

  actionItems[index].completed = true;
  actionItems[index].completedAt = new Date().toISOString();
  res.json(actionItems[index]);
});

// Draft email from action item
app.post('/api/action-items/:index/draft-email', async (req, res) => {
  const index = parseInt(req.params.index);
  if (index < 0 || index >= actionItems.length) {
    return res.status(404).json({ error: 'Action item not found' });
  }

  const actionItem = actionItems[index];
  
  if (!actionItem.isEmailTask) {
    return res.status(400).json({ error: 'This action item is not an email task' });
  }

  try {
    // Get the source document for context
    const sourceDoc = documents.find(d => d.id === actionItem.documentId);
    const documentContext = sourceDoc ? sourceDoc.content : '';

    // Draft the email
    const emailDraft = await draftEmailFromTask(actionItem, documentContext);

    // Store the draft in the action item (preserve all original fields)
    actionItems[index] = {
      ...actionItems[index],
      emailDraft
    };

    res.json({
      success: true,
      emailDraft,
      actionItem: actionItems[index]
    });
  } catch (error) {
    console.error('Error drafting email:', error);
    res.status(500).json({ error: 'Failed to draft email' });
  }
});

// Create calendar event from action item
app.post('/api/action-items/:index/create-calendar-event', async (req, res) => {
  const index = parseInt(req.params.index);
  if (index < 0 || index >= actionItems.length) {
    return res.status(404).json({ error: 'Action item not found' });
  }

  const actionItem = actionItems[index];
  
  if (!actionItem.isCalendarTask) {
    return res.status(400).json({ error: 'This action item is not a calendar task' });
  }

  try {
    // Get the source document for context
    const sourceDoc = documents.find(d => d.id === actionItem.documentId);
    const documentContext = sourceDoc ? sourceDoc.content : '';

    // Create the calendar event
    const calendarEvent = await createCalendarEventFromTask(actionItem, documentContext);

    // Store the event in the action item (preserve all original fields)
    actionItems[index] = {
      ...actionItems[index],
      calendarEvent
    };

    res.json({
      success: true,
      calendarEvent,
      actionItem: actionItems[index]
    });
  } catch (error) {
    console.error('Error creating calendar event:', error);
    res.status(500).json({ error: 'Failed to create calendar event' });
  }
});

// Download ICS file for calendar event
app.get('/api/action-items/:index/download-ics', (req, res) => {
  const index = parseInt(req.params.index);
  if (index < 0 || index >= actionItems.length) {
    return res.status(404).json({ error: 'Action item not found' });
  }

  const actionItem = actionItems[index];

  if (!actionItem.calendarEvent || !actionItem.calendarEvent.icsContent) {
    return res.status(400).json({ error: 'No calendar event found for this action item' });
  }

  // Set headers for file download
  const filename = `${actionItem.calendarEvent.title.replace(/[^a-z0-9]/gi, '_')}.ics`;
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  res.send(actionItem.calendarEvent.icsContent);
});

// Generate word edit from action item
app.post('/api/action-items/:index/generate-word-edit', async (req, res) => {
  const index = parseInt(req.params.index);
  if (index < 0 || index >= actionItems.length) {
    return res.status(404).json({ error: 'Action item not found' });
  }

  const actionItem = actionItems[index];
  
  if (!actionItem.isWordEditTask) {
    return res.status(400).json({ error: 'This action item is not a word edit task' });
  }

  try {
    // Get the source document for context
    const sourceDoc = documents.find(d => d.id === actionItem.documentId);
    const documentContext = sourceDoc ? sourceDoc.content : '';

    // Generate the word edit
    const wordEdit = await generateWordEdit(actionItem, documentContext);

    // Store the edit in the action item (preserve all original fields)
    actionItems[index] = {
      ...actionItems[index],
      wordEdit
    };

    res.json({
      success: true,
      wordEdit,
      actionItem: actionItems[index]
    });
  } catch (error) {
    console.error('Error generating word edit:', error);
    res.status(500).json({ error: 'Failed to generate word edit' });
  }
});

// Process AI command for highlighted text
app.post('/api/ai/process-command', async (req, res) => {
  const { highlightedText, tabType, customPrompt } = req.body;

  if (!highlightedText || !tabType) {
    return res.status(400).json({ error: 'Missing required fields: highlightedText and tabType' });
  }

  try {
    const aiResponse = await processAICommand(highlightedText, tabType, customPrompt || '');
    res.json({ response: aiResponse });
  } catch (error) {
    console.error('Error processing AI command:', error);
    res.status(500).json({ error: 'Failed to process AI command' });
  }
});

// Process edit command for highlighted text
app.post('/api/ai/process-edit', async (req, res) => {
  const { originalText, editInstruction } = req.body;

  if (!originalText || !editInstruction) {
    return res.status(400).json({ error: 'Missing required fields: originalText and editInstruction' });
  }

  try {
    const result = await processEditCommand(originalText, editInstruction);
    res.json(result);
  } catch (error) {
    console.error('Error processing edit command:', error);
    res.status(500).json({ error: 'Failed to process edit command' });
  }
});

// For Vercel serverless deployment
export default app;

// Start server on 0.0.0.0 for Render (and localhost)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
