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
  const [cursorPosition, setCursorPosition] = useState(null);
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
    setCursorPosition(null);

    // Auto-save after 1 second of inactivity
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveDocument(title, value);
    }, 1000);
  };

  // Compute word-level differences between original and suggested text
  const computeWordDiff = useCallback((originalText, suggestedText) => {
    const originalWords = originalText.split(/(\s+)/);
    const suggestedWords = suggestedText.split(/(\s+)/);

    // Simple LCS-based diff algorithm
    const dp = Array(originalWords.length + 1).fill(null).map(() =>
      Array(suggestedWords.length + 1).fill(0)
    );

    // Build LCS matrix
    for (let i = 1; i <= originalWords.length; i++) {
      for (let j = 1; j <= suggestedWords.length; j++) {
        if (originalWords[i - 1] === suggestedWords[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to find differences
    const diff = [];
    let i = originalWords.length;
    let j = suggestedWords.length;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && originalWords[i - 1] === suggestedWords[j - 1]) {
        diff.unshift({ type: 'unchanged', word: originalWords[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        diff.unshift({ type: 'added', word: suggestedWords[j - 1] });
        j--;
      } else if (i > 0) {
        diff.unshift({ type: 'removed', word: originalWords[i - 1] });
        i--;
      }
    }

    return diff;
  }, []);

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

    // Get cursor position for inline display
    const quill = quillRef.current?.getEditor();
    if (quill) {
      const selection = quill.getSelection();
      if (selection) {
        const bounds = quill.getBounds(selection.index);
        setCursorPosition({
          top: bounds.top + bounds.height,
          left: bounds.left
        });
      }
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
    quill.insertText(suggestion.startIndex, " " + suggestion.suggestedText);

    // Update content state
    setContent(quill.root.innerHTML);

    // Clear suggestion and cursor position
    setSuggestion(null);
    setCursorPosition(null);
  }, [suggestion]);

  // Reject the suggestion
  const rejectSuggestion = useCallback(() => {
    setSuggestion(null);
    setCursorPosition(null);
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
            {suggestion && cursorPosition && (
              <div
                className="suggestion-overlay"
                style={{
                  top: `${cursorPosition.top}px`,
                  left: `${cursorPosition.left}px`
                }}
              >
                <div className="suggestion-content">
                  <div className="diff-text">
                    {computeWordDiff(suggestion.originalText, suggestion.suggestedText).map((part, index) => {
                      // Check if this is whitespace
                      const isWhitespace = /^\s+$/.test(part.word);

                      if (isWhitespace) {
                        // Render whitespace directly without a span
                        return part.word;
                      } else if (part.type === 'removed') {
                        return (
                          <span key={index} className="word-removed">
                            {part.word}
                          </span>
                        );
                      } else if (part.type === 'added') {
                        return (
                          <span key={index} className="word-added">
                            {part.word}
                          </span>
                        );
                      } else {
                        return (
                          <span key={index} className="word-unchanged">
                            {part.word}
                          </span>
                        );
                      }
                    })}
                  </div>
                  <div className="suggestion-actions">
                    <button
                      className="suggestion-btn accept-btn"
                      onClick={acceptSuggestion}
                      title="Accept suggestion"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <button
                      className="suggestion-btn reject-btn"
                      onClick={rejectSuggestion}
                      title="Reject suggestion"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}
            {loadingSuggestion && cursorPosition && (
              <div
                className="suggestion-loading"
                style={{
                  top: `${cursorPosition.top}px`,
                  left: `${cursorPosition.left}px`
                }}
              >
                <div className="spinner"></div>
                <span>Getting suggestion...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DocumentEditor;
