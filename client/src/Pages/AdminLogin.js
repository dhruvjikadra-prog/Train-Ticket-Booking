import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { useNavigate } from "react-router-dom";
import "../Styles/AdminLogin.css";

const ADMIN_AUTH_API_BASE = `${API_BASE_URL}/admin/auth`;

// withCredentials is mandatory here: the session lives in httpOnly cookies
// (access + refresh token), never in localStorage/sessionStorage, so it
// can't be lifted by an XSS payload elsewhere on the page.
const api = axios.create({ baseURL: ADMIN_AUTH_API_BASE, withCredentials: true });

const OTP_LENGTH = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatCountdown(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

function AdminLogin() {
    const navigate = useNavigate();

    const [step, setStep] = useState("credentials"); // "credentials" | "otp"

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [website, setWebsite] = useState(""); // honeypot — must stay empty

    const [captcha, setCaptcha] = useState(null); // { question, token }
    const [captchaAnswer, setCaptchaAnswer] = useState("");
    const [csrfToken, setCsrfToken] = useState("");

    const [otp, setOtp] = useState("");

    const [fieldErrors, setFieldErrors] = useState({});
    const [formError, setFormError] = useState("");
    const [loading, setLoading] = useState(false);

    const [lockSecondsLeft, setLockSecondsLeft] = useState(0);
    const lockIntervalRef = useRef(null);

    const emailInputRef = useRef(null);

    /* --------------------------- bootstrap security tokens --------------------------- */

    const refreshSecurityTokens = async () => {
        try {
            const [csrfRes, captchaRes] = await Promise.all([
                api.get("/csrf-token"),
                api.get("/captcha")
            ]);
            setCsrfToken(csrfRes.data.csrfToken);
            setCaptcha(captchaRes.data);
            setCaptchaAnswer("");
        } catch {
            setFormError("Couldn't reach the server. Check your connection and try again.");
        }
    };

    useEffect(() => {
        refreshSecurityTokens();
        emailInputRef.current?.focus();
    }, []);

    // lockout countdown
    useEffect(() => {
        if (lockSecondsLeft <= 0) {
            clearInterval(lockIntervalRef.current);
            return;
        }
        lockIntervalRef.current = window.setInterval(() => {
            setLockSecondsLeft((s) => Math.max(0, s - 1));
        }, 1000);
        return () => clearInterval(lockIntervalRef.current);
    }, [lockSecondsLeft]);

    /* --------------------------------- validation --------------------------------- */

    const validateCredentials = () => {
        const errors = {};
        if (!email.trim()) {
            errors.email = "Email is required.";
        } else if (!EMAIL_PATTERN.test(email.trim())) {
            errors.email = "Enter a valid email address.";
        }

        if (!password) {
            errors.password = "Password is required.";
        }

        if (!captchaAnswer.trim()) {
            errors.captchaAnswer = "Answer the verification question.";
        }

        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    /* ----------------------------------- submit ------------------------------------ */

    const handleCredentialsSubmit = async (event) => {
        event.preventDefault();
        if (loading || lockSecondsLeft > 0) return;

        setFormError("");
        if (!validateCredentials()) return;

        setLoading(true);
        try {
            const res = await api.post(
                "/login",
                {
                    email: email.trim().toLowerCase(),
                    password,
                    website, // honeypot — real users leave this blank
                    captchaToken: captcha?.token,
                    captchaAnswer
                },
                { headers: { "X-CSRF-Token": csrfToken } }
            );

            if (res.data.twoFactorRequired) {
                setStep("otp");
            } else {
                navigate("/admin/dashboard");
            }
        } catch (err) {
            const status = err.response?.status;
            const data = err.response?.data;

            if (status === 423) {
                setLockSecondsLeft(data?.retryAfterSeconds || 60);
                setFormError(data?.message || "Account temporarily locked.");
            } else {
                setFormError(data?.message || "Invalid email or password.");
            }

            setPassword("");
            await refreshSecurityTokens(); // burn the used captcha, issue a fresh one
        } finally {
            setLoading(false);
        }
    };

    const handleOtpSubmit = async (event) => {
        event.preventDefault();
        if (loading) return;

        setFormError("");
        if (otp.trim().length !== OTP_LENGTH) {
            setFormError(`Enter the ${OTP_LENGTH}-digit code from your authenticator app.`);
            return;
        }

        setLoading(true);
        try {
            await api.post(
                "/verify-otp",
                { otp: otp.trim() },
                { headers: { "X-CSRF-Token": csrfToken } }
            );
            navigate("/admin/dashboard");
        } catch (err) {
            setFormError(err.response?.data?.message || "Invalid verification code.");
            setOtp("");
        } finally {
            setLoading(false);
        }
    };

    const handleStartOver = () => {
        setStep("credentials");
        setOtp("");
        setPassword("");
        setFormError("");
        refreshSecurityTokens();
    };

    const isLocked = lockSecondsLeft > 0;

    /* ------------------------------------ render ------------------------------------ */

    return (
        <div className="al-page">
            <div className="al-backdrop-grid" aria-hidden="true"></div>

            <div className="al-card" role="main">
                <div className="al-shield">
                    <i className="fa-solid fa-shield-halved"></i>
                </div>

                <h1 className="al-title">Admin Sign In</h1>
                <p className="al-subtitle">
                    {step === "credentials"
                        ? "Restricted access. Authorized personnel only."
                        : "Enter the code from your authenticator app."}
                </p>

                {formError && (
                    <div className="al-alert" role="alert">
                        <i className="fa-solid fa-triangle-exclamation"></i>
                        <span>{formError}</span>
                    </div>
                )}

                {isLocked && (
                    <div className="al-lockout">
                        <i className="fa-solid fa-lock"></i>
                        <div>
                            <strong>Account locked</strong>
                            <span>Try again in {formatCountdown(lockSecondsLeft)}</span>
                        </div>
                    </div>
                )}

                {step === "credentials" ? (
                    <form className="al-form" onSubmit={handleCredentialsSubmit} noValidate>
                        <div className="al-field">
                            <label htmlFor="al-email">Email address</label>
                            <div className={`al-input-wrap ${fieldErrors.email ? "has-error" : ""}`}>
                                <i className="fa-solid fa-envelope"></i>
                                <input
                                    id="al-email"
                                    ref={emailInputRef}
                                    type="email"
                                    autoComplete="username"
                                    placeholder="you@railwaybuddy.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={loading || isLocked}
                                    maxLength={254}
                                />
                            </div>
                            {fieldErrors.email && <span className="al-field-error">{fieldErrors.email}</span>}
                        </div>

                        <div className="al-field">
                            <label htmlFor="al-password">Password</label>
                            <div className={`al-input-wrap ${fieldErrors.password ? "has-error" : ""}`}>
                                <i className="fa-solid fa-lock"></i>
                                <input
                                    id="al-password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="current-password"
                                    placeholder="••••••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={loading || isLocked}
                                    maxLength={128}
                                />
                                <button
                                    type="button"
                                    className="al-toggle-visibility"
                                    onClick={() => setShowPassword((v) => !v)}
                                    tabIndex={-1}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    <i className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`}></i>
                                </button>
                            </div>
                            {fieldErrors.password && <span className="al-field-error">{fieldErrors.password}</span>}
                        </div>

                        {/* Honeypot — kept off-screen (not display:none/visibility:hidden,
                            which some bots specifically detect) so only automated form
                            fillers ever populate it. */}
                        <div className="al-honeypot" aria-hidden="true">
                            <label htmlFor="al-website">Website</label>
                            <input
                                id="al-website"
                                type="text"
                                tabIndex={-1}
                                autoComplete="off"
                                value={website}
                                onChange={(e) => setWebsite(e.target.value)}
                            />
                        </div>

                        <div className="al-field">
                            <label htmlFor="al-captcha">
                                Quick check — what's {captcha?.question || "…"}?
                            </label>
                            <div className={`al-input-wrap ${fieldErrors.captchaAnswer ? "has-error" : ""}`}>
                                <i className="fa-solid fa-calculator"></i>
                                <input
                                    id="al-captcha"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    placeholder="Your answer"
                                    value={captchaAnswer}
                                    onChange={(e) => setCaptchaAnswer(e.target.value)}
                                    disabled={loading || isLocked || !captcha}
                                    maxLength={3}
                                />
                            </div>
                            {fieldErrors.captchaAnswer && (
                                <span className="al-field-error">{fieldErrors.captchaAnswer}</span>
                            )}
                        </div>

                        <button type="submit" className="al-submit" disabled={loading || isLocked}>
                            {loading ? (
                                <>
                                    <i className="fa-solid fa-circle-notch al-spin"></i> Verifying…
                                </>
                            ) : (
                                <>
                                    <i className="fa-solid fa-right-to-bracket"></i> Sign in securely
                                </>
                            )}
                        </button>
                    </form>
                ) : (
                    <form className="al-form" onSubmit={handleOtpSubmit} noValidate>
                        <div className="al-field">
                            <label htmlFor="al-otp">Authenticator code</label>
                            <div className="al-input-wrap al-otp-wrap">
                                <i className="fa-solid fa-key"></i>
                                <input
                                    id="al-otp"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    placeholder="123456"
                                    maxLength={OTP_LENGTH}
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                                    disabled={loading}
                                    autoFocus
                                />
                            </div>
                        </div>

                        <button type="submit" className="al-submit" disabled={loading}>
                            {loading ? (
                                <>
                                    <i className="fa-solid fa-circle-notch al-spin"></i> Verifying…
                                </>
                            ) : (
                                <>
                                    <i className="fa-solid fa-circle-check"></i> Verify and sign in
                                </>
                            )}
                        </button>

                        <button type="button" className="al-link-btn" onClick={handleStartOver} disabled={loading}>
                            <i className="fa-solid fa-arrow-left"></i> Use a different account
                        </button>
                    </form>
                )}

                <div className="al-footer-note">
                    <i className="fa-solid fa-shield-halved"></i>
                    Protected by rate limiting, bot checks, and two-factor authentication.
                </div>

                <p className="al-help-note">
                    Trouble signing in? Contact your system administrator — there's no
                    self-service account recovery on this page by design.
                </p>
            </div>
        </div>
    );
}

export default AdminLogin;
