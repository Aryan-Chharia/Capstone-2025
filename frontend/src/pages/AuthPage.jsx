import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { IconUserPlus, IconMail, IconLock } from "../components/Icons.jsx";

export default function AuthPage({ role, onAuthSuccess }) {
  const [authMode, setAuthMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organization, setOrganization] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [showVerification, setShowVerification] = useState(false);
  const [registrationData, setRegistrationData] = useState(null);

  const { loginUser, registerUser, verifyEmail, isLoading, error, clearError } = useAuth();

  const displayRole = role.charAt(0).toUpperCase() + role.slice(1);

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();

    if (authMode === "login") {
      const result = await loginUser({ email, password }, role);
      if (result.success) {
        onAuthSuccess(result.data);
      }
    } else {
      // Registration
      const userData = { email, password };
      if (role === 'user') {
        userData.name = name;
        userData.organization = organization;
      } else if (role === 'organisation') {
        userData.organizationName = name;
      }

      const result = await registerUser(userData, role);
      if (result.success) {
        if (role === 'user') {
          // Store registration data for verification (users only)
          setRegistrationData(userData);
          setShowVerification(true);
        } else if (role === 'organisation') {
          // Organizations don't require email OTP; log them in directly
          const loginResult = await loginUser({ email, password }, role);
          if (loginResult.success) {
            onAuthSuccess(loginResult.data);
          }
        }
      }
    }
  };

  const handleVerification = async (e) => {
    e.preventDefault();
    clearError();

    const result = await verifyEmail({
      email: registrationData.email,
      verificationCode: verificationCode.trim(),
    });

    if (result.success) {
      onAuthSuccess(result.data);
    }
  };

  const toggleMode = () => {
    setAuthMode((prev) => (prev === "login" ? "signup" : "login"));
    setName("");
    setEmail("");
    setPassword("");
    setOrganization("");
    setVerificationCode("");
    setShowVerification(false);
    setRegistrationData(null);
    clearError();
  };

  if (showVerification && role === 'user') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="bg-white/80 backdrop-blur-xl p-8 md:p-10 rounded-2xl shadow-2xl w-full max-w-md fade-in border border-gray-200">
          <h2 className="text-3xl font-extrabold text-center text-gray-800 tracking-tight mb-2">
            Verify Your Email
          </h2>
          <p className="text-center text-gray-500 mb-8">
            We've sent a verification code to {registrationData?.email}
          </p>

          <form onSubmit={handleVerification} className="flex flex-col gap-5">
            <div className="relative">
              <input
                type="text"
                placeholder="Enter verification code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 outline-none transition-all box-border"
              />
            </div>

            {error && (
              <div className="text-red-600 text-sm text-center bg-red-50 p-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold text-lg hover:bg-indigo-700 transition-transform duration-300 shadow-md hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Verifying..." : "Verify Email"}
            </button>
          </form>

          <div className="flex justify-center items-center text-sm text-gray-600 mt-6">
            <button
              onClick={() => {
                setShowVerification(false);
                setRegistrationData(null);
                toggleMode();
              }}
              className="text-indigo-600 font-semibold hover:text-indigo-700 transition-all"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="bg-white/80 backdrop-blur-xl p-8 md:p-10 rounded-2xl shadow-2xl w-full max-w-md fade-in border border-gray-200">
        <h2 className="text-3xl font-extrabold text-center text-gray-800 tracking-tight mb-2">
          {displayRole} {authMode === "login" ? "Login" : "Sign Up"}
        </h2>
        <p className="text-center text-gray-500 mb-8">
          {authMode === "login"
            ? `Welcome back! Please login to your ${role} account.`
            : `Create your new ${role} account.`}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {authMode === "signup" && (
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center text-gray-400">
                <IconUserPlus />
              </div>
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 outline-none transition-all box-border"
              />
            </div>
          )}

          {authMode === "signup" && role === "user" && (
            <div className="relative">
              <input
                type="text"
                placeholder="Organization Domain (e.g., example.com)"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 outline-none transition-all box-border"
              />
            </div>
          )}

          <div className="relative">
            <div className="absolute inset-y-0 left-3 flex items-center text-gray-400">
              <IconMail />
            </div>
            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 outline-none transition-all box-border"
            />
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-3 flex items-center text-gray-400">
              <IconLock />
            </div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 outline-none transition-all box-border"
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center bg-red-50 p-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold text-lg hover:bg-indigo-700 transition-transform duration-300 shadow-md hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading 
              ? (authMode === "login" ? "Signing in..." : "Creating account...") 
              : (authMode === "login" ? "Login" : "Create Account")
            }
          </button>
        </form>

        <div className="flex justify-center items-center text-sm text-gray-600 mt-6">
          <span>
            {authMode === "login"
              ? "Don't have an account?"
              : "Already have an account?"}
          </span>
          <button
            onClick={toggleMode}
            className="ml-2 px-2 py-1 text-indigo-600 font-semibold border border-indigo-200 rounded-md hover:text-indigo-700 hover:bg-indigo-50 transition-all"
          >
            {authMode === "login" ? "Sign Up" : "Login"}
          </button>
        </div>
      </div>
    </div>
  );
}
