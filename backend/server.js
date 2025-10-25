import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: '2',
    title: 'Meeting Notes',
    content: '<h2>Team Meeting - Q1 2024</h2><ul><li>Discuss project goals</li><li>Review timeline</li></ul>',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// Get all documents
app.get('/api/documents', (req, res) => {
  res.json(documents.map(doc => ({
    id: doc.id,
    title: doc.title,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
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
app.post('/api/documents', (req, res) => {
  const newDoc = {
    id: Date.now().toString(),
    title: req.body.title || 'Untitled Document',
    content: req.body.content || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  documents.push(newDoc);
  res.status(201).json(newDoc);
});

// Update a document
app.put('/api/documents/:id', (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
