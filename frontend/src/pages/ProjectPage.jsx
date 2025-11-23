import React, { useEffect, useState } from 'react';
import AppHeader from '../components/AppHeader.jsx';
import { projectApi, teamApi } from '../services/api';

export default function ProjectPage({ onLogout, navigateTo, selectedProjectId, setSelectedProjectId }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [datasets, setDatasets] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // Create project UI state
  const [teams, setTeams] = useState([]);
  const [adminTeams, setAdminTeams] = useState([]);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newProjectTeamId, setNewProjectTeamId] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [{ data: projRes }, { data: teamRes }] = await Promise.all([
          projectApi.getProjects(),
          teamApi.getTeams(),
        ]);
        const list = (projRes?.projects || []).map((p) => ({ _id: p._id, name: p.name, description: p.description, chats: p.chats || [] }));
        setProjects(list);
        setLoading(false);
        if (!selectedProjectId && list.length) setSelectedProjectId?.(list[0]._id);

        const teamsList = teamRes?.teams || [];
        setTeams(teamsList);
        // derive admin teams
        const userStr = localStorage.getItem('user');
        const me = userStr ? JSON.parse(userStr) : null;
        const myId = me?.id || me?._id;
        const admins = teamsList.filter(t => (t.members || []).some(m => (m.user === myId || m.user?._id === myId) && m.role === 'team_admin'));        
        setAdminTeams(admins);
        if (admins.length === 1) setNewProjectTeamId(admins[0]._id);
      } catch (e) {
        console.error('Failed to load projects/teams', e);
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return setDatasets([]);
    (async () => {
      try {
        const { data } = await projectApi.listDatasets(selectedProjectId);
        setDatasets(data?.datasets || []);
      } catch (e) {
        console.error('Failed to load datasets', e);
      }
    })();
  }, [selectedProjectId]);

  const handleUpload = async (evt) => {
    const files = evt.target.files;
    if (!files || !files.length || !selectedProjectId) return;
    setError('');
    setUploading(true);
    try {
      await projectApi.uploadDatasets(selectedProjectId, files);
      const { data } = await projectApi.listDatasets(selectedProjectId);
      setDatasets(data?.datasets || []);
    } catch (e) {
      const msg = e?.response?.data?.error || 'Upload failed.';
      setError(msg);
    } finally {
      setUploading(false);
      evt.target.value = '';
    }
  };

  const openCreateProject = () => {
    setCreateError('');
    setNewProjectName('');
    setNewProjectDesc('');
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
        const newEntry = { _id: proj._id, name: proj.name, description: proj.description, chats: [] };
        setProjects(prev => [newEntry, ...prev]);
        setSelectedProjectId?.(proj._id);
      }
      setShowCreateProject(false);
    } catch (e)
      {
      const msg = e?.response?.data?.error || 'Failed to create project.';
      setCreateError(msg);
    } finally {
      setCreatingProject(false);
    }
  };

  return (
    // UPDATED: Changed bg-gray-100 to bg-slate-50 for the light, clean background
    <div className="min-h-screen w-screen bg-slate-50">
      <AppHeader onLogout={onLogout} />
      <main>
        <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            {/* UPDATED: Made title larger and more modern */}
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Projects</h1>
            <div className="flex items-center gap-2">
              {/* UPDATED: Styled button to be more consistent */}
              <button className="px-3 py-2 text-sm rounded-md border border-gray-300 bg-white hover:bg-gray-50" onClick={() => navigateTo?.('userTeam')}>Team Details</button>
              {adminTeams.length > 0 && (
                <button onClick={openCreateProject} className="px-3 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700">Create Project</button>
              )}
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-gray-500">Loading projects…</p>
          ) : (
            // UPDATED: Increased gap for better spacing between cards
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* UPDATED: Turned the left column into a white card */}
              <div className="md:col-span-1 space-y-4 bg-white rounded-lg shadow-lg p-6">
                <div>
                  <label className="text-sm font-medium text-gray-700">Select project</label>
                  <select className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm mt-1" value={selectedProjectId || ''} onChange={(e) => setSelectedProjectId?.(e.target.value)}>
                    {projects.map((p) => (
                      <option key={p._id} value={p._id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button className="flex-1 px-3 py-2 text-sm rounded-md border border-gray-300 bg-white hover:bg-gray-50" onClick={() => navigateTo?.('userChat')} disabled={!selectedProjectId}>Open Chat</button>
                  <button className="flex-1 px-3 py-2 text-sm rounded-md border border-gray-300 bg-white hover:bg-gray-50" onClick={() => navigateTo?.('datasetSelect')} disabled={!selectedProjectId}>Select Datasets</button>
                </div>
                
                {/* --- START: REDESIGNED UPLOAD BOX --- */}
                {/* UPDATED: Removed the inner border wrapper and redesigned the upload component */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Datasets</h3>
                  <label
                    htmlFor="file-upload"
                    className="relative block border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors group"
                  >
                    {/* Icon Added */}
                    <svg className="mx-auto h-12 w-12 text-gray-400 group-hover:text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l-3 3m3-3l3 3m-3-6H7.5a4.5 4.5 0 00-4.5 4.5v3.75a4.5 4.5 0 004.5 4.5h9a4.5 4.5 0 004.5-4.5v-3.75a4.5 4.5 0 00-4.5-4.5H12z" />
                    </svg>
                    <p className="mt-2 text-sm text-gray-600 group-hover:text-blue-700">
                      <span className="font-semibold">Click to upload</span> or drag and drop
                    </p>
                    <p className="mt-1 text-xs text-gray-500">Upload dataset files</p>
                    {/* UPDATED: Input is now hidden and triggered by the label */}
                    <input id="file-upload" name="file-upload" type="file" multiple onChange={handleUpload} className="sr-only" />
                  </label>
                  {/* Moved status messages outside the label */}
                  {uploading && <p className="text-xs text-blue-600 mt-2">Uploading…</p>}
                  {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
                </div>
                {/* --- END: REDESIGNED UPLOAD BOX --- */}

              </div>
              
              {/* UPDATED: Turned the right column into a white card with consistent padding */}
              <div className="md:col-span-2 bg-white rounded-lg shadow-lg p-6">
                <div>
                  {/* UPDATED: Removed border and adjusted text */}
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Project datasets ({datasets.length})</h2>
                </div>
                {/* UPDATED: Removed padding (now on parent) and added pr-2 for scrollbar spacing */}
                <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-2">
                  {datasets.length ? (
                    datasets.map((d) => (
                      // UPDATED: Changed border to a light background for a cleaner look
                      <div key={d._id || d.url} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-md text-sm">
                        <span className="truncate" title={d.name}>{d.name}</span>
                        <span className="text-xs text-gray-500">{new Date(d.uploadedAt).toLocaleDateString?.() || ''}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">No datasets uploaded yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* --- MODAL --- */}
      {/* UPDATED: Minor style tweaks for consistency */}
      {showCreateProject && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-800">Create a new project</h3>
            <div className="mt-4 space-y-3">
              <div>
                {/* UPDATED: Label styling */}
                <label className="block text-sm font-medium text-gray-700 mb-1">Project name</label>
                <input type="text" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" placeholder="Enter project name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <textarea value={newProjectDesc} onChange={(e) => setNewProjectDesc(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" rows={3} placeholder="Short description" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                {adminTeams.length <= 1 ? (
                  <input type="text" readOnly className="w-full border border-gray-200 bg-gray-50 rounded-md px-3 py-2 text-sm" value={adminTeams[0]?.name || 'Your team'} />
                ) : (
                  <select className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" value={newProjectTeamId} onChange={(e) => setNewProjectTeamId(e.target.value)}>
                    <option value="">Select a team…</option>
                    {adminTeams.map(t => (<option key={t._id} value={t._id}>{t.name}</option>))}
                  </select>
                )}
              </div>
              {createError && <p className="text-sm text-red-600">{createError}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="px-4 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50" onClick={() => setShowCreateProject(false)} disabled={creatingProject}>Cancel</button>
              <button className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" onClick={confirmCreateProject} disabled={creatingProject}>{creatingProject ? 'Creating…' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}