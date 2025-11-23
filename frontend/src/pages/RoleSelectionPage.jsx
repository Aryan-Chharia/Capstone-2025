import React from 'react';
// import { IconUser, IconBuilding } from '../components/Icons.jsx'; // Mocked below

// --- Mock Icons (from your screenshot) ---
const IconUser = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    {/* SVG path from your image_9bdc7e.png */}
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Zm-3.75 9a-3.75-3.75 0 0 0-3.75 3.75v.001A2.25 2.25 0 0 0 10.5 21h3a2.25 2.25 0 0 0 2.25-2.25v-.001a3.75 3.75 0 0 0-3.75-3.75Z" />
  </svg>
);

const IconBuilding = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    {/* SVG path from your image_9bdc7e.png */}
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h6.75m-6.75 3.75h6.75m-6.75 3.75h6.75m-6.75 3.75h6.75M12 21v-3.75" />
  </svg>
);
// --- End Mock Icons ---

export default function RoleSelectionPage({ onRoleSelect }) {
  return (
    // This is the correct set of classes for a centered, full-screen layout
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100x p-4">
      
      <h1 className="text-3xl font-bold text-gray-800 mb-10">
        Welcome!
      </h1>
      
      <h2 className="text-xl text-gray-600 mb-12">
        Please select your role to continue
      </h2>
      
      <div className="flex flex-col md:flex-row gap-8">
        
        {/* User Card */}
        <button
          onClick={() => onRoleSelect('user')}
          className="bg-white p-10 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 w-72 text-center group"
        >
          <div className="flex justify-center mb-4 text-blue-500 group-hover:text-blue-600">
            <IconUser className="h-16 w-16" />
          </div>
          <h3 className="text-2xl font-semibold text-gray-700">
            I am a User
          </h3>
          <p className="text-gray-500 mt-2">
            Access your personal dashboard.
          </p>
        </button>
        
        {/* Organisation Card */}
        <button
          onClick={() => onRoleSelect('organisation')}
          className="bg-white p-10 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 w-72 text-center group"
        >
          <div className="flex justify-center mb-4 text-indigo-500 group-hover:text-indigo-600">
            <IconBuilding className="h-16 w-16" />
          </div>
          <h3 className="text-2xl font-semibold text-gray-700">
            I am an Organisation
          </h3>
          <p className="text-gray-500 mt-2">
            Manage your company profile.
          </p>
        </button>

      </div>
    </div>
  );
}