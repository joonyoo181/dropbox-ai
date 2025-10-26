import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import './DocumentEditor.css';

function DocumentEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimeoutRef = useRef(null);
  const quillRef = useRef(null);

  useEffect(() => {
    fetchDocument();

    // Extract action items when component unmounts (user exits)
    return () => {
      if (id) {
        extractActionItemsOnExit();
      }
    };
  }, [id]);

  const extractActionItemsOnExit = async () => {
    try {
      await axios.post(`/api/documents/${id}/extract-actions`);
      console.log('Action items extracted on exit');
    } catch (error) {
      console.error('Error extracting action items:', error);
    }
  };

  const fetchDocument = async () => {
    try {
      const response = await axios.get(`/api/documents/${id}`);
      setDocument(response.data);
      setTitle(response.data.title);
      setContent(response.data.content);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching document:', error);
      setLoading(false);
    }
  };

  const saveDocument = async (newTitle, newContent) => {
    setSaving(true);
    try {
      await axios.put(`/api/documents/${id}`, {
        title: newTitle,
        content: newContent
      });
      setSaving(false);
    } catch (error) {
      console.error('Error saving document:', error);
      setSaving(false);
    }
  };

  const handleTitleChange = (e) => {
    const newTitle = e.target.value;
    setTitle(newTitle);

    // Auto-save after 1 second of inactivity
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveDocument(newTitle, content);
    }, 1000);
  };

  const handleContentChange = (value) => {
    setContent(value);

    // Auto-save after 1 second of inactivity
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveDocument(title, value);
    }, 1000);
  };

  const modules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'indent': '-1'}, { 'indent': '+1' }],
      [{ 'align': [] }],
      ['link', 'image'],
      [{ 'color': [] }, { 'background': [] }],
      ['blockquote', 'code-block'],
      ['clean']
    ]
  };

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'list', 'bullet', 'indent',
    'align',
    'link', 'image',
    'color', 'background',
    'blockquote', 'code-block'
  ];

  if (loading) {
    return <div className="loading">Loading document...</div>;
  }

  if (!document) {
    return (
      <div className="error-container">
        <h2>Document not found</h2>
        <button onClick={() => navigate('/')}>Back to Documents</button>
      </div>
    );
  }

  return (
    <div className="editor-container">
      <header className="editor-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19l-7-7 7-7"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>
        <div className="save-status">
          {saving ? 'Saving...' : 'All changes saved'}
        </div>
      </header>

      <div className="editor-content">
        <div className="editor-wrapper">
          <input
            type="text"
            className="title-input"
            placeholder="Untitled Document"
            value={title}
            onChange={handleTitleChange}
          />
          <ReactQuill
            ref={quillRef}
            theme="snow"
            value={content}
            onChange={handleContentChange}
            modules={modules}
            formats={formats}
            placeholder="Start writing..."
          />
        </div>
      </div>
    </div>
  );
}

export default DocumentEditor;
