import React, { useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import RoleSelectionPage from './pages/RoleSelectionPage';
import AuthPage from './pages/AuthPage';
import OrganisationDashboard from './pages/OrganisationDashboard';
import ProjectPage from './pages/ProjectPage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import DatasetSelectionPage from './pages/DatasetSelectionPage.jsx';
import TeamPage from './pages/TeamPage.jsx';

export default function App() {
  const [page, setPage] = useState('roleSelect');
  const [role, setRole] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const handleRoleSelect = (selectedRole) => {
    setRole(selectedRole);
    setPage('auth'); 
  };

  const handleAuthSuccess = (userData) => {
    if (userData.role === 'user' || role === 'user') {
      setPage('userProjects');
    } else if (userData.role === 'organisation' || role === 'organisation') {
      setPage('orgDashboard');
    }
  };

  const handleLogout = () => {
    setPage('roleSelect');
    setRole(null);
  };

  // This switch statement acts as our "Router"
  const renderPage = () => {
    switch (page) {
      case 'roleSelect':
        return <RoleSelectionPage onRoleSelect={handleRoleSelect} />;
      case 'auth':
        return <AuthPage role={role} onAuthSuccess={handleAuthSuccess} />;
      case 'userProjects':
        return (
          <ProjectPage
            onLogout={handleLogout}
            navigateTo={setPage}
            selectedProjectId={selectedProjectId}
            setSelectedProjectId={setSelectedProjectId}
          />
        );
      case 'userChat':
        return (
          <ChatPage
            onLogout={handleLogout}
            navigateTo={setPage}
            selectedProjectId={selectedProjectId}
            setSelectedProjectId={setSelectedProjectId}
          />
        );
      case 'datasetSelect':
        return (
          <DatasetSelectionPage
            onLogout={handleLogout}
            navigateTo={setPage}
            selectedProjectId={selectedProjectId}
            setSelectedProjectId={setSelectedProjectId}
          />
        );
      case 'userTeam':
        return (
          <TeamPage
            onLogout={handleLogout}
            navigateTo={setPage}
          />
        );
      case 'orgDashboard':
        return <OrganisationDashboard onLogout={handleLogout} />;
      default:
        return <RoleSelectionPage onRoleSelect={handleRoleSelect} />;
    }
  };

  return (
    <AuthProvider>
      <div className="font-sans text-gray-800">
        {renderPage()}
      </div>
    </AuthProvider>
  );
}
