import React, { useEffect, useState } from 'react';
import AppHeader from '../components/AppHeader.jsx';
import { useAuth } from '../contexts/AuthContext';
import { teamApi, userApi } from '../services/api';

export default function TeamPage({ onLogout, navigateTo }) {
  const { user } = useAuth();
  const [teamId, setTeamId] = useState(null);
  const [teams, setTeams] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isTeamAdmin, setIsTeamAdmin] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [orgUsers, setOrgUsers] = useState([]);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');

  // Load teams and select first team
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError('');
        const { data: teamsRes } = await teamApi.getTeams();
        const list = teamsRes?.teams || [];
        setTeams(list);
        const firstTeamId = list?.[0]?._id;
        if (firstTeamId) {
          setTeamId(firstTeamId);
          await refreshTeam(firstTeamId);
        } else {
          setTeamMembers([]);
        }
        // Load org users for add-member dropdown
        try {
          const { data: usersRes } = await userApi.getUsers();
          const usersList = (usersRes?.users || []).map(u => ({ id: u._id || u.id, name: u.name, email: u.email }));
          setOrgUsers(usersList);
        } catch (err) {
          console.error('Failed to load org users', err);
        }
      } catch (e) {
        console.error('Failed to load teams', e);
        setError('Failed to load teams.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?._id]);

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
      setTeamMembers((prev) => prev.map((m) => ({ ...m, role: m.id === memberId ? 'team_admin' : 'member' })));
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
      await teamApi.addMember(teamId, { userId: selectedUserId });
      const selectedUser = orgUsers.find((u) => (u.id) === selectedUserId);
      if (selectedUser) {
        setTeamMembers((prev) => {
          if (prev.some((m) => m.id === selectedUserId)) return prev;
          return [
            ...prev,
            { id: selectedUserId, name: selectedUser.name || selectedUser.email || 'Member', role: 'member', email: selectedUser.email || '' },
          ];
        });
      } else {
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
    <div className="min-h-screen bg-gray-100">
      <AppHeader onLogout={onLogout} />
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Team Details</h1>
          <div className="space-x-2">
            <button className="px-3 py-2 text-sm rounded border hover:bg-gray-50" onClick={() => navigateTo?.('userProjects')}>Projects</button>
            <button className="px-3 py-2 text-sm rounded border hover:bg-gray-50" onClick={() => navigateTo?.('userChat')}>Chat</button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading team…</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2">
              <label className="text-sm text-gray-600">Select Team:</label>
              <select className="border border-gray-300 rounded-md px-2 py-1 text-sm" value={teamId || ''} onChange={(e) => { setTeamId(e.target.value); refreshTeam(e.target.value); }}>
                {teams.map((t) => (<option key={t._id} value={t._id}>{t.name}</option>))}
              </select>
            </div>

            {isTeamAdmin && (
              <div className="mb-4 p-4 border rounded-md bg-gray-50">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search users by email or name" className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm" />
                  <select className="border border-gray-300 rounded-md px-3 py-2 text-sm min-w-[220px]" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
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
                  <button onClick={handleAddMemberConfirm} disabled={!selectedUserId || actionBusy} className="px-3 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">Add</button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto bg-white rounded-lg shadow-sm">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    {isTeamAdmin && (
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
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
                            <button className="px-2 py-1 rounded hover:bg-gray-100" onClick={() => setMenuOpenFor((prev) => (prev === person.id ? null : person.id))} title="Actions">☰</button>
                            {menuOpenFor === person.id && (
                              <div className="absolute right-0 top-full mt-2 w-44 bg-white border border-gray-200 rounded shadow-md z-10 flex flex-col py-1">
                                <button className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50" onClick={() => handleMakeAdmin(person.id)} disabled={actionBusy || person.role === 'team_admin'}>
                                  Make admin
                                </button>
                                {(() => {
                                  const adminCount = teamMembers.filter((m) => m.role === 'team_admin').length;
                                  const isSelf = (user?.id || user?._id) === person.id;
                                  const hideRemove = isSelf && adminCount === 1;
                                  if (hideRemove) return null;
                                  return (
                                    <button className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50" onClick={() => handleRemove(person.id)} disabled={actionBusy}>
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
                <p className="mt-3 text-sm text-red-600 px-4 pb-4">{actionError}</p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
