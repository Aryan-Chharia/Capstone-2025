import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { IconLogOut } from './Icons.jsx';

export default function AppHeader({ onLogout }) {
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    onLogout();
  };

  return (
    // <header className="bg-white shadow-md w-full">
    //   <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    //     <div className="flex justify-between items-center h-16">
    //       <div className="flex-shrink-0 flex items-center">
    //         <span className="font-bold text-2xl text-blue-600">MyApp</span>
    //       </div>
    //       <button
    //         onClick={handleLogout}
    //         className="flex items-center justify-center bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
    //       >
    //         <IconLogOut />
    //         Logout
    //       </button>
    //     </div>
    //   </nav>
    // </header>

  <header className="bg-white shadow-sm w-full">
    <nav className="flex justify-between items-center px-6 py-3">
      <h1 className="font-bold text-2xl text-blue-600">MyApp</h1>
      <button
        onClick={handleLogout}
        className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-200 transition-colors"
      >
        <IconLogOut className="w-4 h-4" />
        Logout
      </button>
    </nav>
  </header>

  );
}