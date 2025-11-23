import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from '../components/AppHeader.jsx';
import { organizationApi } from '../services/api';

export default function OrganisationDashboard({ onLogout }) {
  const { user } = useAuth();
  const [org, setOrg] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setError('');
        if (!user?.id) { setLoading(false); return; }
        const [{ data: orgRes }, { data: memRes }] = await Promise.all([
          organizationApi.getOrganization(user.id),
          organizationApi.getAllMembers(user.id),
        ]);
        setOrg(orgRes?.data || null);
        setMembers(memRes?.members || []);
      } catch (e) {
        const msg = e?.response?.data?.error || 'Failed to load organization data.';
        setError(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader onLogout={onLogout} />
      <main>
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <div className="bg-white p-8 rounded-lg shadow-lg">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {org?.name || user?.name || 'Organization'} Dashboard
            </h1>
            <p className="text-gray-600">{org?.domain ? `Domain: ${org.domain}` : ''}</p>
            <p className="text-gray-600">Owner Email: {org?.email || user?.email}</p>

            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
            {loading ? (
              <p className="mt-6 text-sm text-gray-500">Loading organization data…</p>
            ) : (
              <div className="mt-8">
                <h2 className="text-xl font-semibold mb-3">Members ({members.length})</h2>
                <div className="border rounded-md divide-y">
                  {members.length ? (
                    members.map((m) => (
                      <div key={m._id} className="p-3 flex items-center justify-between text-sm">
                        <div>
                          <p className="font-medium">{m.name || m.email}</p>
                          <p className="text-gray-500">{m.email}</p>
                        </div>
                        <span className="text-gray-600">{m.role || 'member'}</span>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-sm text-gray-500">No members found.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}