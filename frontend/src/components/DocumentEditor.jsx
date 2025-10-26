import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import ReactQuill, { Quill } from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import './DocumentEditor.css';

// Register custom font sizes with Quill
const Size = Quill.import('attributors/style/size');
Size.whitelist = ['8px', '9px', '10px', '11px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '48px', '64px', '72px'];
Quill.register(Size, true);

// Register custom fonts with Quill
const Font = Quill.import('attributors/style/font');
Font.whitelist = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Helvetica', 'Comic Sans MS', 'Impact', 'Trebuchet MS', 'Palatino'];
Quill.register(Font, true);

// Tab colors for highlights - very light initial highlights
const TAB_COLORS_LIGHT = {
  summary: '#FFF9E6',      // Very light yellow
  definitions: '#E8F5E9',  // Very light green
  questions: '#E3F2FD',    // Very light blue
  notes: '#FFEBEE',        // Very light pink
  edits: '#F3E5F5',        // Very light purple
  versions: '#EDE7F6'      // Very light lavender
};

// Darker colors when clicking on the tab item
const TAB_COLORS_DARK = {
  summary: '#FFC107',      // Much darker yellow
  definitions: '#66BB6A',  // Much darker green
  questions: '#42A5F5',    // Much darker blue
  notes: '#EF5350',        // Much darker pink
  edits: '#AB47BC',        // Much darker purple
  versions: '#7E57C2'      // Much darker lavender
};

function DocumentEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [docData, setDocData] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tabs, setTabs] = useState({
    summary: [],
    definitions: [],
    questions: [],
    edits: []
  });
  const [customTabs, setCustomTabs] = useState([]);
  const [activeTab, setActiveTab] = useState('summary');
  const [activeToolPanel, setActiveToolPanel] = useState(null);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showCustomTabModal, setShowCustomTabModal] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const [commandPosition, setCommandPosition] = useState({ top: 0, left: 0 });
  const [selectedText, setSelectedText] = useState('');
  const [selectedRange, setSelectedRange] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [newTabName, setNewTabName] = useState('');
  const [newTabShortcut, setNewTabShortcut] = useState('');
  const [activeHighlightId, setActiveHighlightId] = useState(null); // Track which item is currently highlighted
  const [latestItemId, setLatestItemId] = useState(null); // Track the latest created item for scrolling
  const [hiddenHighlightTabs, setHiddenHighlightTabs] = useState(new Set()); // Track which tabs have hidden highlights
  const saveTimeoutRef = useRef(null);
  const quillRef = useRef(null);
  const commandInputRef = useRef(null);
  const latestItemRef = useRef(null);

  // Generate color for custom tab based on tab ID
  const getTabColor = (tabId, isDark = false) => {
    const colorMap = isDark ? TAB_COLORS_DARK : TAB_COLORS_LIGHT;

    if (colorMap[tabId]) {
      return colorMap[tabId];
    }

    // Generate a color for custom tabs based on their ID
    const customTab = customTabs.find(t => t.id === tabId);
    if (customTab && !customTab.color) {
      // Assign pastel colors for custom tabs
      const lightColors = ['#FFF3E0', '#F1F8E9', '#E0F7FA', '#FCE4EC', '#EDE7F6', '#FFF8E1'];
      const darkColors = ['#FFB74D', '#AED581', '#4DD0E1', '#F06292', '#9575CD', '#FFD54F'];
      const colors = isDark ? darkColors : lightColors;
      const colorIndex = parseInt(customTab.id) % colors.length;
      return colors[colorIndex];
    }
    return customTab?.color || (isDark ? '#BDBDBD' : '#F5F5F5');
  };

  // Adjust command palette position to keep it within viewport
  const adjustPositionToViewport = (initialTop, initialLeft) => {
    // Approximate dimensions of the command palette
    const PALETTE_WIDTH = 350;
    const PALETTE_HEIGHT = 280;
    const MARGIN = 10;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedTop = initialTop;
    let adjustedLeft = initialLeft;

    // Adjust horizontal position
    if (initialLeft + PALETTE_WIDTH > viewportWidth) {
      // Too far right, shift left
      adjustedLeft = viewportWidth - PALETTE_WIDTH - MARGIN;
    }
    if (adjustedLeft < MARGIN) {
      // Too far left, shift right
      adjustedLeft = MARGIN;
    }

    // Adjust vertical position
    if (initialTop + PALETTE_HEIGHT > viewportHeight) {
      // Too far down, position above the selection instead
      adjustedTop = initialTop - PALETTE_HEIGHT - 40; // 40 is approximate selection height
    }
    if (adjustedTop < MARGIN) {
      // Too far up, shift down
      adjustedTop = MARGIN;
    }

    return { top: adjustedTop, left: adjustedLeft };
  };

  useEffect(() => {
    fetchDocument();

    // Extract action items when component unmounts (user exits)
    return () => {
      if (id) {
        extractActionItemsOnExit();
      }
    };
  }, [id]);

  // Restore highlights when document loads or tabs change
  useEffect(() => {
    const quill = quillRef.current?.getEditor();
    if (!quill || loading) return;

    // Small delay to ensure content is loaded
    const timeoutId = setTimeout(() => {
      // Get all items from all tabs (including edits)
      const allItems = [
        ...Object.values(tabs).flat(),
        ...customTabs.flatMap(t => t.items)
      ];

      // Re-apply all highlights
      allItems.forEach(item => {
        if (item.position !== undefined && item.length && !hiddenHighlightTabs.has(item.tabId)) {
          const lightColor = getTabColor(item.tabId, false);
          quill.formatText(item.position, item.length, 'background', lightColor);
        }
      });
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [tabs, customTabs, loading, hiddenHighlightTabs, getTabColor]);

  // Scroll to latest item when created
  useEffect(() => {
    if (latestItemId && latestItemRef.current) {
      latestItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      // Add flash animation
      latestItemRef.current.classList.add('highlight-flash');
      setTimeout(() => {
        if (latestItemRef.current) {
          latestItemRef.current.classList.remove('highlight-flash');
        }
      }, 1000);

      setLatestItemId(null); // Reset after scrolling
    }
  }, [latestItemId]);

  // Click away handler to restore light color
  useEffect(() => {
    const handleClickAway = (e) => {
      // Check if click is outside tab cards
      const isTabCard = e.target.closest('.tab-card');
      if (!isTabCard && activeHighlightId) {
        // Restore to light color
        const quill = quillRef.current?.getEditor();
        if (quill) {
          const allItems = [...Object.values(tabs).flat(), ...customTabs.flatMap(t => t.items)];
          const activeItem = allItems.find(i => i.id === activeHighlightId);
          if (activeItem) {
            const lightColor = getTabColor(activeItem.tabId, false);
            quill.formatText(activeItem.position, activeItem.length, 'background', lightColor);
            setContent(quill.root.innerHTML);
          }
        }

        // Remove highlight box
        const existingBox = document.querySelector('.highlight-indicator');
        if (existingBox) {
          existingBox.remove();
        }

        setActiveHighlightId(null);
      }
    };

    document.addEventListener('mousedown', handleClickAway);
    return () => {
      document.removeEventListener('mousedown', handleClickAway);
    };
  }, [activeHighlightId, tabs, customTabs, getTabColor]);
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
      console.log('Fetched document:', response.data);
      setDocData(response.data);
      setTitle(response.data.title);
      setContent(response.data.content);
      // Load tabs if they exist
      if (response.data.tabs) {
        setTabs(response.data.tabs);
      }
      // Load custom tabs if they exist
      if (response.data.customTabs) {
        console.log('Loading custom tabs from document:', response.data.customTabs);
        setCustomTabs(response.data.customTabs);
      } else {
        console.log('No custom tabs found in document');
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching document:', error);
      setLoading(false);
    }
  };

  const saveDocument = async (newTitle, newContent, newTabs = tabs, newCustomTabs = customTabs) => {
    setSaving(true);
    try {
      await axios.put(`/api/documents/${id}`, {
        title: newTitle,
        content: newContent,
        tabs: newTabs,
        customTabs: newCustomTabs
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

  // Create custom tab
  const handleCreateCustomTab = useCallback(() => {
    if (!newTabName.trim() || !newTabShortcut.trim()) {
      alert('Please provide both a tab name and shortcut!');
      return;
    }

    // Check if shortcut already exists
    const existingShortcut = customTabs.find(t => t.shortcut === newTabShortcut.toLowerCase());
    if (existingShortcut) {
      alert('This shortcut already exists! Please choose a different one.');
      return;
    }

    const newCustomTab = {
      id: Date.now().toString(),
      name: newTabName,
      shortcut: newTabShortcut.toLowerCase(),
      items: []
    };

    const updatedCustomTabs = [...customTabs, newCustomTab];
    setCustomTabs(updatedCustomTabs);
    saveDocument(title, content, tabs, updatedCustomTabs);

    // Reset form
    setNewTabName('');
    setNewTabShortcut('');
    setShowCustomTabModal(false);
  }, [newTabName, newTabShortcut, customTabs, title, content, tabs]);

  // Delete custom tab
  const handleDeleteCustomTab = useCallback((tabId) => {
    const updatedCustomTabs = customTabs.filter(t => t.id !== tabId);
    setCustomTabs(updatedCustomTabs);
    saveDocument(title, content, tabs, updatedCustomTabs);
  }, [customTabs, title, content, tabs]);

  // Clear all highlights from the document
  const handleClearAllHighlights = useCallback(() => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    const length = quill.getLength();
    // Remove all background formatting
    quill.formatText(0, length, 'background', false);
    setContent(quill.root.innerHTML);
    saveDocument(title, quill.root.innerHTML, tabs, customTabs);
  }, [title, tabs, customTabs]);

  // Toggle highlights visibility for a specific tab
  const handleToggleTabHighlights = useCallback((tabId) => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    const newHiddenTabs = new Set(hiddenHighlightTabs);
    const isCurrentlyHidden = hiddenHighlightTabs.has(tabId);

    // Get all items for this tab
    const customTab = customTabs.find(t => t.id === tabId);
    const items = customTab ? customTab.items : (tabs[tabId] || []);

    if (isCurrentlyHidden) {
      // Show highlights - restore light colors
      items.forEach(item => {
        const lightColor = getTabColor(item.tabId || tabId, false);
        quill.formatText(item.position, item.length, 'background', lightColor);
      });
      newHiddenTabs.delete(tabId);
    } else {
      // Hide highlights - remove background
      items.forEach(item => {
        quill.formatText(item.position, item.length, 'background', false);
      });
      newHiddenTabs.add(tabId);
    }

    setHiddenHighlightTabs(newHiddenTabs);
    setContent(quill.root.innerHTML);
  }, [hiddenHighlightTabs, tabs, customTabs, getTabColor]);

  // Process command input
  const handleCommandSubmit = useCallback(async (e) => {
    if (e) e.preventDefault();
    if (!commandInput.trim() || !selectedText) return;

    const cmd = commandInput.trim().toLowerCase();
    setLoadingAI(true);

    console.log('Command:', cmd);
    console.log('Custom tabs:', customTabs);

    try {
      // Parse command
      let tabName = '';
      let useAI = false;
      let customPrompt = '';
      let customTabMatch = null;

      // Check built-in commands FIRST (with priority for /ai variants)
      if (cmd.startsWith('e/ai')) {
        tabName = 'edits';
        useAI = true;
        customPrompt = cmd.substring(4).trim(); // Everything after 'e/ai'
      } else if (cmd.startsWith('s/ai')) {
        tabName = 'summary';
        useAI = true;
        customPrompt = cmd.substring(4).trim(); // Everything after 's/ai'
      } else if (cmd.startsWith('s/')) {
        tabName = 'summary';
        useAI = false;
        customPrompt = cmd.substring(2).trim(); // Everything after 's/' is the manual comment
      } else if (cmd.startsWith('d/ai')) {
        tabName = 'definitions';
        useAI = true;
        customPrompt = cmd.substring(4).trim(); // Everything after 'd/ai'
      } else if (cmd.startsWith('d/')) {
        tabName = 'definitions';
        useAI = false;
        customPrompt = cmd.substring(2).trim(); // Everything after 'd/' is the manual comment
      } else if (cmd.startsWith('q/ai')) {
        tabName = 'questions';
        useAI = true;
        customPrompt = cmd.substring(4).trim(); // Everything after 'q/ai'
      } else if (cmd.startsWith('q/')) {
        tabName = 'questions';
        useAI = false;
        customPrompt = cmd.substring(2).trim(); // Everything after 'q/' is the manual comment
      } else if (cmd === 's') {
        tabName = 'summary';
      } else if (cmd === 'd') {
        tabName = 'definitions';
      } else if (cmd === 'q') {
        tabName = 'questions';
      } else {
        // Check for custom tab shortcuts
        customTabMatch = customTabs.find(t => {
          const cmdLower = commandInput.trim().toLowerCase();
          return cmdLower === t.shortcut ||
                 cmdLower.startsWith(`${t.shortcut}/ai `) ||
                 cmdLower.startsWith(`${t.shortcut}/`);
        });

        console.log('Custom tab match:', customTabMatch);

        if (customTabMatch) {
          tabName = customTabMatch.id;
          const cmdLower = commandInput.trim().toLowerCase();
          if (cmdLower.startsWith(`${customTabMatch.shortcut}/ai `)) {
            useAI = true;
            customPrompt = commandInput.trim().substring(customTabMatch.shortcut.length + 4).trim(); // After 'shortcut/ai '
          } else if (cmdLower.startsWith(`${customTabMatch.shortcut}/`)) {
            useAI = false;
            customPrompt = commandInput.trim().substring(customTabMatch.shortcut.length + 1).trim(); // After 'shortcut/'
          }
        } else {
          // Invalid command
          alert('Invalid command! Try: s/ai, d/ai, q/ai, or your custom shortcuts');
          setLoadingAI(false);
          return;
        }
      }

      let resultText = selectedText;
      let isAIGenerated = false;
      let isCustomTab = customTabMatch !== null;

      console.log('Tab name:', tabName);
      console.log('Is custom tab:', isCustomTab);
      console.log('Current tabs state:', tabs);
      console.log('Current customTabs state:', customTabs);

      // Execute AI command if needed
      let editedText = null;
      let explanation = null;

      if (useAI) {
        isAIGenerated = true;

        try {
          if (tabName === 'edits') {
            // Call the edit API for edit commands
            const response = await axios.post('/api/ai/process-edit', {
              originalText: selectedText,
              editInstruction: customPrompt || 'improve this text'
            });

            editedText = response.data.editedText;
            explanation = response.data.explanation;
            resultText = editedText;
            setAiResponse(explanation);
          } else {
            // Call the regular AI API for other commands
            const response = await axios.post('/api/ai/process-command', {
              highlightedText: selectedText,
              tabType: tabName,
              customPrompt: customPrompt || ''
            });

            resultText = response.data.response;
            setAiResponse(resultText);
          }
        } catch (error) {
          console.error('Error calling AI API:', error);
          resultText = 'Error: Failed to process AI command. Please try again.';
          setAiResponse(resultText);
        }
      }

      // Add to tab
      const newItem = {
        id: Date.now().toString(),
        text: resultText,
        highlightedText: selectedText,  // Always store the highlighted text
        prompt: customPrompt || undefined,  // Store user's prompt/comment (both AI and manual)
        position: selectedRange.index,
        length: selectedRange.length,
        createdAt: new Date().toISOString(),
        isAIGenerated,
        isManualComment: !useAI && customPrompt,  // Flag for manual comments
        tabId: tabName,
        // Edit-specific fields
        ...(tabName === 'edits' && {
          editedText,
          originalText: selectedText,
          explanation
        })
      };

      // Apply highlight to the selected text (light color)
      const quill = quillRef.current?.getEditor();
      if (quill) {
        const lightColor = getTabColor(tabName, false); // Use light color for initial highlight
        quill.formatText(selectedRange.index, selectedRange.length, 'background', lightColor);
        setContent(quill.root.innerHTML);
      }

      if (isCustomTab) {
        // Add to custom tab
        console.log('Adding to custom tab:', tabName);
        const updatedCustomTabs = customTabs.map(t => {
          if (t.id === tabName) {
            return { ...t, items: [...t.items, newItem] };
          }
          return t;
        });
        console.log('Updated custom tabs:', updatedCustomTabs);

        setCustomTabs(updatedCustomTabs);
        setActiveTab(tabName);
        setLatestItemId(newItem.id); // Set latest item for scrolling
        saveDocument(title, quill.root.innerHTML, tabs, updatedCustomTabs);
      } else {
        // Add to built-in tab
        console.log('Adding to built-in tab:', tabName);
        const updatedTabs = {
          ...tabs,
          [tabName]: [...tabs[tabName], newItem]
        };
        console.log('Updated tabs:', updatedTabs);

        setTabs(updatedTabs);
        setActiveTab(tabName);
        setLatestItemId(newItem.id); // Set latest item for scrolling
        saveDocument(title, quill.root.innerHTML, updatedTabs, customTabs);
      }

      // Close palette after short delay to show AI response
      setTimeout(() => {
        setShowCommandPalette(false);
        setCommandInput('');
        setAiResponse('');

        // Restore selection for aesthetic purposes
        const quill = quillRef.current?.getEditor();
        if (quill && selectedRange) {
          quill.setSelection(selectedRange.index, selectedRange.length);
        }
      }, useAI ? 2000 : 500);

    } catch (error) {
      console.error('Error processing command:', error);
      alert('Failed to process command. Please try again.');
    } finally {
      setLoadingAI(false);
    }
  }, [commandInput, selectedText, selectedRange, tabs, customTabs, title, content, getTabColor]);

  // Apply edit to document
  const handleApplyEdit = useCallback((editId) => {
    const edit = tabs.edits.find(e => e.id === editId);
    if (!edit) return;

    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    // Replace original text with edited text
    const textToInsert = edit.editedText || edit.text;
    quill.deleteText(edit.position, edit.length);
    quill.insertText(edit.position, textToInsert);

    // Remove the highlight
    quill.formatText(edit.position, textToInsert.length, 'background', false);

    // Update content
    setContent(quill.root.innerHTML);

    // Mark edit as applied (remove from edits tab)
    const updatedTabs = {
      ...tabs,
      edits: tabs.edits.filter(e => e.id !== editId)
    };

    setTabs(updatedTabs);
    saveDocument(title, quill.root.innerHTML, updatedTabs, customTabs);
  }, [tabs, title, customTabs]);

  // Delete a tab item and remove its highlight
  const handleDeleteTabItem = useCallback((item, tabId) => {
    const quill = quillRef.current?.getEditor();

    // Remove the highlight from the document
    if (quill && item.position !== undefined && item.length) {
      quill.formatText(item.position, item.length, 'background', false);
      setContent(quill.root.innerHTML);
    }

    // Remove from active highlight if it's the active one
    if (activeHighlightId === item.id) {
      setActiveHighlightId(null);
      const existingBox = document.querySelector('.highlight-indicator');
      if (existingBox) {
        existingBox.remove();
      }
    }

    // Check if it's a custom tab or built-in tab
    const customTab = customTabs.find(t => t.id === tabId);

    if (customTab) {
      // Remove from custom tab
      const updatedCustomTabs = customTabs.map(t => {
        if (t.id === tabId) {
          return { ...t, items: t.items.filter(i => i.id !== item.id) };
        }
        return t;
      });
      setCustomTabs(updatedCustomTabs);
      saveDocument(title, quill.root.innerHTML, tabs, updatedCustomTabs);
    } else {
      // Remove from built-in tab
      const updatedTabs = {
        ...tabs,
        [tabId]: tabs[tabId].filter(i => i.id !== item.id)
      };
      setTabs(updatedTabs);
      saveDocument(title, quill.root.innerHTML, updatedTabs, customTabs);
    }
  }, [tabs, customTabs, title, activeHighlightId]);

  // Scroll to highlighted text when clicking on tab item
  const handleScrollToHighlight = useCallback((item) => {
    console.log('Scrolling to highlight:', item);
    const quill = quillRef.current?.getEditor();
    if (!quill || !item.position) {
      console.log('No quill or position:', { quill: !!quill, position: item.position });
      return;
    }

    // If this item is already active, deactivate it (restore to light)
    if (activeHighlightId === item.id) {
      const lightColor = getTabColor(item.tabId, false);
      quill.formatText(item.position, item.length, 'background', lightColor);
      setContent(quill.root.innerHTML);
      setActiveHighlightId(null);

      // Remove any existing highlight box
      const existingBox = document.querySelector('.highlight-indicator');
      if (existingBox) {
        existingBox.remove();
      }
      return;
    }

    // First, restore any previously active highlight to light color
    if (activeHighlightId) {
      // Find the previously active item
      const allItems = [...Object.values(tabs).flat(), ...customTabs.flatMap(t => t.items)];
      const prevItem = allItems.find(i => i.id === activeHighlightId);
      if (prevItem) {
        const prevLightColor = getTabColor(prevItem.tabId, false);
        quill.formatText(prevItem.position, prevItem.length, 'background', prevLightColor);
      }

      // Remove any existing highlight box
      const existingBox = document.querySelector('.highlight-indicator');
      if (existingBox) {
        existingBox.remove();
      }
    }

    // Scroll to the position
    const bounds = quill.getBounds(item.position, item.length);
    console.log('Bounds:', bounds);
    const editorContainer = document.querySelector('.ql-editor');
    console.log('Editor container:', editorContainer);

    if (editorContainer && bounds) {
      console.log('Scrolling and highlighting...');

      // Use scrollIntoView for more reliable scrolling
      const tempSpan = document.createElement('span');
      tempSpan.style.position = 'absolute';
      tempSpan.style.top = `${bounds.top}px`;
      editorContainer.appendChild(tempSpan);
      tempSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
      tempSpan.remove();

      // Get light and dark colors
      const lightColor = getTabColor(item.tabId, false);
      const darkColor = getTabColor(item.tabId, true);
      console.log('Colors:', { lightColor, darkColor });

      // Change to darker shade when clicked - keep it dark
      quill.formatText(item.position, item.length, 'background', darkColor);
      console.log('Applied dark highlight');

      // Also update the content to see the change
      setContent(quill.root.innerHTML);

      // Set this item as the active highlight
      setActiveHighlightId(item.id);

      // Create a persistent highlight box overlay
      const highlightBox = document.createElement('div');
      highlightBox.className = 'highlight-indicator';
      highlightBox.style.position = 'absolute';
      highlightBox.style.left = `${bounds.left}px`;
      highlightBox.style.top = `${bounds.top}px`;
      highlightBox.style.width = `${bounds.width}px`;
      highlightBox.style.height = `${bounds.height}px`;
      highlightBox.style.border = `4px solid ${darkColor}`;
      highlightBox.style.borderRadius = '6px';
      highlightBox.style.pointerEvents = 'none';
      highlightBox.style.zIndex = '100';
      highlightBox.style.boxShadow = `0 0 12px ${darkColor}`;

      console.log('Created highlight box');

      const editorElement = document.querySelector('.ql-editor');
      if (editorElement) {
        editorElement.style.position = 'relative';
        editorElement.appendChild(highlightBox);
        console.log('Added highlight box to editor');
      } else {
        console.log('Could not find editor element');
      }
    } else {
      console.log('Missing editor container or bounds:', { editorContainer: !!editorContainer, bounds });
    }
  }, [customTabs, tabs, getTabColor, activeHighlightId]);

  // Toggle toolbar panel
  const toggleToolPanel = (panelName) => {
    setActiveToolPanel(activeToolPanel === panelName ? null : panelName);
  };

  // Font options
  const fontFamilies = [
    'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana',
    'Helvetica', 'Comic Sans MS', 'Impact', 'Trebuchet MS', 'Palatino'
  ];

  const fontSizes = [
    '8px', '9px', '10px', '11px', '12px', '14px', '16px', '18px',
    '20px', '24px', '28px', '32px', '36px', '48px', '64px', '72px'
  ];

  const colors = [
    '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
    '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
    '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
    '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
    '#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0'
  ];

  // Apply formatting from vertical toolbar
  const applyFormat = (format, value) => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    const selection = quill.getSelection();
    if (selection && selection.length > 0) {
      // Format selected text
      quill.formatText(selection.index, selection.length, format, value);
    } else if (selection) {
      // Set format for next insertion if no selection
      quill.format(format, value);
    }

    // Update content state
    setContent(quill.root.innerHTML);

    setActiveToolPanel(null);
  };

  // Listen for text selection (just track selection, don't show palette yet)
  useEffect(() => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    const handleSelectionChange = (range, oldRange, source) => {
      if (range && range.length > 0) {
        // User has selected text - store it for when they press Cmd+E
        const text = quill.getText(range.index, range.length).trim();
        if (!text) return;

        setSelectedText(text);
        setSelectedRange(range);
      } else if (range && range.length === 0) {
        // No selection - hide palette if not in use
        if (document.activeElement !== commandInputRef.current && !loadingAI) {
          setShowCommandPalette(false);
        }
      }
    };

    quill.on('selection-change', handleSelectionChange);
    return () => {
      quill.off('selection-change', handleSelectionChange);
    };
  }, [loadingAI]);

  // Listen for text changes to detect deletions and remove highlights
  useEffect(() => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    const handleTextChange = (delta, oldDelta, source) => {
      if (source !== 'user') return; // Only handle user edits

      let index = 0;
      let deletionStart = -1;
      let deletionLength = 0;
      let insertionStart = -1;
      let insertionLength = 0;

      // Analyze the delta to find deletions and insertions
      delta.ops.forEach(op => {
        if (op.retain) {
          index += op.retain;
        } else if (op.delete) {
          deletionStart = index;
          deletionLength = op.delete;
        } else if (op.insert) {
          if (insertionStart === -1) {
            insertionStart = index;
          }
          const length = typeof op.insert === 'string' ? op.insert.length : 1;
          insertionLength += length;
          index += length;
        }
      });

      console.log('Text change:', { deletionStart, deletionLength, insertionStart, insertionLength });

      // If there was a deletion, check if it overlaps with any highlights and update positions
      if (deletionStart >= 0 && deletionLength > 0) {
        const deletionEnd = deletionStart + deletionLength;
        let highlightsChanged = false;

        // Check all built-in tabs
        const updatedTabs = { ...tabs };
        Object.keys(updatedTabs).forEach(tabKey => {
          const updatedItems = [];

          updatedTabs[tabKey].forEach(item => {
            const itemStart = item.position;
            const itemEnd = item.position + item.length;

            // Check if deletion overlaps with this highlight
            const overlaps = !(deletionEnd <= itemStart || deletionStart >= itemEnd);

            if (overlaps) {
              // Check if the ENTIRE highlight is deleted
              const entirelyDeleted = deletionStart <= itemStart && deletionEnd >= itemEnd;

              if (entirelyDeleted) {
                // Remove this item completely
                highlightsChanged = true;
              } else {
                // Partial deletion - update the highlighted text and adjust position/length
                const newStart = Math.max(itemStart, deletionStart);
                const newEnd = Math.min(itemEnd, deletionEnd);
                const overlapLength = newEnd - newStart;

                let newPosition = item.position;
                let newLength = item.length;

                if (deletionStart <= itemStart) {
                  // Deletion at start of highlight
                  newPosition = deletionStart;
                  newLength = item.length - overlapLength;
                } else if (deletionEnd >= itemEnd) {
                  // Deletion at end of highlight
                  newLength = item.length - overlapLength;
                } else {
                  // Deletion in middle of highlight
                  newLength = item.length - overlapLength;
                }

                // Get the updated text from the document
                const updatedText = quill.getText(newPosition, newLength).trim();

                updatedItems.push({
                  ...item,
                  position: newPosition,
                  length: newLength,
                  highlightedText: updatedText,
                  // For edits, also update originalText to reflect the new content
                  ...(tabKey === 'edits' && item.originalText && {
                    originalText: updatedText
                  })
                });
                highlightsChanged = true;
              }
            } else {
              // Keep this item, but adjust position if it comes after the deletion
              if (itemStart >= deletionEnd) {
                // Item is completely after the deletion, shift it back
                updatedItems.push({
                  ...item,
                  position: item.position - deletionLength
                });
                highlightsChanged = true;
              } else {
                // Item is before the deletion, no change needed
                updatedItems.push(item);
              }
            }
          });

          updatedTabs[tabKey] = updatedItems;
        });

        // Check custom tabs
        const updatedCustomTabs = customTabs.map(tab => {
          const updatedItems = [];

          tab.items.forEach(item => {
            const itemStart = item.position;
            const itemEnd = item.position + item.length;

            const overlaps = !(deletionEnd <= itemStart || deletionStart >= itemEnd);

            if (overlaps) {
              const entirelyDeleted = deletionStart <= itemStart && deletionEnd >= itemEnd;

              if (entirelyDeleted) {
                highlightsChanged = true;
              } else {
                const newStart = Math.max(itemStart, deletionStart);
                const newEnd = Math.min(itemEnd, deletionEnd);
                const overlapLength = newEnd - newStart;

                let newPosition = item.position;
                let newLength = item.length;

                if (deletionStart <= itemStart) {
                  newPosition = deletionStart;
                  newLength = item.length - overlapLength;
                } else if (deletionEnd >= itemEnd) {
                  newLength = item.length - overlapLength;
                } else {
                  newLength = item.length - overlapLength;
                }

                const updatedText = quill.getText(newPosition, newLength).trim();

                updatedItems.push({
                  ...item,
                  position: newPosition,
                  length: newLength,
                  highlightedText: updatedText,
                  // For edits in custom tabs, also update originalText
                  ...(item.originalText && {
                    originalText: updatedText
                  })
                });
                highlightsChanged = true;
              }
            } else {
              if (itemStart >= deletionEnd) {
                updatedItems.push({
                  ...item,
                  position: item.position - deletionLength
                });
                highlightsChanged = true;
              } else {
                updatedItems.push(item);
              }
            }
          });

          return { ...tab, items: updatedItems };
        });

        if (highlightsChanged) {
          setTabs(updatedTabs);
          setCustomTabs(updatedCustomTabs);
          saveDocument(title, quill.root.innerHTML, updatedTabs, updatedCustomTabs);
        }
      }

      // If there was an insertion, shift all highlights that come after it OR update text if insertion is within
      if (insertionStart >= 0 && insertionLength > 0) {
        let highlightsChanged = false;

        // Update built-in tabs
        const updatedTabs = { ...tabs };
        Object.keys(updatedTabs).forEach(tabKey => {
          const updatedItems = updatedTabs[tabKey].map(item => {
            const itemStart = item.position;
            const itemEnd = item.position + item.length;

            // Check if insertion is within this highlight
            if (insertionStart > itemStart && insertionStart < itemEnd) {
              // Insertion within the highlight - expand it and update text
              highlightsChanged = true;
              const newLength = item.length + insertionLength;
              const updatedText = quill.getText(item.position, newLength);

              return {
                ...item,
                length: newLength,
                highlightedText: updatedText,
                // For edits, also update originalText to reflect the new content
                ...(tabKey === 'edits' && item.originalText && {
                  originalText: updatedText
                })
              };
            } else if (item.position >= insertionStart) {
              // Highlight starts at or after insertion point - shift it forward
              highlightsChanged = true;
              return {
                ...item,
                position: item.position + insertionLength
              };
            }
            return item;
          });
          updatedTabs[tabKey] = updatedItems;
        });

        // Update custom tabs
        const updatedCustomTabs = customTabs.map(tab => {
          const updatedItems = tab.items.map(item => {
            const itemStart = item.position;
            const itemEnd = item.position + item.length;

            // Check if insertion is within this highlight
            if (insertionStart > itemStart && insertionStart < itemEnd) {
              // Insertion within the highlight - expand it and update text
              highlightsChanged = true;
              const newLength = item.length + insertionLength;
              const updatedText = quill.getText(item.position, newLength);

              return {
                ...item,
                length: newLength,
                highlightedText: updatedText,
                // For edits in custom tabs, also update originalText
                ...(item.originalText && {
                  originalText: updatedText
                })
              };
            } else if (item.position >= insertionStart) {
              // Highlight starts at or after insertion point - shift it forward
              highlightsChanged = true;
              return {
                ...item,
                position: item.position + insertionLength
              };
            }
            return item;
          });
          return { ...tab, items: updatedItems };
        });

        if (highlightsChanged) {
          setTabs(updatedTabs);
          setCustomTabs(updatedCustomTabs);
          saveDocument(title, quill.root.innerHTML, updatedTabs, updatedCustomTabs);
        }
      }
    };

    quill.on('text-change', handleTextChange);
    return () => {
      quill.off('text-change', handleTextChange);
    };
  }, [tabs, customTabs, title]);

  // Handle clicks on highlighted text to navigate to comment
  useEffect(() => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    const handleEditorClick = (e) => {
      // Small delay to let Quill update the selection
      setTimeout(() => {
        const selection = quill.getSelection();
        if (!selection) return;

        const clickIndex = selection.index;

        console.log('Clicked at index:', clickIndex);

        // Find all items across all tabs
        const allItems = [
          ...Object.entries(tabs).flatMap(([tabKey, items]) =>
            items.map(item => ({ ...item, tabKey }))
          ),
          ...customTabs.flatMap(tab =>
            tab.items.map(item => ({ ...item, tabKey: tab.id }))
          )
        ];

        console.log('All items:', allItems);

        // Find if click is within any highlight
        const clickedItem = allItems.find(item => {
          const inRange = clickIndex >= item.position && clickIndex < item.position + item.length;
          if (inRange) {
            console.log('Found clicked item:', item);
          }
          return inRange;
        });

        if (clickedItem) {
          console.log('Switching to tab:', clickedItem.tabKey);
          console.log('Setting latestItemId to:', clickedItem.id);

          // Switch to the correct tab
          setActiveTab(clickedItem.tabKey);

          // Scroll to the item in the sidebar after tab switch
          setTimeout(() => {
            setLatestItemId(clickedItem.id);
            console.log('latestItemId set');
          }, 200);
        }
      }, 10);
    };

    const editorElement = quill.root;
    editorElement.addEventListener('click', handleEditorClick);

    return () => {
      editorElement.removeEventListener('click', handleEditorClick);
    };
  }, [tabs, customTabs]);

  // Auto-focus command input when palette shows
  useEffect(() => {
    if (showCommandPalette && commandInputRef.current) {
      setTimeout(() => {
        commandInputRef.current?.focus();
      }, 100);
    }
  }, [showCommandPalette]);

  // Click away handler to close command palette
  useEffect(() => {
    if (!showCommandPalette) return;

    const handleClickOutside = (e) => {
      // Check if click is outside the command palette
      const palette = document.querySelector('.command-palette');
      if (palette && !palette.contains(e.target)) {
        // Close the palette
        setShowCommandPalette(false);
        setCommandInput('');
        setAiResponse('');

        // Remove any temporary highlight
        const quill = quillRef.current?.getEditor();
        if (quill && selectedRange) {
          quill.formatText(selectedRange.index, selectedRange.length, 'background', false);
          setContent(quill.root.innerHTML);
        }
      }
    };

    // Add listener with a slight delay to avoid immediate closing
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCommandPalette, selectedRange]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd/Ctrl + \ to remove all formatting
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();

        const quill = quillRef.current?.getEditor();
        if (!quill) return;

        const selection = quill.getSelection();
        if (!selection || selection.length === 0) return;

        // Get the text content
        const text = quill.getText(selection.index, selection.length);

        // Remove all formatting by deleting and re-inserting as plain text
        quill.deleteText(selection.index, selection.length);
        quill.insertText(selection.index, text, {
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          color: false,
          background: false,
          size: false,
          font: false,
          link: false
        });

        // Restore selection
        quill.setSelection(selection.index, selection.length);
        setContent(quill.root.innerHTML);
        saveDocument(title, quill.root.innerHTML, tabs, customTabs);

        return;
      }

      // Cmd/Ctrl + E to show command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();

        const quill = quillRef.current?.getEditor();
        if (!quill) return;

        const selection = quill.getSelection();
        if (!selection || selection.length === 0) {
          alert('Please select some text first!');
          return;
        }

        const text = quill.getText(selection.index, selection.length).trim();
        if (!text) return;

        setSelectedText(text);
        setSelectedRange(selection);

        // Get cursor position for command palette
        const bounds = quill.getBounds(selection.index, selection.length);
        const editorContainer = quill.container.getBoundingClientRect();

        const initialTop = editorContainer.top + bounds.bottom + window.scrollY + 10;
        const initialLeft = editorContainer.left + bounds.left + window.scrollX;

        // Adjust position to keep palette within viewport
        const adjustedPosition = adjustPositionToViewport(initialTop, initialLeft);

        setCommandPosition(adjustedPosition);
        setShowCommandPalette(true);
        setCommandInput('');
        setAiResponse('');
      }

      // Escape to close command palette or tool panels
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showCommandPalette) {
          // Remove temporary highlight when closing palette without submitting
          const quill = quillRef.current?.getEditor();
          if (quill && selectedRange) {
            quill.formatText(selectedRange.index, selectedRange.length, 'background', false);
            setContent(quill.root.innerHTML);
          }
          setShowCommandPalette(false);
          setCommandInput('');
          setAiResponse('');
        } else if (activeToolPanel) {
          setActiveToolPanel(null);
        }
      }
    };

    window.document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeToolPanel, showCommandPalette]);

  const modules = {
    toolbar: false // We're using custom vertical toolbar
  };

  const formats = [
    'header', 'font', 'size',
    'bold', 'italic', 'underline', 'strike',
    'list', 'bullet', 'indent',
    'align',
    'link', 'image',
    'color', 'background',
    'blockquote', 'code-block'
  ];

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner-large"></div>
        <span>Loading document...</span>
      </div>
    );
  }

  if (!docData) {
    return (
      <div className="error-container">
        <h2>Document not found</h2>
        <button onClick={() => navigate('/')}>Back to Documents</button>
      </div>
    );
  }

  return (
    <div className="dual-screen-container">
      {/* Top Header with Title */}
      <header className="top-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19l-7-7 7-7"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <input
          type="text"
          className="title-input-header"
          placeholder="Untitled Document"
          value={title}
          onChange={handleTitleChange}
        />
        <div className="save-status">
          {saving ? (
            <>
              <div className="spinner-small"></div>
              <span>Saving...</span>
            </>
          ) : (
            <span>All changes saved</span>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="main-content">
        {/* Vertical Toolbar */}
        <aside className="vertical-toolbar">
          <div className="toolbar-buttons">
            {/* Text Formatting */}
            <button
              className={`toolbar-btn ${activeToolPanel === 'font' ? 'active' : ''}`}
              onClick={() => toggleToolPanel('font')}
              title="Font Family"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M6 4h12v2H6V4zm0 14h12v2H6v-2zm6-12h4v12h-4V6z" fill="currentColor"/>
              </svg>
            </button>

            <button
              className={`toolbar-btn ${activeToolPanel === 'size' ? 'active' : ''}`}
              onClick={() => toggleToolPanel('size')}
              title="Font Size"
            >
              <span className="toolbar-text">Aa</span>
            </button>

            <button
              className="toolbar-btn"
              onClick={() => applyFormat('bold', true)}
              title="Bold"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6V4zm0 8h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6v-8z" fill="currentColor"/>
              </svg>
            </button>

            <button
              className="toolbar-btn"
              onClick={() => applyFormat('italic', true)}
              title="Italic"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M10 4h10v3h-3.5l-4 10H16v3H6v-3h3.5l4-10H10V4z" fill="currentColor"/>
              </svg>
            </button>

            <button
              className="toolbar-btn"
              onClick={() => applyFormat('underline', true)}
              title="Underline"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M6 3v7a6 6 0 0 0 12 0V3h-2v7a4 4 0 0 1-8 0V3H6zM4 21h16v-2H4v2z" fill="currentColor"/>
              </svg>
            </button>

            <div className="toolbar-divider"></div>

            <button
              className={`toolbar-btn ${activeToolPanel === 'color' ? 'active' : ''}`}
              onClick={() => toggleToolPanel('color')}
              title="Text Color"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M11 3L5.5 17h2.25l1.12-3h6.25l1.12 3h2.25L13 3h-2zm-1.38 9L12 5.67 14.38 12H9.62z" fill="currentColor"/>
                <rect x="4" y="20" width="16" height="2" fill="#1a73e8"/>
              </svg>
            </button>

            <button
              className={`toolbar-btn ${activeToolPanel === 'background' ? 'active' : ''}`}
              onClick={() => toggleToolPanel('background')}
              title="Background Color"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M16.56 8.94L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15a1.49 1.49 0 0 0 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12zM5.21 10L10 5.21 14.79 10H5.21zM19 11.5s-2 2.17-2 3.5c0 1.1.9 2 2 2s2-.9 2-2c0-1.33-2-3.5-2-3.5z" fill="currentColor"/>
                <rect x="2" y="20" width="20" height="2" fill="#1a73e8"/>
              </svg>
            </button>

            <div className="toolbar-divider"></div>

            <button
              className="toolbar-btn"
              onClick={() => applyFormat('align', 'left')}
              title="Align Left"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M3 3h18v2H3V3zm0 4h12v2H3V7zm0 4h18v2H3v-2zm0 4h12v2H3v-2zm0 4h18v2H3v-2z" fill="currentColor"/>
              </svg>
            </button>

            <button
              className="toolbar-btn"
              onClick={() => applyFormat('align', 'center')}
              title="Align Center"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M3 3h18v2H3V3zm3 4h12v2H6V7zm-3 4h18v2H3v-2zm3 4h12v2H6v-2zm-3 4h18v2H3v-2z" fill="currentColor"/>
              </svg>
            </button>

            <button
              className="toolbar-btn"
              onClick={() => applyFormat('align', 'right')}
              title="Align Right"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M3 3h18v2H3V3zm6 4h12v2H9V7zm-6 4h18v2H3v-2zm6 4h12v2H9v-2zm-6 4h18v2H3v-2z" fill="currentColor"/>
              </svg>
            </button>

            <div className="toolbar-divider"></div>

            <div className="toolbar-info">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span className="toolbar-hint">Select text, then type: s/ai, d/ai, q/ai</span>
            </div>
          </div>

          {/* Expandable Panels */}
          {activeToolPanel === 'font' && (
            <div className="tool-panel">
              <div className="panel-header">Font Family</div>
              <div className="font-list">
                {fontFamilies.map(font => (
                  <button
                    key={font}
                    className="font-option"
                    style={{ fontFamily: font }}
                    onClick={() => applyFormat('font', font)}
                  >
                    {font}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeToolPanel === 'size' && (
            <div className="tool-panel">
              <div className="panel-header">Font Size</div>
              <div className="size-list">
                {fontSizes.map(size => (
                  <button
                    key={size}
                    className="size-option"
                    onClick={() => applyFormat('size', size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeToolPanel === 'color' && (
            <div className="tool-panel">
              <div className="panel-header">Text Color</div>
              <div className="color-grid">
                {colors.map(color => (
                  <button
                    key={color}
                    className="color-option"
                    style={{ backgroundColor: color }}
                    onClick={() => applyFormat('color', color)}
                    title={color}
                  />
                ))}
              </div>
            </div>
          )}

          {activeToolPanel === 'background' && (
            <div className="tool-panel">
              <div className="panel-header">Background Color</div>
              <div className="color-grid">
                {colors.map(color => (
                  <button
                    key={color}
                    className="color-option"
                    style={{ backgroundColor: color }}
                    onClick={() => applyFormat('background', color)}
                    title={color}
                  />
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Document Area */}
        <div className="document-area">
          <div className="document-wrapper">
            <ReactQuill
              ref={quillRef}
              theme="snow"
              value={content}
              onChange={handleContentChange}
              modules={modules}
              formats={formats}
              placeholder="Start writing your document..."
            />
          </div>
        </div>

        {/* Tabbed Sidebar */}
        <div className="tabbed-sidebar">
          {/* Tab Navigation */}
          <div className="tab-navigation">
            <button
              className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
              onClick={() => setActiveTab('summary')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Summary</span>
            </button>
            <button
              className={`tab-btn ${activeTab === 'definitions' ? 'active' : ''}`}
              onClick={() => setActiveTab('definitions')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Definitions</span>
            </button>
            <button
              className={`tab-btn ${activeTab === 'questions' ? 'active' : ''}`}
              onClick={() => setActiveTab('questions')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3m.08 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Questions</span>
            </button>
            <button
              className={`tab-btn ${activeTab === 'edits' ? 'active' : ''}`}
              onClick={() => setActiveTab('edits')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Edits</span>
            </button>

            {/* Custom Tabs */}
            {customTabs.map((customTab) => (
              <button
                key={customTab.id}
                className={`tab-btn ${activeTab === customTab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(customTab.id)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M5 8h14M5 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 0v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8m-9 4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>{customTab.name}</span>
              </button>
            ))}

            {/* Add Custom Tab Button */}
            <button
              className="tab-btn add-tab-btn"
              onClick={() => setShowCustomTabModal(true)}
              title="Create custom tab"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>New Tab</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="tab-content">
            {(() => {
              const customTab = customTabs.find(t => t.id === activeTab);
              const unsortedItems = customTab ? customTab.items : (tabs[activeTab] || []);
              const tabName = customTab ? customTab.name : activeTab;
              const isHighlightHidden = hiddenHighlightTabs.has(activeTab);

              // Sort items by position in document
              // Primary sort: position (where the highlight starts)
              // Secondary sort: createdAt (when the comment was created)
              const items = [...unsortedItems].sort((a, b) => {
                if (a.position !== b.position) {
                  return a.position - b.position; // Earlier position comes first
                }
                // Same starting position, sort by creation time
                return new Date(a.createdAt) - new Date(b.createdAt);
              });

              return (
                <>
                  {/* Toggle Highlights Button */}
                  {items.length > 0 && (
                    <div className="tab-content-header">
                      <button
                        className="toggle-highlights-btn"
                        onClick={() => handleToggleTabHighlights(activeTab)}
                        title={isHighlightHidden ? "Show highlights" : "Hide highlights"}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                          {isHighlightHidden ? (
                            // Eye icon (show)
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          ) : (
                            // Eye-off icon (hide)
                            <>
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </>
                          )}
                        </svg>
                        <span>{isHighlightHidden ? "Show Highlights" : "Hide Highlights"}</span>
                      </button>
                    </div>
                  )}
                  {items.length === 0 ? (
                    <div className="empty-tab">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <p>No {tabName} yet</p>
                      <span>Select text and press Cmd+E{customTab && ` then type "${customTab.shortcut}"`}</span>
                      {customTab && (
                        <button
                          className="delete-custom-tab-btn"
                          onClick={() => handleDeleteCustomTab(customTab.id)}
                          style={{ marginTop: '20px' }}
                        >
                          Delete This Tab
                        </button>
                      )}
                    </div>
                  ) : (
                    items.map((item) => (
                      <div
                        key={item.id}
                        className="tab-card"
                        onClick={(e) => {
                          handleScrollToHighlight(item);
                          // Add flash animation when clicking on the card
                          const card = e.currentTarget;
                          card.classList.remove('highlight-flash');
                          // Force reflow to restart animation
                          void card.offsetWidth;
                          card.classList.add('highlight-flash');
                          setTimeout(() => {
                            card.classList.remove('highlight-flash');
                          }, 1000);
                        }}
                        style={{ cursor: 'pointer' }}
                        ref={item.id === latestItemId ? latestItemRef : null}
                      >
                        {/* Render edit cards differently */}
                        {activeTab === 'edits' && item.editedText ? (
                          <>
                            {item.highlightedText && (
                              <div className="item-highlighted-text">
                                <strong>Highlighted Text:</strong> {item.highlightedText}
                              </div>
                            )}
                            {item.prompt && (
                              <div className="item-prompt">
                                {item.prompt}
                              </div>
                            )}
                            <div className="edit-diff-container">
                              <div className="edit-section">
                                <div className="edit-label">Suggested Edit:</div>
                                <div className="edit-text edited-text">{item.editedText}</div>
                              </div>
                              {item.explanation && (
                                <div className="edit-explanation">
                                  {item.explanation}
                                </div>
                              )}
                            </div>
                            <div className="edit-actions">
                              <button
                                className="edit-accept-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleApplyEdit(item.id);
                                }}
                                title="Accept changes"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                Accept
                              </button>
                              <button
                                className="edit-reject-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTabItem(item, activeTab);
                                }}
                                title="Reject changes"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                Reject
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            {item.highlightedText && (
                              <div className="item-highlighted-text">
                                <strong>Highlighted Text:</strong> {item.highlightedText}
                              </div>
                            )}
                            {item.isManualComment && item.prompt ? (
                              <div className="tab-card-text">
                                {item.prompt}
                              </div>
                            ) : item.isAIGenerated ? (
                              <>
                                {item.prompt && (
                                  <div className="item-prompt">
                                    {item.prompt}
                                  </div>
                                )}
                                <div className="tab-card-text">
                                  {item.text}
                                </div>
                              </>
                            ) : (
                              <div className="tab-card-text">{item.text}</div>
                            )}
                          </>
                        )}
                        <div
                          className="tab-card-indicator"
                          style={{
                            backgroundColor: getTabColor(item.tabId || activeTab),
                            width: '4px',
                            height: '100%',
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            borderRadius: '4px 0 0 4px'
                          }}
                        />
                        <div className="tab-card-footer">
                          <span className="tab-card-time">
                            {new Date(item.createdAt).toLocaleString()}
                          </span>
                          <button
                            className="delete-tab-item-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTabItem(item, activeTab);
                            }}
                            title="Delete comment"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* Command Palette */}
        {showCommandPalette && (
          <div
            className="command-palette"
            style={{
              position: 'fixed',
              top: `${commandPosition.top}px`,
              left: `${commandPosition.left}px`
            }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="command-palette-header">
              <span className="selected-preview">{selectedText.substring(0, 50)}{selectedText.length > 50 ? '...' : ''}</span>
            </div>
            <form onSubmit={handleCommandSubmit} className="command-form">
              <input
                ref={commandInputRef}
                type="text"
                className="command-input"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder="Type command..."
                disabled={loadingAI}
                onMouseDown={(e) => e.stopPropagation()}
              />
              {loadingAI && (
                <div className="command-loading">
                  <div className="spinner-tiny"></div>
                  <span>Processing...</span>
                </div>
              )}
              {aiResponse && (
                <div className="command-response">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Added to tab!</span>
                </div>
              )}
            </form>
            <div className="command-hints">
              <div className="hint"><kbd>s/ai</kbd> Summary</div>
              <div className="hint"><kbd>d/ai</kbd> Definition</div>
              <div className="hint"><kbd>q/ai</kbd> Question</div>
              <div className="hint"><kbd>e/ai</kbd> Edit</div>
              <div className="hint"><kbd>Esc</kbd> Cancel</div>
            </div>
          </div>
        )}
      </div>

      {/* Custom Tab Modal */}
      {showCustomTabModal && (
        <div className="modal-overlay" onClick={() => setShowCustomTabModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Custom Tab</h2>
              <button className="modal-close-btn" onClick={() => setShowCustomTabModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="tabName">Tab Name</label>
                <input
                  id="tabName"
                  type="text"
                  className="modal-input"
                  placeholder="e.g., Important Quotes"
                  value={newTabName}
                  onChange={(e) => setNewTabName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="tabShortcut">Shortcut</label>
                <input
                  id="tabShortcut"
                  type="text"
                  className="modal-input"
                  placeholder="e.g., quotes"
                  value={newTabShortcut}
                  onChange={(e) => setNewTabShortcut(e.target.value)}
                />
                <span className="form-hint">Type this shortcut to add items to this tab</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-btn modal-btn-secondary" onClick={() => setShowCustomTabModal(false)}>
                Cancel
              </button>
              <button className="modal-btn modal-btn-primary" onClick={handleCreateCustomTab}>
                Create Tab
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentEditor;
