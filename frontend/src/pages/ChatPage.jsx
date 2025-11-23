import React, { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import AppHeader from '../components/AppHeader.jsx';
import { chatApi, projectApi } from '../services/api';

/**
 * Mock Icon Components
 */
const IconSend = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L6 12Zm0 0h7.5" />
  </svg>
);

const IconBot = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
     <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 6.75h.008v.008H12v-.008Z" />
   </svg>
);

// FIXED: Using the correct "paper-clip" icon path
const IconPaperclip = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-6.364 0 4.5 4.5 0 010-6.364l8.311-8.31a.75.75 0 011.06 1.06l-8.31 8.31a3 3 0 000 4.243 3 3 0 004.242 0l8.31-8.31-.001.002z" />
  </svg>
);


/**
 * Mock API Object
 */
const mockApi = (data, delay = 300) => new Promise((resolve) => setTimeout(() => resolve({ data }), delay));


// ----------------------------------------------------------------------
// CHATPAGE COMPONENT
// ----------------------------------------------------------------------

export default function ChatPage({ onLogout, navigateTo, selectedProjectId, setSelectedProjectId }) {
  const [projects, setProjects] = useState([]);
  const [projectChats, setProjectChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [attachFiles, setAttachFiles] = useState([]);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [modalDatasets, setModalDatasets] = useState([]);
  const [modalSelectedIds, setModalSelectedIds] = useState([]);
  const [modalUploading, setModalUploading] = useState(false);
  const [modalError, setModalError] = useState('');
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const modalFileInputRef = useRef(null); // Ref for modal file input

  // Add this helper function somewhere in your file
function formatBotMessage(markdownText) {
  if (!markdownText) return ''; // Return empty string if text is null or undefined
  let html = markdownText;
  html = html.replaceAll(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replaceAll(/\*([^*]+)\*/g, '<strong>$1</strong>');
  html = html.replaceAll('\n', '<br>');
  html = html.replaceAll(/-\s(.*?)(<br>|$)/g, '<li>$1</li>');

  return html;
}

  // Register Chart.js globally once
  useEffect(() => {
    try { Chart.register(...registerables); } catch (_) {}
  }, []);

  function ChartBubble({ config }) {
    const canvasRef = useRef(null);
    const chartInstanceRef = useRef(null);
    useEffect(() => {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      // Destroy previous instance if re-rendering
      if (chartInstanceRef.current) {
        try { chartInstanceRef.current.destroy(); } catch (_) {}
        chartInstanceRef.current = null;
      }
      try {
        chartInstanceRef.current = new Chart(ctx, config);
      } catch (e) {
        console.error('Chart render error', e);
      }
      return () => {
        if (chartInstanceRef.current) {
          try { chartInstanceRef.current.destroy(); } catch (_) {}
          chartInstanceRef.current = null;
        }
      };
    }, [config]);
    return (
      <div className="bg-white text-gray-800 border border-gray-200 rounded-2xl rounded-bl-none p-3">
        <canvas ref={canvasRef} style={{ width: '100%', height: 260 }} />
      </div>
    );
  }

  // Load projects on mount
  useEffect(() => { 
    (async () => {
      try {
        const { data } = await projectApi.getProjects();
        const list = (data?.projects || []).map((p) => ({
          _id: p._id,
          name: p.name,
          chats: p.chats || [],
        }));
        setProjects(list);
        // Initialize selected project
        if (!selectedProjectId && list.length) {
          setSelectedProjectId?.(list[0]._id);
        }
      } catch (e) {
        console.error('Failed to load projects', e);
      }
    })();
  }, []);

  // Load chats when project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    (async () => {
      try {
        const { data } = await projectApi.getProject(selectedProjectId);
        const chats = data?.project?.chats || [];
        setProjectChats(chats);
        setActiveChat(null);
        setMessages([]);
      } catch (e) {
        console.error('Failed to load project', e);
      }
    })();
  }, [selectedProjectId]);

  // Scroll to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const openNewChat = async () => {
    if (!selectedProjectId) return;
    try {
      const { data } = await projectApi.listDatasets(selectedProjectId);
      setModalDatasets(data?.datasets || []);
      setModalSelectedIds([]);
      setModalError('');
      setShowNewChatModal(true);
    } catch (e) {
      console.error('Failed to load datasets for new chat', e);
      setModalDatasets([]);
      setModalSelectedIds([]);
      setShowNewChatModal(true);
    }
  };

  const handleModalUpload = async (evt) => {
    const files = evt.target.files;
    if (!files || !files.length || !selectedProjectId) return;
    setModalError('');
    setModalUploading(true);
    try {
      // You might want to display file names here before uploading
      await projectApi.uploadDatasets(selectedProjectId, files);
      const { data } = await projectApi.listDatasets(selectedProjectId);
      setModalDatasets(data?.datasets || []);
    } catch (e) {
      const msg = e?.response?.data?.error || 'Upload failed.';
      setModalError(msg);
    } finally {
      setModalUploading(false);
      // Reset file input
      if (modalFileInputRef.current) modalFileInputRef.current.value = '';
    }
  };

  const confirmCreateChat = async () => {
    if (!selectedProjectId) return;
    try {
      const { data } = await chatApi.createEmptyChat(selectedProjectId);
      const chat = data?.chat;
      if (chat?._id) {
        // Persist selected datasets for this chat only
        const key = `selectedDatasets:${chat._id}`;
        localStorage.setItem(key, JSON.stringify(modalSelectedIds));
        setProjectChats((prev) => [...prev, chat]);
        setActiveChat(chat);
        setMessages([{ from: 'bot', text: 'New chat created. Ask your question to begin.' }]);
      }
    } catch (e) {
      console.error('Failed to create chat', e);
    } finally {
      setShowNewChatModal(false);
    }
  };

  const openChat = async (chat) => {
    setActiveChat(chat);
    try {
      const { data } = await chatApi.getChatHistory(selectedProjectId, chat._id);
      const msgs = (data?.chat?.messages || []).flatMap((m) => {
        if (m.sender === 'chatbot') {
          try {
            // The backend saves the raw JSON analysis in content
            const analysis = JSON.parse(m.content);
            const parts = [];
            if (analysis.insights) {
              parts.push({ from: 'bot', type: 'text', text: analysis.insights });
            }
            if (analysis.chartjs) {
              parts.push({ from: 'bot', type: 'chart', chart: analysis.chartjs });
            }
            if (analysis.error) {
              parts.push({ from: 'bot', type: 'text', text: `Error: ${analysis.error}` });
            }
            return parts.length ? parts : [{ from: 'bot', type: 'text', text: 'No content.' }];
          } catch (e) {
            // Fallback for legacy plain text messages
            return [{ from: 'bot', type: 'text', text: m.content || '' }];
          }
        }
        return [{ from: 'user', text: m.content || '' }];
      });
      setMessages(msgs);
    } catch (e) {
      console.error('Failed to load chat history', e);
      setMessages([]);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!selectedProjectId || !activeChat?._id) return;
    const typed = input.trim();
    const hasFiles = (attachFiles && attachFiles.length > 0);
    // Retrieve dataset selection stored for this chat
    const dsKey = `selectedDatasets:${activeChat._id}`;
    let selectedDatasetIds = [];
    try {
      const stored = localStorage.getItem(dsKey);
      if (stored) selectedDatasetIds = JSON.parse(stored);
    } catch (_) {}
    const hasSelection = Array.isArray(selectedDatasetIds) && selectedDatasetIds.length > 0;

    // If user didn't type anything but has datasets or files, auto-use "Analyze these"
    if (!typed && !(hasSelection || hasFiles)) {
      // No datasets selected and no files => no answer per new flow
      return;
    }
    const currentText = typed || 'Analyze these';
    setInput('');
    // Show the user's message (including the auto text)
    setMessages((prev) => [...prev, { from: 'user', text: currentText }]);

    try {
      await chatApi.sendUserMessage({
        projectId: selectedProjectId,
        chatId: activeChat._id,
        content: currentText,
        files: (attachFiles || []),
        selectedDatasetIds,
      });
      // During chat, if the user sent a message (typed or auto 'Analyze these'), always ask AI to reply
      const { data } = await chatApi.aiReply({ projectId: selectedProjectId, chatId: activeChat._id, content: currentText });
      
      const additions = [];
      // Handle new AnalysisResponse format from pipeline
      if (data) {
        if (data.insights) {
          additions.push({ from: 'bot', type: 'text', text: data.insights });
        }
        if (data.chartjs) {
          additions.push({ from: 'bot', type: 'chart', chart: data.chartjs });
        }
        if (data.error) {
          additions.push({ from: 'bot', type: 'text', text: `Error: ${data.error}` });
        }
      }
      
      if (additions.length) setMessages((prev) => [...prev, ...additions]);
    } catch (e) {
      console.error('Message send failed', e);
      setMessages((prev) => [...prev, { from: 'bot', text: 'There was an error processing your message.' }]);
    }
    setAttachFiles([]);
    // Reset the file input so selecting the same file again triggers onChange
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="h-screen bg-gray-100 flex flex-col overflow-hidden">
      <AppHeader onLogout={onLogout} />
      <div className="flex flex-1 overflow-hidden w-screen h-[calc(100vh-65px)] bg-gray-100">
        {/* Sidebar (ChatGPT-like) */}
        <div className="w-72 bg-white border-r border-gray-200 flex flex-col overflow-hidden p-3">
          <div className="mb-3">
            <label className="text-xs text-gray-600">Project</label>
            <select
              value={selectedProjectId || ''}
              onChange={(e) => setSelectedProjectId?.(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
            >
              {projects.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={openNewChat}
            className="mb-3 w-full text-left px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
          >
            + New chat
          </button>

          {/* FIXED HERE: Changed h-0 to min-h-0 
            This allows the flex item to shrink below its content size, enabling overflow-y-auto to work.
          */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-gray-300 hover:scrollbar-thumb-gray-400 min-h-0">
            {projectChats?.length ? (
              projectChats.map((c, idx) => (
                <button
                  key={c._id || idx}
                  onClick={() => openChat(c)}
                  className={`w-full text-left px-3 py-2 rounded text-sm ${activeChat?._id === c._id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}`}
                >
                  {c.title || `Chat ${idx + 1}`}
                </button>
              ))
            ) : (
              <p className="text-xs text-gray-500">No chats yet.</p>
            )}
          </div>

          <div className="pt-3 mt-3 border-t border-gray-200 space-y-2">
            <button
              className="w-full text-left px-3 py-2 rounded border text-sm hover:bg-gray-50"
              onClick={() => navigateTo?.('userProjects')}
            >
              ← Projects
            </button>
            {/* Dataset selection is only offered at new chat creation time */}
            <button
              className="w-full text-left px-3 py-2 rounded border text-sm hover:bg-gray-50 disabled:opacity-50"
              onClick={async () => {
                if (!activeChat?._id || !selectedProjectId) return;
                const current = projectChats.find((c) => c._id === activeChat._id);
                const proposed = window.prompt('Rename chat', current?.title || '');
                const title = (proposed || '').trim();
                if (!title) return;
                try {
                  const { data } = await chatApi.renameChat({ projectId: selectedProjectId, chatId: activeChat._id, title });
                  const updated = data?.chat;
                  if (updated?._id) {
                    setProjectChats((prev) => prev.map((c) => (c._id === updated._id ? { ...c, title: updated.title } : c)));
                    setActiveChat((prev) => (prev && prev._id === updated._id ? { ...prev, title: updated.title } : prev));
                  }
                } catch (e) {
                  console.error('Rename failed', e);
                }
              }}
              disabled={!activeChat?._id}
            >
              Rename current chat
            </button>
          </div>
        </div>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 w-full">
          <div className="flex-1 overflow-y-auto p-6">
            {/* FIXED: Removed max-w-3xl from this container */}
            <div className="mx-auto space-y-4">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className="flex items-start gap-2 max-w-[80%]">
                    {msg.from === 'bot' && (
                      <div className="bg-gray-200 p-2 rounded-full flex-shrink-0">
                        <IconBot className="h-5 w-5 text-gray-600" />
                      </div>
                    )}
                    {msg.type === 'chart' ? (
                      <ChartBubble config={msg.chart} />
                    ) : (
                      <div className={`${msg.from === 'user' ? 'bg-blue-600 text-white rounded-2xl rounded-br-none shadow-sm' 
                      : 'bg-white text-gray-800 border border-gray-200 rounded-2xl rounded-bl-none shadow-sm'} py-3 px-4 text-[15px] leading-relaxed`} 

                      style={{ wordBreak: 'break-word' }}>
                      {msg.from === 'bot' ? (
                        // For bot messages, render the formatted HTML
                        <div className="ml-2" dangerouslySetInnerHTML={{ __html: formatBotMessage(msg.text) }} />
                      ) : (
                        // For user messages, render plain text as before
                        msg.text
                      )}
                    </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </div>
          <form onSubmit={handleSend} className="border-t border-gray-200 p-4">
            {/* FIXED: Removed max-w-3xl from this container */}
            <div className="mx-auto flex gap-2 items-center">
              
              {/* 1. New File Attach Button */}
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()}
                className="p-3 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                title="Attach files (chat-only; not saved to project)"
              >
                {/* FIXED: Added flex-shrink-0 to prevent icon distortion */}
                <IconPaperclip className="h-5 w-5 flex-shrink-0" />
              </button>
              
              {/* 2. Hidden File Input */}
              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={(e) => setAttachFiles(Array.from(e.target.files || []))}
                className="hidden" // Input is now hidden
              />

              {/* 3. Text Input */}
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Send a message..."
                className="flex-1 border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
              
              {/* 4. Send Button */}
              <button type="submit" className="bg-blue-600 text-white rounded-lg px-5 py-3 flex items-center justify-center font-semibold hover:bg-blue-700">
                <IconSend className="h-5 w-5" />
              </button>
            </div>
            {/* Optional: Display attached file names */}
            {attachFiles.length > 0 && (
              // FIXED: Removed max-w-3xl from this container
              <div className="mx-auto mt-2 text-xs text-gray-500 px-2">
                <strong>Attached:</strong> {attachFiles.map(f => f.name).join(', ')}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* New Chat modal: upload/select datasets only at creation time */}
      {showNewChatModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold text-gray-800">Start a new chat</h3>
            <p className="text-xs text-gray-500 mb-3">Optionally upload datasets to the project and select which ones this chat should use.</p>

            {/* --- MODAL FILE UPLOAD (STYLED) --- */}
            <div className="border rounded p-3 mb-3">
              <p className="text-sm font-medium text-gray-700">Upload datasets to project</p>
              
              {/* Hidden file input */}
              <input
                type="file"
                multiple
                onChange={handleModalUpload}
                className="hidden"
                ref={modalFileInputRef}
              />
              {/* Styled button to trigger file input */}
              <button
                type="button"
                onClick={() => modalFileInputRef.current?.click()}
                className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded border text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <IconPaperclip className="h-4 w-4 flex-shrink-0" />
                <span>Upload Files</span>
              </button>

              {modalUploading && <p className="text-xs text-blue-600 mt-2">Uploading…</p>}
              {modalError && <p className="text-xs text-red-600 mt-2">{modalError}</p>}
            </div>
            {/* --- END STYLED UPLOAD --- */}


            <div className="border rounded p-3 mb-3 max-h-60 overflow-y-auto">
              <p className="text-sm font-medium text-gray-700 mb-2">Select datasets for this chat</p>
              {modalDatasets.length ? (
                modalDatasets.map((d) => (
                  <label key={d._id || d.url} className="flex items-center gap-2 text-sm py-1">
                    <input
                      type="checkbox"
                      checked={modalSelectedIds.includes(d._id)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setModalSelectedIds((prev) =>
                          checked ? [...prev, d._id] : prev.filter((id) => id !== d._id)
                        );
                      }}
                    />
                    <span className="truncate" title={d.name}>{d.name}</span>
                  </label>
                ))
              ) : (
                <p className="text-xs text-gray-500">No datasets uploaded yet.</p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button className="px-4 py-2 text-sm rounded border hover:bg-gray-50" onClick={() => setShowNewChatModal(false)}>Cancel</button>
              <button className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700" onClick={confirmCreateChat} disabled={!selectedProjectId}>Create chat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}