# DocEditor

A document editing application similar to Dropbox Paper and Google Docs, built with React and Express.

## Features

- Create, edit, and delete documents
- Rich text editor with formatting options (bold, italic, headers, lists, etc.)
- Auto-save functionality
- Clean, modern UI similar to Google Docs/Dropbox Paper
- Document list view with cards

## Tech Stack

### Frontend
- React 18
- React Router for navigation
- React Quill for rich text editing
- Axios for API calls
- Vite for build tooling

### Backend
- Express.js
- CORS enabled
- In-memory document storage (replace with database for production)

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm

### Installation

1. Install root dependencies:
```bash
npm install
```

2. Install all project dependencies (frontend and backend):
```bash
npm run install:all
```

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
3. Click "New Document" to create a new document
4. Click on any document card to open and edit it
5. The editor supports:
   - Headers (H1, H2, H3)
   - Text formatting (bold, italic, underline, strikethrough)
   - Lists (ordered and unordered)
   - Text alignment
   - Links and images
   - Colors and background colors
   - Blockquotes and code blocks
   - Auto-save (saves after 1 second of inactivity)

## Project Structure

```
dropbox-ai/
├── backend/
│   ├── server.js          # Express server with API endpoints
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── DocumentList.jsx       # Document list page
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
└── README.md
```

## API Endpoints

- `GET /api/documents` - Get all documents (metadata only)
- `GET /api/documents/:id` - Get a single document with full content
- `POST /api/documents` - Create a new document
- `PUT /api/documents/:id` - Update a document
- `DELETE /api/documents/:id` - Delete a document

## Future Enhancements

- Add database persistence (MongoDB, PostgreSQL, etc.)
- Real-time collaborative editing with WebSockets
- User authentication and authorization
- Document sharing and permissions
- Export documents to PDF/Word
- Version history
- Document search
- Folders/organization
