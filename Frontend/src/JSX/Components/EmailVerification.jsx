/** @format */

import React, { useState, useEffect } from "react";
import {
  CheckCircle,
  XCircle,
  Loader,
  Mail,
  ArrowRight,
  X,
  Send,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import BACKEND_URL from "../../Config/index.js";
import ParticleBackground from "./ParticleBackground";

function EmailVerification() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("verifying");
  const [message, setMessage] = useState("Verifying your email...");
  const [showContent, setShowContent] = useState(false);
  const [email, setEmail] = useState("");
  const [isResending, setIsResending] = useState(false);
  const [showEmailPopup, setShowEmailPopup] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const navigate = useNavigate();

  // No changes to logic functions...
  useEffect(() => {
    const verify = async () => {
      try {
        const token = searchParams.get("token");
        const res = await axios.get(
          `${BACKEND_URL}/api/v1/users/verify-email?token=${token}`,
          { withCredentials: true }
        );
        if (res.status === 200) {
          setStatus("success");
          setMessage("Email verified successfully!");
        } else {
          throw new Error("Invalid response");
        }
      } catch (error) {
        console.error("Verification error:", error);
        setStatus("error");
        if (error.response) {
          switch (error.response.status) {
            case 400:
              setMessage("Invalid verification token");
              break;
            case 404:
              setMessage("Verification token not found");
              break;
            case 410:
              setMessage("Verification link has expired");
              break;
            default:
              setMessage("Verification failed. Please try again.");
          }
        } else {
          setMessage(
            "Network error. Please check your connection and try again."
          );
        }
      }
    };
    setTimeout(() => setShowContent(true), 300);
    verify();
  }, [searchParams]);

  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleEmailSubmit = async () => {
    setEmailError("");
    if (!email.trim() || !validateEmail(email)) {
      setEmailError("Please enter a valid email address");
      return;
    }
    setIsResending(true);
    try {
      const response = await axios.post(
        `${BACKEND_URL}/api/v1/users/resend-email-verication`,
        { email: email.trim() },
        { withCredentials: true }
      );
      if (response.data.statusCode === 200) {
        setShowEmailPopup(false);
        setStatus("resent");
        setMessage(
          `New verification link sent to ${email}! Please check your inbox and spam folder.`
        );
        setShowSuccessAnimation(true);
        setTimeout(() => setShowSuccessAnimation(false), 3000);
      } else {
        throw new Error("Unexpected response");
      }
    } catch (error) {
      console.error("Error resending verification link:", error);
      if (error.response) {
        switch (error.response.status) {
          case 400:
            setEmailError("Invalid email address");
            break;
          case 404:
            setEmailError("Email address not found in our system");
            break;
          case 422:
            setEmailError("Email is already verified");
            break;
          case 429:
            setEmailError("Too many requests. Please wait before trying again");
            break;
          default:
            setEmailError(
              "Failed to send verification link. Please try again."
            );
        }
      } else {
        setEmailError("Network error. Please check your connection.");
      }
    } finally {
      setIsResending(false);
    }
  };

  const handleResendLink = () => {
    setEmail("");
    setEmailError("");
    setShowEmailPopup(true);
  };
  const closePopup = () => setShowEmailPopup(false);

  const getIcon = () => {
    switch (status) {
      case "verifying":
        return <Loader className="w-16 h-16 text-blue-300 animate-spin" />;
      case "success":
        return <CheckCircle className="w-16 h-16 text-cyan-300" />;
      case "resent":
        return <Mail className="w-16 h-16 text-blue-300" />;
      case "error":
        return <XCircle className="w-16 h-16 text-red-400" />;
      default:
        return <Mail className="w-16 h-16 text-blue-300" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case "success":
        return "from-cyan-500 to-teal-600";
      case "error":
        return "from-red-500 to-orange-600";
      default:
        return "from-blue-500 to-cyan-600";
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
      <ParticleBackground />
      <div className="absolute inset-0 bg-black/40 z-10" />

      {showSuccessAnimation && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="animate-ping absolute inline-flex h-32 w-32 rounded-full bg-cyan-400 opacity-75"></div>
          <div className="animate-pulse absolute inline-flex h-24 w-24 rounded-full bg-cyan-500"></div>
          <CheckCircle className="relative w-12 h-12 text-white animate-bounce" />
        </div>
      )}

      <div
        className={`relative z-20 w-full max-w-md mx-auto transform transition-all duration-1000 ${
          showContent ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        }`}
      >
        <div className="text-center mb-8">
          <div className="inline-block p-4 bg-black/20 backdrop-blur-sm rounded-3xl border border-blue-500/30 shadow-2xl">
            {/* KEY CHANGE: Updated branding */}
            <img
              src={"/logo.png"}
              alt="CKsFinBot Logo"
              className="w-16 h-16 mx-auto rounded-2xl shadow-lg"
            />
          </div>
          <h1 className="text-2xl font-bold text-white mt-4 mb-2">CKsFinBot</h1>
          <p className="text-slate-400 text-sm">Email Verification</p>
        </div>

        <div className="bg-black/30 backdrop-blur-lg rounded-3xl border border-blue-500/30 shadow-2xl p-8 text-center">
          <div
            className={`inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br ${getStatusColor()} mb-6 shadow-lg`}
          >
            <div className="bg-black/20 rounded-full p-4 backdrop-blur-sm">
              {getIcon()}
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white mb-4">
            {status === "verifying" && "Verifying Your Email"}
            {status === "success" && "Email Verified!"}
            {status === "resent" && "Link Sent!"}
            {status === "error" && "Verification Failed"}
          </h2>

          <p className="text-slate-300 mb-8 leading-relaxed">{message}</p>

          {status === "success" && (
            // KEY CHANGE: Updated button text
            <button
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] flex items-center justify-center group"
              onClick={() => navigate("/app")}
            >
              Continue to FinBot
              <ArrowRight className="ml-2 w-5 h-5 transform group-hover:translate-x-1 transition-transform" />
            </button>
          )}

          {(status === "error" || status === "resent") && (
            <button
              className="w-full bg-gray-700/50 hover:bg-gray-600/50 border border-gray-600 text-white font-semibold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02]"
              onClick={handleResendLink}
            >
              {status === "resent"
                ? "Send Another Link"
                : "Request New Verification Link"}
            </button>
          )}
        </div>
      </div>

      {/* Popup remains unchanged but will work perfectly in this theme */}
      {showEmailPopup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-black/20 backdrop-blur-lg rounded-3xl border border-white/20 shadow-2xl p-8 w-full max-w-md transform transition-all duration-300 scale-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Enter Your Email</h3>
              <button
                onClick={closePopup}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  className="w-full bg-black/20 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300"
                  onKeyPress={(e) => e.key === "Enter" && handleEmailSubmit()}
                />
                {emailError && (
                  <p className="text-red-400 text-sm mt-2">{emailError}</p>
                )}
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={closePopup}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-4 rounded-2xl transition-all duration-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEmailSubmit}
                  disabled={isResending}
                  className={`flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold py-3 px-4 rounded-2xl transition-all duration-300 flex items-center justify-center ${
                    isResending ? "opacity-75 cursor-not-allowed" : ""
                  }`}
                >
                  {isResending ? (
                    <>
                      <Loader className="w-5 h-5 mr-2 animate-spin" />{" "}
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5 mr-2" /> Send Link
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmailVerification;
