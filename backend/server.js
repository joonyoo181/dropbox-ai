// IMPORTANT: Load config first to clear global env vars and load local .env
import './config.js';

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { interpretSearchQuery, analyzeDocumentContent, rankDocuments, suggestTextImprovement } from './aiService.js';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

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
  }
];

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

// AI-powered text suggestion
app.post('/api/suggest', async (req, res) => {
  const { text } = req.body;

  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    const result = await suggestTextImprovement(text);
    res.json({
      suggestion: result.suggestion,
      changes: result.changes,
      message: result.message
    });
  } catch (error) {
    console.error('Error generating suggestion:', error);
    res.status(500).json({ error: 'Failed to generate suggestion' });
  }
});

// AI-powered summarization
app.post('/api/summarize', async (req, res) => {
  const { text } = req.body;

  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    const { summarizeText } = await import('./aiService.js');
    const summary = await summarizeText(text);
    res.json({ summary });
  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// AI-powered definition
app.post('/api/define', async (req, res) => {
  const { text } = req.body;

  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    const { defineText } = await import('./aiService.js');
    const definition = await defineText(text);
    res.json({ definition });
  } catch (error) {
    console.error('Error generating definition:', error);
    res.status(500).json({ error: 'Failed to generate definition' });
  }
});

// AI-powered question answering
app.post('/api/answer', async (req, res) => {
  const { question } = req.body;

  if (!question || question.trim().length === 0) {
    return res.status(400).json({ error: 'Question is required' });
  }

  try {
    const { answerQuestion } = await import('./aiService.js');
    const answer = await answerQuestion(question);
    res.json({ answer });
  } catch (error) {
    console.error('Error answering question:', error);
    res.status(500).json({ error: 'Failed to answer question' });
  }
});

// AI-powered text editing
app.post('/api/edit', async (req, res) => {
  const { text, instruction } = req.body;

  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'Text is required' });
  }

  if (!instruction || instruction.trim().length === 0) {
    return res.status(400).json({ error: 'Instruction is required' });
  }

  try {
    const { editText } = await import('./aiService.js');
    const editedText = await editText(text, instruction);
    res.json({ editedText });
  } catch (error) {
    console.error('Error editing text:', error);
    res.status(500).json({ error: 'Failed to edit text' });
  }
});

// AI-powered custom AI with user-defined prompts
app.post('/api/custom-ai', async (req, res) => {
  const { text, prompt } = req.body;

  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'Text is required' });
  }

  if (!prompt || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    const { customAI } = await import('./aiService.js');
    const result = await customAI(text, prompt);
    res.json({ result });
  } catch (error) {
    console.error('Error with custom AI:', error);
    res.status(500).json({ error: 'Failed to generate custom AI response' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
