import { useState, useEffect } from 'react';
import axios from 'axios';
import ActionItems from './ActionItems';
import './ActionItemsPage.css';

function ActionItemsPage({ hamburgerButton }) {
  const [actionItems, setActionItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActionItems();
  }, []);

  const fetchActionItems = async () => {
    try {
      const response = await axios.get('/api/action-items');
      setActionItems(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching action items:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading action items...</div>;
  }

  return (
    <div className="action-items-page">
      <header className="page-header">
        <div className="page-header-left">
          {hamburgerButton}
          <div>
            <h1>Action Items</h1>
            <p className="page-subtitle">
              Tasks and TODOs extracted from your documents
            </p>
          </div>
        </div>
      </header>

      <div className="action-items-content">
        {actionItems.length === 0 ? (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
              <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <h2>No action items yet</h2>
            <p>
              Action items will appear here when you add TODOs, tasks, or action items
              to your documents. They are automatically extracted when you exit a document.
            </p>
          </div>
        ) : (
          <ActionItems actionItems={actionItems} onUpdate={fetchActionItems} />
        )}
      </div>
    </div>
  );
}

export default ActionItemsPage;
