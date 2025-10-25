# DocEditor

A document editing application similar to Dropbox Paper and Google Docs, built with React and Express.

## Features

- Create, edit, and delete documents
- Rich text editor with formatting options (bold, italic, headers, lists, etc.)
- Auto-save functionality
- **AI-Powered Search** - Natural language search that understands queries like:
  - "meeting notes from 12/2" - finds documents by date
  - "public health essay" - finds documents by topic and type
  - "that document I wrote for my class" - interprets intent and searches accordingly
- Clean, modern UI similar to Google Docs/Dropbox Paper
- Document list view with cards
- Automatic document metadata extraction (topics, type, summary)

## Tech Stack

### Frontend
- React 18
- React Router for navigation
- React Quill for rich text editing
- Axios for API calls
- Vite for build tooling

### Backend
- Express.js
- OpenAI API for intelligent search and document analysis
- CORS enabled
- In-memory document storage (replace with database for production)

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm
- OpenAI API key (optional, but required for AI-powered search)

### Installation

1. Install root dependencies:
```bash
npm install
```

2. Install all project dependencies (frontend and backend):
```bash
npm run install:all
```

3. Set up environment variables (optional but recommended):
```bash
cd backend
cp .env.example .env
# Edit .env and add your OpenAI API key
# Get your API key from: https://platform.openai.com/api-keys
```

**Note:** The app will work without an OpenAI API key, but the search feature will fall back to simple text matching instead of AI-powered interpretation.

### Running the Application

Start both the frontend and backend servers concurrently:
```bash
npm run dev
```

This will start:
- Backend server on http://localhost:3001
- Frontend server on http://localhost:3000

Or run them separately:
```bash
# Terminal 1 - Backend
npm run dev:backend

# Terminal 2 - Frontend
npm run dev:frontend
```

### Using the Application

1. Open http://localhost:3000 in your browser
2. You'll see the document list page with sample documents
3. **Search for documents** using natural language:
   - Try: "meeting notes from 12/2"
   - Try: "public health essay"
   - Try: "documents I edited recently"
   - The AI will interpret your query and show relevant results
4. Click "New Document" to create a new document
5. Click on any document card to open and edit it
6. The editor supports:
   - Vertical formatting toolbar on the right
   - Headers (H1, H2, H3)
   - Text formatting (bold, italic, underline, strikethrough)
   - Lists (ordered and unordered)
   - Text alignment
   - Links and images
   - Colors and background colors
   - Blockquotes and code blocks
   - Auto-save (saves after 1 second of inactivity)
7. Documents are automatically analyzed to extract:
   - Topics and keywords
   - Document type (essay, notes, meeting notes, etc.)
   - Brief summary

## Project Structure

```
dropbox-ai/
├── backend/
│   ├── server.js          # Express server with API endpoints
│   ├── aiService.js       # AI-powered search and document analysis
│   ├── .env.example       # Environment variables template
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── DocumentList.jsx       # Document list page with AI search
│   │   │   ├── DocumentList.css
│   │   │   ├── DocumentEditor.jsx     # Document editor page
│   │   │   └── DocumentEditor.css
│   │   ├── App.jsx                    # Main app with routing
│   │   ├── main.jsx                   # Entry point
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── package.json           # Root package.json
├── .gitignore
└── README.md
```

## API Endpoints

- `GET /api/documents` - Get all documents (metadata only)
- `GET /api/documents/:id` - Get a single document with full content
- `POST /api/documents` - Create a new document (auto-analyzes content)
- `PUT /api/documents/:id` - Update a document (re-analyzes if content changed)
- `DELETE /api/documents/:id` - Delete a document
- `POST /api/search` - AI-powered search with natural language queries

## How AI Search Works

The AI-powered search uses OpenAI's GPT models to:

1. **Interpret natural language queries** - Understands intent like "meeting notes from 12/2" or "public health essay"
2. **Extract search criteria** - Identifies dates, topics, document types, and keywords
3. **Analyze documents** - Automatically extracts metadata (topics, type, summary) when documents are created/updated
4. **Rank results** - Uses AI to rank documents by relevance to the search query

**Fallback Mode:** Without an OpenAI API key, the search falls back to simple text and date matching, which still works but is less intelligent.

## Future Enhancements

- Add database persistence (MongoDB, PostgreSQL, etc.)
- Real-time collaborative editing with WebSockets
- User authentication and authorization
- Document sharing and permissions
- Export documents to PDF/Word
- Version history
- Folders/organization
- More advanced AI features (summarization, suggestions, etc.)
