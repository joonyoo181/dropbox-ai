import { useState } from 'react';
import axios from 'axios';
import './ActionItems.css';

function ActionItems({ actionItems, onUpdate }) {
  const [expandedItems, setExpandedItems] = useState({});
  const [draftingEmail, setDraftingEmail] = useState({});
  const [creatingEvent, setCreatingEvent] = useState({});
  const [generatingEdit, setGeneratingEdit] = useState({});
  const [expandedEdits, setExpandedEdits] = useState({});

  const toggleExpand = (index) => {
    setExpandedItems(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const toggleEditExpand = (index) => {
    setExpandedEdits(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const handleDraftEmail = async (index) => {
    setDraftingEmail(prev => ({ ...prev, [index]: true }));
    
    try {
      const response = await axios.post(`/api/action-items/${index}/draft-email`);
      
      if (response.data.success) {
        onUpdate();
      }
    } catch (error) {
      console.error('Error drafting email:', error);
      alert('Failed to draft email. Please try again.');
    } finally {
      setDraftingEmail(prev => ({ ...prev, [index]: false }));
    }
  };

  const handleCreateCalendarEvent = async (index) => {
    setCreatingEvent(prev => ({ ...prev, [index]: true }));
    
    try {
      const response = await axios.post(`/api/action-items/${index}/create-calendar-event`);
      
      if (response.data.success) {
        onUpdate();
      }
    } catch (error) {
      console.error('Error creating calendar event:', error);
      alert('Failed to create calendar event. Please try again.');
    } finally {
      setCreatingEvent(prev => ({ ...prev, [index]: false }));
    }
  };

  const handleDownloadICS = (index) => {
    window.open(`/api/action-items/${index}/download-ics`, '_blank');
  };

  const handleGenerateWordEdit = async (index) => {
    setGeneratingEdit(prev => ({ ...prev, [index]: true }));
    
    try {
      const response = await axios.post(`/api/action-items/${index}/generate-word-edit`);
      
      if (response.data.success) {
        onUpdate();
        // Auto-expand the edit after generation
        setExpandedEdits(prev => ({ ...prev, [index]: true }));
      }
    } catch (error) {
      console.error('Error generating word edit:', error);
      alert('Failed to generate word edit. Please try again.');
    } finally {
      setGeneratingEdit(prev => ({ ...prev, [index]: false }));
    }
  };

  const handleAcceptEdit = async (item) => {
    if (!item.wordEdit) return;
    
    try {
      // Get the document
      const docResponse = await axios.get(`/api/documents/${item.documentId}`);
      const document = docResponse.data;
      
      // Normalize whitespace function
      const normalizeText = (text) => {
        return text.replace(/\s+/g, ' ').trim();
      };
      
      const normalizedTarget = normalizeText(item.wordEdit.targetText);
      const normalizedSuggestion = normalizeText(item.wordEdit.suggestedEdit);
      
      console.log('Target (normalized):', normalizedTarget);
      console.log('Suggestion (normalized):', normalizedSuggestion);
      
      // Parse HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(document.content, 'text/html');
      
      let replaced = false;
      
      // Walk through all text nodes
      const walker = window.document.createTreeWalker(
        doc.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      let node;
      const nodesToReplace = [];
      
      // First pass: collect all nodes that need replacement
      while ((node = walker.nextNode())) {
        const normalizedNodeText = normalizeText(node.textContent);
        if (normalizedNodeText.includes(normalizedTarget)) {
          nodesToReplace.push({
            node: node,
            originalText: node.textContent
          });
        }
      }
      
      // Second pass: do the replacements
      nodesToReplace.forEach(({ node, originalText }) => {
        // Try to preserve original spacing/formatting as much as possible
        const normalizedNodeText = normalizeText(originalText);
        
        // Simple replacement: replace normalized version
        if (normalizedNodeText === normalizedTarget) {
          // Whole node is the target, replace entirely
          node.textContent = normalizedSuggestion;
          replaced = true;
          console.log('Replaced entire node');
        } else if (normalizedNodeText.includes(normalizedTarget)) {
          // Target is part of the node
          // Try to replace while preserving some formatting
          const newText = originalText.replace(
            new RegExp(normalizedTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
            normalizedSuggestion
          );
          node.textContent = newText;
          replaced = true;
          console.log('Replaced within node');
        }
      });
      
      if (!replaced) {
        console.error('No replacement made');
        alert('Could not find the text to replace. Please try editing manually.');
        return;
      }
      
      // Now remove the TODO line from the document
      const todoWalker = window.document.createTreeWalker(
        doc.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      let todoNode;
      const todosToRemove = [];
      
      // Find nodes containing the TODO
      while ((todoNode = todoWalker.nextNode())) {
        const nodeText = todoNode.textContent.trim();
        // Check if this node contains the TODO for this specific task
        if (nodeText.includes('TODO') && nodeText.includes(item.description.substring(0, 30))) {
          todosToRemove.push(todoNode);
        }
      }
      
      // Remove TODO nodes and their parent elements if they become empty
      todosToRemove.forEach((node) => {
        const parent = node.parentElement;
        if (parent) {
          // Remove the entire parent element (likely a <p> tag)
          parent.remove();
          console.log('Removed TODO line');
        }
      });
      
      const updatedContent = doc.body.innerHTML;
      
      // Update the document
      await axios.put(`/api/documents/${item.documentId}`, {
        title: document.title,
        content: updatedContent
      });
      
      // Delete the action item
      await axios.delete(`/api/action-items/${item.originalIndex}`);
      
      alert('Edit applied successfully!');
      
      // Refresh action items
      onUpdate();
    } catch (error) {
      console.error('Error applying edit:', error);
      alert('Failed to apply edit: ' + error.message);
    }
  };

  const handleComplete = async (index) => {
    try {
      await axios.patch(`/api/action-items/${index}/complete`);
      onUpdate();
    } catch (error) {
      console.error('Error completing action item:', error);
    }
  };

  const handleDelete = async (index) => {
    try {
      await axios.delete(`/api/action-items/${index}`);
      onUpdate();
    } catch (error) {
      console.error('Error deleting action item:', error);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return '#ea4335';
      case 'medium': return '#fbbc04';
      case 'low': return '#34a853';
      default: return '#5f6368';
    }
  };

  const groupByDocument = () => {
    const grouped = {};
    actionItems.forEach((item, index) => {
      const docId = item.documentId;
      if (!grouped[docId]) {
        grouped[docId] = [];
      }
      grouped[docId].push({ ...item, originalIndex: index });
    });
    return grouped;
  };

  const groupedItems = groupByDocument();

  if (actionItems.length === 0) {
    return null;
  }

  return (
    <div className="action-items-section">
      <h2 className="action-items-title">Action Items</h2>
      <div className="action-items-list">
        {Object.entries(groupedItems).map(([docId, items]) => (
          <div key={docId} className="action-items-document-group">
            <h3 className="action-items-doc-title">
              {items[0].documentTitle}
              <span className="action-items-count">{items.length}</span>
            </h3>
            <div className="action-items-container">
              {items.map((item) => (
                <div
                  key={item.originalIndex}
                  className={`action-item ${item.completed ? 'completed' : ''}`}
                >
                  <div className="action-item-header">
                    <div className="action-item-main">
                      <span
                        className="action-item-priority"
                        style={{ backgroundColor: getPriorityColor(item.priority) }}
                      ></span>
                      <p className="action-item-description">
                        {item.description}
                        {item.isEmailTask && (
                          <span className="email-badge" title="Email task">
                            📧
                          </span>
                        )}
                        {item.isCalendarTask && (
                          <span className="calendar-badge" title="Calendar task">
                            📅
                          </span>
                        )}
                        {item.isWordEditTask && (
                          <span className="word-edit-badge" title="Word edit task">
                            ✍️
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="action-item-actions">
                      {item.details && (
                        <button
                          className="action-item-btn expand-btn"
                          onClick={() => toggleExpand(item.originalIndex)}
                          title={expandedItems[item.originalIndex] ? 'Collapse' : 'Expand'}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path
                              d={expandedItems[item.originalIndex] ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"}
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      )}
                      {item.isEmailTask && !item.emailDraft && !draftingEmail[item.originalIndex] && (
                        <button
                          className="action-item-btn draft-email-btn"
                          onClick={() => handleDraftEmail(item.originalIndex)}
                          title="Draft email"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      )}
                      {draftingEmail[item.originalIndex] && (
                        <div className="drafting-spinner">
                          <div className="spinner"></div>
                        </div>
                      )}
                      {item.emailDraft && (
                        <a
                          href={item.emailDraft.mailtoLink}
                          className="action-item-btn open-draft-btn"
                          title="Open in email client"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </a>
                      )}
                      {item.isCalendarTask && !item.calendarEvent && !creatingEvent[item.originalIndex] && (
                        <button
                          className="action-item-btn create-event-btn"
                          onClick={() => handleCreateCalendarEvent(item.originalIndex)}
                          title="Create calendar event"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      )}
                      {creatingEvent[item.originalIndex] && (
                        <div className="creating-spinner">
                          <div className="spinner"></div>
                        </div>
                      )}
                      {item.calendarEvent && (
                        <>
                          <button
                            className="action-item-btn download-ics-btn"
                            onClick={() => handleDownloadICS(item.originalIndex)}
                            title="Download .ics file"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          <a
                            href={item.calendarEvent.googleCalendarURL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="action-item-btn google-calendar-btn"
                            title="Add to Google Calendar"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/>
                              <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2"/>
                              <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2"/>
                              <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2"/>
                              <text x="12" y="17" fontSize="10" textAnchor="middle" fill="currentColor" fontWeight="bold">G</text>
                            </svg>
                          </a>
                        </>
                      )}
                      {item.isWordEditTask && !item.wordEdit && !generatingEdit[item.originalIndex] && (
                        <button
                          className="action-item-btn generate-edit-btn"
                          onClick={() => handleGenerateWordEdit(item.originalIndex)}
                          title="Generate edit"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      )}
                      {generatingEdit[item.originalIndex] && (
                        <div className="generating-spinner">
                          <div className="spinner"></div>
                        </div>
                      )}
                      {item.wordEdit && (
                        <button
                          className="action-item-btn view-edit-btn"
                          onClick={() => toggleEditExpand(item.originalIndex)}
                          title={expandedEdits[item.originalIndex] ? 'Hide edit' : 'View edit'}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path
                              d={expandedEdits[item.originalIndex] ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"}
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      )}
                      {!item.completed && (
                        <button
                          className="action-item-btn complete-btn"
                          onClick={() => handleComplete(item.originalIndex)}
                          title="Mark as complete"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      )}
                      <button
                        className="action-item-btn delete-btn"
                        onClick={() => handleDelete(item.originalIndex)}
                        title="Delete"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  {expandedItems[item.originalIndex] && item.details && (
                    <div className="action-item-details">
                      <p>{item.details}</p>
                    </div>
                  )}
                  {expandedEdits[item.originalIndex] && item.wordEdit && (
                    <div className="word-edit-dropdown">
                      <div className="edit-location">
                        <strong>Location:</strong> {item.wordEdit.location}
                      </div>
                      
                      <div className="edit-comparison">
                        <div className="edit-column">
                          <div className="edit-label-header">Original Text</div>
                          <div className="edit-box original-text">
                            {item.wordEdit.targetText}
                          </div>
                        </div>
                        
                        <div className="edit-column">
                          <div className="edit-label-header">Suggested Edit</div>
                          <div className="edit-box suggested-text">
                            {item.wordEdit.suggestedEdit}
                          </div>
                        </div>
                      </div>

                      <div className="edit-explanation-section">
                        <strong>Explanation:</strong> {item.wordEdit.explanation}
                      </div>

                      <div className="edit-actions">
                        <button 
                          className="edit-action-btn accept-btn"
                          onClick={() => handleAcceptEdit(item)}
                          title="Accept & apply this edit to the document"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ActionItems;
