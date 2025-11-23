import React, { useEffect, useState } from 'react';
import AppHeader from '../components/AppHeader.jsx';
import { projectApi } from '../services/api';

// Simple Upload Icon (to match your visual style)
const IconUpload = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V3.75m0 0L6.75 9m5.25-5.25L17.25 9M3.75 20.25h16.5" />
  </svg>
);

export default function DatasetSelectionPage({ onLogout, navigateTo, selectedProjectId, setSelectedProjectId }) {
  const [projects, setProjects] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await projectApi.getProjects();
        const list = (data?.projects || []).map((p) => ({ _id: p._id, name: p.name }));
        setProjects(list);
        if (!selectedProjectId && list.length) setSelectedProjectId?.(list[0]._id);
      } catch (e) {
        console.error('Failed to load projects', e);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) { setDatasets([]); setSelected([]); return; }
    (async () => {
      try {
        const { data } = await projectApi.listDatasets(selectedProjectId);
        const ds = data?.datasets || [];
        setDatasets(ds);
        const dsKey = `selectedDatasets:${selectedProjectId}`;
        const stored = localStorage.getItem(dsKey);
        setSelected(stored ? JSON.parse(stored) : []);
      } catch (e) {
        console.error('Failed to load datasets', e);
      }
    })();
  }, [selectedProjectId]);

  const toggle = (id, checked) => {
    setSelected((prev) => checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id));
  };

  const saveSelection = () => {
    if (!selectedProjectId) return;
    localStorage.setItem(`selectedDatasets:${selectedProjectId}`, JSON.stringify(selected));
    navigateTo?.('userChat');
  };

  return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-blue-50 to-indigo-100x flex flex-col">
      <AppHeader onLogout={onLogout} />

      <main className="flex flex-col items-center justify-center flex-grow p-6">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-4xl p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">Select Datasets</h1>

          <div className="mb-6">
            <label className="block text-sm text-gray-600 mb-2">Select Project</label>
            <select
              value={selectedProjectId || ''}
              onChange={(e) => setSelectedProjectId?.(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none"
            >
              {projects.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center mb-8 bg-gray-50 hover:bg-gray-100 transition-all cursor-pointer">
            <IconUpload className="w-12 h-12 text-blue-500 mx-auto mb-3" />
            <p className="text-gray-600 text-sm">Upload dataset files for this project</p>
            <input type="file" multiple className="hidden" id="dataset-upload" />
            <label htmlFor="dataset-upload" className="mt-3 inline-block bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 cursor-pointer">
              Choose Files
            </label>
          </div>

          <div className="bg-gray-50 rounded-lg shadow-inner p-4 max-h-[50vh] overflow-y-auto">
            {datasets.length ? (
              datasets.map((d) => (
                <label key={d._id || d.url} className="flex items-center gap-2 text-sm border rounded p-2 mb-2 bg-white hover:bg-gray-100 transition-all">
                  <input type="checkbox" checked={selected.includes(d._id)} onChange={(e) => toggle(d._id, e.target.checked)} />
                  <span className="truncate" title={d.name}>{d.name}</span>
                </label>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">No datasets available for this project.</p>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              className="px-4 py-2 text-sm rounded border hover:bg-gray-100"
              onClick={() => navigateTo?.('userProjects')}
            >
              Back
            </button>
            <button
              className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
              onClick={saveSelection}
              disabled={!selectedProjectId}
            >
              Save & Continue
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
