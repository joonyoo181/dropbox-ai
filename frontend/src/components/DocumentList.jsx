import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './DocumentList.css';

function DocumentList() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await axios.get('/api/documents');
      setDocuments(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching documents:', error);
      setLoading(false);
    }
  };

  const createNewDocument = async () => {
    try {
      const response = await axios.post('/api/documents', {
        title: 'Untitled Document',
        content: ''
      });
      navigate(`/document/${response.data.id}`);
    } catch (error) {
      console.error('Error creating document:', error);
    }
  };

  const deleteDocument = async (id, e) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this document?')) {
      try {
        await axios.delete(`/api/documents/${id}`);
        fetchDocuments();
      } catch (error) {
        console.error('Error deleting document:', error);
      }
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return <div className="loading">Loading documents...</div>;
  }

  return (
    <div className="document-list-container">
      <header className="header">
        <h1>DocEditor</h1>
        <button className="new-doc-btn" onClick={createNewDocument}>
          + New Document
        </button>
      </header>

      <div className="documents-grid">
        {documents.length === 0 ? (
          <div className="empty-state">
            <h2>No documents yet</h2>
            <p>Create your first document to get started</p>
            <button className="create-first-btn" onClick={createNewDocument}>
              Create Document
            </button>
          </div>
        ) : (
          documents.map(doc => (
            <div
              key={doc.id}
              className="document-card"
              onClick={() => navigate(`/document/${doc.id}`)}
            >
              <div className="document-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="14 2 14 8 20 8"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="document-info">
                <h3>{doc.title}</h3>
                <p className="document-date">
                  Updated {formatDate(doc.updatedAt)}
                </p>
              </div>
              <button
                className="delete-btn"
                onClick={(e) => deleteDocument(doc.id, e)}
                aria-label="Delete document"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default DocumentList;
