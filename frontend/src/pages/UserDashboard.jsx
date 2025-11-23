import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from '../components/AppHeader.jsx';
import { 
  IconUsers, 
  IconFolder, 
  IconUploadCloud, 
  IconFile, 
  IconSend, 
  IconBot,
  IconTrash
} from '../components/Icons.jsx'; // Make sure to import all new icons
import { projectApi, chatApi, teamApi, userApi } from '../services/api';

// --- Main Dashboard Component ---
export default function UserDashboard({ onLogout }) {
  const [activeTab, setActiveTab] = useState('projects');
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader onLogout={onLogout} />
      <main>
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          
          {/* Welcome Header */}
          <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome, {user?.name || user?.email}!
            </h1>
            <p className="text-lg text-gray-600">
              This is your personal <span className="font-semibold text-blue-600">User Dashboard</span>.
            </p>
          </div>

          {/* Tab Navigation */}
          <div className="mb-6">
            <nav className="flex space-x-4" aria-label="Tabs">
              <TabButton
                label="Projects & Chat"
                icon={<IconFolder />}
                isActive={activeTab === 'projects'}
                onClick={() => setActiveTab('projects')}
              />
              <TabButton
                label="Team Details"
                icon={<IconUsers />}
                isActive={activeTab === 'team'}
                onClick={() => setActiveTab('team')}
              />
            </nav>
          </div>

          {/* Tab Content */}
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            {activeTab === 'projects' && <ProjectsTab />}
            {activeTab === 'team' && <TeamTab />}
          </div>
          
        </div>
      </main>
    </div>
  );
}

// --- Tab Button Component ---
function TabButton({ label, icon, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`
        ${isActive ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-800'}
        flex items-center px-4 py-3 font-medium text-sm rounded-lg shadow-sm transition-all duration-200
      `}
    >
      {React.cloneElement(icon, { className: 'h-5 w-5 mr-2' })}
      {label}
    </button>
  );
}

// --- Projects & Chat Tab ---
function ProjectsTab() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [projectDatasets, setProjectDatasets] = useState([]);
  const [uploadingDatasets, setUploadingDatasets] = useState(false);
  const [datasetError, setDatasetError] = useState('');
  const [showDatasetsDropdown, setShowDatasetsDropdown] = useState(false);

  const [showDatasetPicker, setShowDatasetPicker] = useState(false);
  const [selectedDatasetIds, setSelectedDatasetIds] = useState([]);

  const [projectChats, setProjectChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null); // { _id }
  const [messages, setMessages] = useState([]); // { from: 'user'|'bot', text }
  const [input, setInput] = useState('');
  const chatEndRef = useRef(null);

  // Create project UI state
  const [teams, setTeams] = useState([]);
  const [adminTeams, setAdminTeams] = useState([]);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newProjectTeamId, setNewProjectTeamId] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [createError, setCreateError] = useState('');

  // Load projects on mount
  useEffect(() => {
    (async () => {
      try {
        const { data } = await projectApi.getProjects();
        const list = (data?.projects || []).map((p) => ({
          _id: p._id,
          name: p.name,
          description: p.description,
          teamName: p.team?.name,
          chats: p.chats || [],
        }));
        setProjects(list);
        setLoadingProjects(false);
      } catch (e) {
        console.error('Failed to load projects', e);
        setLoadingProjects(false);
      }
    })();
  }, []);

  // Load user's teams and derive teams where user is team_admin
  useEffect(() => {
    (async () => {
      try {
        const { data } = await teamApi.getTeams();
        const list = data?.teams || [];
        setTeams(list);
        const myId = user?.id || user?._id;
        const admins = list.filter(t => (t.members || []).some(m => (m.user === myId || m.user?._id === myId) && m.role === 'team_admin'));
        setAdminTeams(admins);
        if (admins.length === 1) {
          setNewProjectTeamId(admins[0]._id);
        }
      } catch (e) {
        console.error('Failed to load teams for project creation', e);
      }
    })();
  }, [user?.id, user?._id]);

  // Auto-select first project
  useEffect(() => {
    if (!selectedProjectId && projects.length) {
      setSelectedProjectId(projects[0]._id);
    }
  }, [projects, selectedProjectId]);

  // Load datasets and chats when project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    (async () => {
      try {
        const [dsRes, projRes] = await Promise.all([
          projectApi.listDatasets(selectedProjectId),
          projectApi.getProject(selectedProjectId),
        ]);
        const datasets = dsRes?.data?.datasets || [];
        setProjectDatasets(datasets);
        const chats = projRes?.data?.project?.chats || [];
        setProjectChats(chats);
      } catch (e) {
        console.error('Failed to load project data', e);
      }
    })();
  }, [selectedProjectId]);

  // Scroll to bottom of chat on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleDatasetUpload = async (evt) => {
    const files = evt.target.files;
    if (!files || !files.length || !selectedProjectId) return;
    setDatasetError('');
    setUploadingDatasets(true);
    try {
      await projectApi.uploadDatasets(selectedProjectId, files);
      // Reload datasets
      const { data } = await projectApi.listDatasets(selectedProjectId);
      setProjectDatasets(data?.datasets || []);
    } catch (e) {
  console.error('Upload failed', e);
  const msg = e?.response?.data?.error || 'Upload failed.';
      setDatasetError(msg);
    } finally {
      setUploadingDatasets(false);
      evt.target.value = '';
    }
  };

  const openStartChat = () => {
    if (!selectedProjectId) return;
    // Reset picker selection
    setSelectedDatasetIds([]);
    setShowDatasetPicker(true);
  };

  const openCreateProject = () => {
    setCreateError('');
    setNewProjectName('');
    setNewProjectDesc('');
    // Preserve selected team if already set (from single-admin-team auto-select)
    setShowCreateProject(true);
  };

  const confirmCreateProject = async () => {
    if (!newProjectName.trim() || !newProjectTeamId) {
      setCreateError('Project name and team are required.');
      return;
    }
    try {
      setCreatingProject(true);
      setCreateError('');
      const payload = { name: newProjectName.trim(), description: newProjectDesc.trim(), team: newProjectTeamId };
      const { data } = await projectApi.createProject(payload);
      const proj = data?.project;
      if (proj?._id) {
        // Update local projects list and select it
        const newEntry = {
          _id: proj._id,
          name: proj.name,
          description: proj.description,
          teamName: (teams.find(t => t._id === newProjectTeamId)?.name) || '',
          chats: [],
        };
        setProjects(prev => [newEntry, ...prev]);
        setSelectedProjectId(proj._id);
      }
      setShowCreateProject(false);
    } catch (e) {
      const msg = e?.response?.data?.error || 'Failed to create project.';
      setCreateError(msg);
    } finally {
      setCreatingProject(false);
    }
  };

  const confirmStartChat = async () => {
    if (!selectedProjectId) return;
    try {
      const { data } = await chatApi.createEmptyChat(selectedProjectId);
      const chat = data?.chat;
      if (chat?._id) {
        setActiveChat(chat);
        // reflect new chat in list
        setProjectChats((prev) => [...prev, chat]);
        setMessages([{ from: 'bot', text: 'Chat created. Ask anything about your selected datasets.' }]);
      }
    } catch (e) {
      console.error('Failed to create chat', e);
    } finally {
      setShowDatasetPicker(false);
    }
  };

  const loadChatHistory = async (projectId, chatId) => {
    try {
      const { data } = await chatApi.getChatHistory(projectId, chatId);
      const chat = data?.chat;
      const msgs = (chat?.messages || []).flatMap((m) => {
        if (m.sender === 'chatbot') {
          try {
            const analysis = JSON.parse(m.content);
            const parts = [];
            if (analysis.insights) parts.push({ from: 'bot', text: analysis.insights });
            if (analysis.error) parts.push({ from: 'bot', text: `Error: ${analysis.error}` });
            return parts.length ? parts : [{ from: 'bot', text: 'No content.' }];
          } catch (e) {
            return [{ from: 'bot', text: m.content || '' }];
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

  const handleSelectChat = async (chat) => {
    setActiveChat(chat);
    if (selectedProjectId && chat?._id) {
      await loadChatHistory(selectedProjectId, chat._id);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !selectedProjectId || !activeChat?._id) return;

    const userMessage = { from: 'user', text: input };
    setMessages((prev) => [...prev, userMessage]);
    const currentText = input;
    setInput('');

    try {
      // Send user message with selected datasets (include on every message to keep context)
      const { data: sendRes } = await chatApi.sendUserMessage({
        projectId: selectedProjectId,
        chatId: activeChat._id,
        content: currentText,
        files: [],
        selectedDatasetIds,
      });

      // If backend returns a chatId (safety), ensure activeChat is synced
      if (sendRes?.chatId && sendRes.chatId !== activeChat._id) {
        setActiveChat((prev) => ({ ...(prev || {}), _id: sendRes.chatId }));
      }

      // Ask AI to reply
      const { data } = await chatApi.aiReply({ projectId: selectedProjectId, chatId: activeChat._id, content: currentText });
      
      const additions = [];
      if (data) {
        if (data.insights) additions.push({ from: 'bot', text: data.insights });
        if (data.error) additions.push({ from: 'bot', text: `Error: ${data.error}` });
      }
      
      if (additions.length) setMessages((prev) => [...prev, ...additions]);
    } catch (e) {
      console.error('Message send failed', e);
      setMessages((prev) => [...prev, { from: 'bot', text: 'There was an error processing your message.' }]);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 h-[75vh]">
      {/* Left: Projects, Datasets, Chats */}
      <div className="p-6 border-r border-gray-200 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Projects</h2>
          {adminTeams.length > 0 && (
            <button
              onClick={openCreateProject}
              className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Create Project
            </button>
          )}
        </div>

        {loadingProjects ? (
          <p className="text-sm text-gray-500">Loading projects…</p>
        ) : (
          <div className="space-y-4 overflow-y-auto pr-2">
            {/* Project selector */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Select project:</label>
              <select
                className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                value={selectedProjectId || ''}
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Dataset upload */}
            <div className="mt-2">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Datasets</h3>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                <IconUploadCloud className="h-8 w-8 mx-auto text-gray-400" />
                <p className="mt-2 text-xs text-gray-600">Upload dataset files for this project</p>
                <div className="mt-2">
                  <input type="file" multiple onChange={handleDatasetUpload} />
                </div>
                {uploadingDatasets && (
                  <p className="text-xs text-blue-600 mt-2">Uploading…</p>
                )}
                {datasetError && (
                  <p className="text-xs text-red-600 mt-2">{datasetError}</p>
                )}
              </div>

              <div className="mt-3 relative">
                <button
                  type="button"
                  onClick={() => setShowDatasetsDropdown(v => !v)}
                  className="inline-flex items-center justify-between w-full border border-gray-300 bg-white px-3 py-2 rounded-md text-sm hover:bg-gray-50"
                >
                  <span>Datasets {projectDatasets?.length ? `(${projectDatasets.length})` : ''}</span>
                  <span className="ml-2">▾</span>
                </button>
                {showDatasetsDropdown && (
                  <div className="absolute left-0 right-0 mt-2 bg-white border border-gray-200 rounded-md shadow-lg z-20 max-h-48 overflow-y-auto">
                    {projectDatasets?.length ? (
                      projectDatasets.map((d) => (
                        <div key={d._id || d.url} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                          <div className="flex items-center min-w-0">
                            <IconFile className="h-4 w-4 text-blue-500 mr-2" />
                            <p className="text-xs text-gray-700 truncate" title={d.name}>{d.name}</p>
                          </div>
                          <span className="text-[10px] text-gray-400">{new Date(d.uploadedAt).toLocaleDateString?.() || ''}</span>
                        </div>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-xs text-gray-500">No datasets uploaded yet.</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Start Chat */}
            <div className="mt-4">
              <button
                onClick={openStartChat}
                className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-semibold hover:bg-blue-700"
              >
                Start Chat
              </button>
            </div>

            {/* Chats list */}
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Chats</h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {projectChats?.length ? (
                  projectChats.map((c, idx) => (
                    <button
                      key={c._id || idx}
                      className={`w-full text-left px-3 py-2 border rounded text-sm ${activeChat?._id === c._id ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                      onClick={() => handleSelectChat(c)}
                    >
                      Chat {idx + 1}
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-gray-500">No chats created yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right: Chat panel */}
      <div className="p-6 flex flex-col h-full">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Chat with your Data</h2>

        {!activeChat ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-500 bg-gray-50 rounded-md">
            Select or start a chat to begin.
          </div>
        ) : (
          <>
            <div className="flex-grow bg-gray-50 rounded-lg p-4 space-y-4 overflow-y-auto mb-4">
              {messages.map((msg, index) => (
                <div key={index} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className="flex items-start gap-2 max-w-xs md:max-w-md">
                    {msg.from === 'bot' && (
                      <div className="bg-gray-200 p-2 rounded-full flex-shrink-0">
                        <IconBot className="h-5 w-5 text-gray-600" />
                      </div>
                    )}
                    <div
                      className={`
                        py-2 px-4 rounded-xl text-sm
                        ${msg.from === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'}
                      `}
                      style={{ wordBreak: 'break-word' }}
                    >
                      {msg.text}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about your selected datasets…"
                className="flex-grow border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
              <button
                type="submit"
                className="bg-blue-600 text-white rounded-lg px-5 py-3 flex items-center justify-center font-semibold hover:bg-blue-700 transition-colors"
              >
                <IconSend className="h-5 w-5" />
              </button>
            </form>
          </>
        )}
      </div>

      {/* Dataset selection modal */}
      {showDatasetPicker && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-800">Select datasets for this chat</h3>
            <p className="text-xs text-gray-500 mb-3">Choose one or more datasets that the assistant should use.</p>
            <div className="max-h-60 overflow-y-auto border rounded p-3 space-y-2">
              {projectDatasets?.length ? (
                projectDatasets.map((d) => (
                  <label key={d._id || d.url} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedDatasetIds.includes(d._id)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelectedDatasetIds((prev) =>
                          checked ? [...prev, d._id] : prev.filter((id) => id !== d._id)
                        );
                      }}
                    />
                    <span className="truncate" title={d.name}>{d.name}</span>
                  </label>
                ))
              ) : (
                <p className="text-xs text-gray-500">No datasets available for this project. You can still start a chat.</p>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="px-4 py-2 text-sm rounded border border-gray-300 hover:bg-gray-50"
                onClick={() => setShowDatasetPicker(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                onClick={confirmStartChat}
              >
                Start Chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Project modal */}
      {showCreateProject && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-800">Create a new project</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Project name</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="Enter project name"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description (optional)</label>
                <textarea
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  rows={3}
                  placeholder="Short description"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Team</label>
                {adminTeams.length <= 1 ? (
                  <input
                    type="text"
                    readOnly
                    className="w-full border border-gray-200 bg-gray-50 rounded-md px-3 py-2 text-sm"
                    value={adminTeams[0]?.name || 'Your team'}
                  />
                ) : (
                  <select
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    value={newProjectTeamId}
                    onChange={(e) => setNewProjectTeamId(e.target.value)}
                  >
                    <option value="">Select a team…</option>
                    {adminTeams.map(t => (
                      <option key={t._id} value={t._id}>{t.name}</option>
                    ))}
                  </select>
                )}
              </div>
              {createError && <p className="text-sm text-red-600">{createError}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="px-4 py-2 text-sm rounded border border-gray-300 hover:bg-gray-50"
                onClick={() => setShowCreateProject(false)}
                disabled={creatingProject}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={confirmCreateProject}
                disabled={creatingProject}
              >
                {creatingProject ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Team Tab ---
function TeamTab() {
  const { user } = useAuth();
  const [teamId, setTeamId] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isTeamAdmin, setIsTeamAdmin] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState(null); // userId whose menu is open
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  // Add member UI state
  const [orgUsers, setOrgUsers] = useState([]);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');

  // Load first team and its members
  useEffect(() => {
    (async () => {
      try {
        setError('');
        const { data: teamsRes } = await teamApi.getTeams();
        const firstTeamId = teamsRes?.teams?.[0]?._id;
        if (!firstTeamId) {
          setTeamMembers([]);
          setLoading(false);
          return;
        }
        setTeamId(firstTeamId);

        const { data: teamRes } = await teamApi.getTeam(firstTeamId);
        const members = (teamRes?.team?.members || []).map((m) => ({
          id: m?.user?._id || m?.user,
          name: m?.user?.name || 'Unnamed',
          role: m?.role || 'member',
          email: m?.user?.email || '',
        }));
        setTeamMembers(members);
        // Determine if current user is team admin
        const me = members.find((mm) => mm.id === (user?.id || user?._id));
        setIsTeamAdmin(!!(me && me.role === 'team_admin'));

        // Load org users for add-member dropdown
        try {
          const { data: usersRes } = await userApi.getUsers();
          const list = (usersRes?.users || []).map(u => ({
            id: u._id || u.id,
            name: u.name,
            email: u.email,
          }));
          setOrgUsers(list);
        } catch (err) {
          console.error('Failed to load organization users', err);
        }
      } catch (e) {
        console.error('Failed to load team members', e);
        setError('Failed to load team members.');
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  const refreshTeam = async (id = teamId) => {
    if (!id) return;
    try {
      const { data: teamRes } = await teamApi.getTeam(id);
      const members = (teamRes?.team?.members || []).map((m) => ({
        id: m?.user?._id || m?.user,
        name: m?.user?.name || 'Unnamed',
        role: m?.role || 'member',
        email: m?.user?.email || '',
      }));
      setTeamMembers(members);
      const me = members.find((mm) => mm.id === (user?.id || user?._id));
      setIsTeamAdmin(!!(me && me.role === 'team_admin'));
    } catch (e) {
      console.error('Failed to refresh team', e);
    }
  };

  const handleRemove = async (memberId) => {
    if (!teamId) return;
    if (!window.confirm('Remove this member from the team?')) return;
    setActionBusy(true);
    setActionError('');
    try {
      await teamApi.removeMember(teamId, { userId: memberId });
      // Update local state
      setTeamMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (e) {
      const msg = e?.response?.data?.error || 'Failed to remove member.';
      setActionError(msg);
    } finally {
      setActionBusy(false);
      setMenuOpenFor(null);
    }
  };

  const handleMakeAdmin = async (memberId) => {
    if (!teamId) return;
    if (!window.confirm('Make this member the team admin?')) return;
    setActionBusy(true);
    setActionError('');
    try {
      await teamApi.changeAdmin(teamId, { newAdminId: memberId });
      // Update roles locally: this member becomes team_admin, others become member
      setTeamMembers((prev) => prev.map((m) => ({
        ...m,
        role: m.id === memberId ? 'team_admin' : 'member',
      })));
    } catch (e) {
      const msg = e?.response?.data?.error || 'Failed to change admin.';
      setActionError(msg);
    } finally {
      setActionBusy(false);
      setMenuOpenFor(null);
    }
  };

  const handleAddMemberConfirm = async () => {
    if (!teamId || !selectedUserId) return;
    setActionBusy(true);
    setActionError('');
    try {
      const { data } = await teamApi.addMember(teamId, { userId: selectedUserId });
      // Prefer immediate UI update using selected org user's details
      const selectedUser = orgUsers.find((u) => (u.id) === selectedUserId);
      if (selectedUser) {
        setTeamMembers((prev) => {
          // avoid duplicates if already present
          if (prev.some((m) => m.id === selectedUserId)) return prev;
          return [
            ...prev,
            {
              id: selectedUserId,
              name: selectedUser.name || selectedUser.email || 'Member',
              role: 'member',
              email: selectedUser.email || '',
            },
          ];
        });
      } else {
        // Fallback to server refresh to get populated member info
        await refreshTeam();
      }
    } catch (e) {
      const msg = e?.response?.data?.error || 'Failed to add member. Ensure the user belongs to your organization.';
      setActionError(msg);
    } finally {
      setActionBusy(false);
      setShowAddPanel(false);
      setSelectedUserId('');
      setSearchTerm('');
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Team Members</h2>
        {isTeamAdmin && (
          <button
            onClick={() => setShowAddPanel((v) => !v)}
            className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={actionBusy || !teamId}
          >
            Add Member
          </button>
        )}
      </div>

      {isTeamAdmin && showAddPanel && (
        <div className="mb-4 p-4 border rounded-md bg-gray-50">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search users by email or name"
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <select
              className="border border-gray-300 rounded-md px-3 py-2 text-sm min-w-[220px]"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">Select user…</option>
              {orgUsers
                .filter((u) => {
                  const inTeam = teamMembers.some((m) => m.id === (u.id));
                  if (inTeam) return false;
                  if (!searchTerm) return true;
                  const q = searchTerm.toLowerCase();
                  return (
                    (u.email || '').toLowerCase().includes(q) ||
                    (u.name || '').toLowerCase().includes(q)
                  );
                })
                .slice(0, 20)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email} {u.name ? `(${u.name})` : ''}
                  </option>
                ))}
            </select>
            <button
              onClick={handleAddMemberConfirm}
              disabled={!selectedUserId || actionBusy}
              className="px-3 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading team members…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : teamMembers.length === 0 ? (
        <p className="text-sm text-gray-500">No team members found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                {isTeamAdmin && (
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {teamMembers.map((person) => (
                <tr key={person.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{person.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{person.role}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{person.email}</div>
                  </td>
                  {isTeamAdmin && (
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="relative inline-block text-left">
                        <button
                          className="px-2 py-1 rounded hover:bg-gray-100"
                          onClick={() => setMenuOpenFor((prev) => (prev === person.id ? null : person.id))}
                          title="Actions"
                        >
                          ☰
                        </button>
                        {menuOpenFor === person.id && (
                          <div className="absolute right-0 top-full mt-2 w-44 bg-white border border-gray-200 rounded shadow-md z-10 flex flex-col py-1">
                            <button
                              className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                              onClick={() => handleMakeAdmin(person.id)}
                              disabled={actionBusy || person.role === 'team_admin'}
                            >
                              Make admin
                            </button>
                            {/* Hide Remove for self if you are the only admin */}
                            {(() => {
                              const adminCount = teamMembers.filter((m) => m.role === 'team_admin').length;
                              const isSelf = (user?.id || user?._id) === person.id;
                              const hideRemove = isSelf && adminCount === 1;
                              if (hideRemove) return null;
                              return (
                                <button
                                  className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                                  onClick={() => handleRemove(person.id)}
                                  disabled={actionBusy}
                                >
                                  Remove from team
                                </button>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {actionError && (
            <p className="mt-3 text-sm text-red-600">{actionError}</p>
          )}
        </div>
      )}
    </div>
  );
}

// --- Team Tab ---
// Implemented above with admin actions and member management
