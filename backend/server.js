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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
