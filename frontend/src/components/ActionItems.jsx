import { useState } from 'react';
import axios from 'axios';
import './ActionItems.css';

function ActionItems({ actionItems, onUpdate }) {
  const [expandedItems, setExpandedItems] = useState({});

  const toggleExpand = (index) => {
    setExpandedItems(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
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
                      <p className="action-item-description">{item.description}</p>
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
