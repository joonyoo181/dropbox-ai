import { useState, useEffect, useRef, useCallback } from 'react';
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
  const [suggestion, setSuggestion] = useState(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const saveTimeoutRef = useRef(null);
  const quillRef = useRef(null);

  useEffect(() => {
    fetchDocument();
  }, [id]);

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

    // Clear suggestion when content changes
    setSuggestion(null);

    // Auto-save after 1 second of inactivity
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveDocument(title, value);
    }, 1000);
  };

  // Extract text from cursor position to last sentence-ending punctuation
  const getTextToPreviousBullet = useCallback(() => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return null;

    const selection = quill.getSelection();
    if (!selection) return null;

    const cursorIndex = selection.index;
    const text = quill.getText(0, cursorIndex);

    // Find the last sentence-ending punctuation (. ? !)
    let startIndex = 0;
    let lastPunctuationIndex = -1;

    // Search backwards for the last occurrence of sentence-ending punctuation
    for (let i = text.length - 1; i >= 0; i--) {
      if (text[i] === '.' || text[i] === '?' || text[i] === '!') {
        lastPunctuationIndex = i;
        startIndex = i + 1;
        break;
      }
    }

    // Extract the text from startIndex to cursor
    let relevantText = text.substring(startIndex).trim();

    // Edge case: if relevantText is empty or only whitespace, look for the previous sentence
    if (!relevantText || relevantText.length === 0) {
      if (lastPunctuationIndex > 0) {
        // Find the second-to-last sentence-ending punctuation
        let secondLastPunctuationIndex = -1;
        for (let i = lastPunctuationIndex - 1; i >= 0; i--) {
          if (text[i] === '.' || text[i] === '?' || text[i] === '!') {
            secondLastPunctuationIndex = i;
            break;
          }
        }

        // Extract from second-to-last punctuation to cursor
        startIndex = secondLastPunctuationIndex >= 0 ? secondLastPunctuationIndex + 1 : 0;
        relevantText = text.substring(startIndex).trim();
      } else {
        // No punctuation found at all, use all text
        relevantText = text.trim();
        startIndex = 0;
      }
    }

    return {
      text: relevantText,
      startIndex: cursorIndex - relevantText.length - (text.substring(startIndex).length - relevantText.length),
      endIndex: cursorIndex
    };
  }, []);

  // Request AI suggestion for the text
  const requestSuggestion = useCallback(async () => {
    const textInfo = getTextToPreviousBullet();
    if (!textInfo || !textInfo.text) {
      console.log('No text found to suggest improvements for');
      return;
    }

    setLoadingSuggestion(true);
    try {
      const response = await axios.post('/api/suggest', {
        text: textInfo.text
      });

      setSuggestion({
        originalText: textInfo.text,
        suggestedText: response.data.suggestion,
        startIndex: textInfo.startIndex,
        endIndex: textInfo.endIndex
      });
    } catch (error) {
      console.error('Error getting suggestion:', error);
    } finally {
      setLoadingSuggestion(false);
    }
  }, [getTextToPreviousBullet]);

  // Accept the suggestion
  const acceptSuggestion = useCallback(() => {
    if (!suggestion || !quillRef.current) return;

    const quill = quillRef.current.getEditor();

    // Replace the text
    quill.deleteText(suggestion.startIndex, suggestion.endIndex - suggestion.startIndex);
    quill.insertText(suggestion.startIndex, suggestion.suggestedText);

    // Update content state
    setContent(quill.root.innerHTML);

    // Clear suggestion
    setSuggestion(null);
  }, [suggestion]);

  // Reject the suggestion
  const rejectSuggestion = useCallback(() => {
    setSuggestion(null);
  }, []);

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check for Cmd+1 (Mac) or Ctrl+1 (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault();
        requestSuggestion();
      }
      // Escape to dismiss suggestion
      if (e.key === 'Escape' && suggestion) {
        e.preventDefault();
        rejectSuggestion();
      }
    };

    window.document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.document.removeEventListener('keydown', handleKeyDown);
    };
  }, [suggestion, requestSuggestion, rejectSuggestion]);

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
          <div className="editor-with-suggestions">
            <ReactQuill
              ref={quillRef}
              theme="snow"
              value={content}
              onChange={handleContentChange}
              modules={modules}
              formats={formats}
              placeholder="Start writing..."
            />
            {suggestion && (
              <div className="suggestion-overlay">
                <div className="suggestion-content">
                  <span className="original-text">{suggestion.originalText}</span>
                  <span className="suggested-text">{suggestion.suggestedText}</span>
                  <div className="suggestion-actions">
                    <button
                      className="suggestion-btn accept-btn"
                      onClick={acceptSuggestion}
                      title="Accept suggestion (Enter)"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <button
                      className="suggestion-btn reject-btn"
                      onClick={rejectSuggestion}
                      title="Reject suggestion (Esc)"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}
            {loadingSuggestion && (
              <div className="suggestion-loading">
                <div className="spinner"></div>
                <span>Getting AI suggestion...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DocumentEditor;
