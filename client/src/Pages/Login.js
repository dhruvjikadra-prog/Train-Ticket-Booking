import { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { Link, useNavigate } from "react-router-dom";
import "../Styles/Auth.css";
import useDocumentTitle from "../hooks/useDocumentTitle";
import Logo from "../Assets/logo.png";

/* ── Helpers ──────────────────────────────────────────────── */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validate = (fields) => {
    const errors = {};

    if (!fields.email.trim()) {
        errors.email = "Email address is required.";
    } else if (!emailRegex.test(fields.email)) {
        errors.email = "Enter a valid email address.";
    }

    if (!fields.password) {
        errors.password = "Password is required.";
    } else if (fields.password.length < 6) {
        errors.password = "Password must be at least 6 characters.";
    }

    return errors;
};

/* ── Component ────────────────────────────────────────────── */
function Login() {
    const navigate = useNavigate();

    const [formData, setFormData] = useState({ email: "", password: "" });
    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});
    const [alert, setAlert] = useState(null);      // { type, msg }
    const [loading, setLoading] = useState(false);
    const [showPwd, setShowPwd] = useState(false);
    const [remember, setRemember] = useState(false);

    useDocumentTitle('RailGo - Login');

    /* live validation after first blur */
    const handleChange = (e) => {
        const { name, value } = e.target;
        const next = { ...formData, [name]: value };
        setFormData(next);
        if (touched[name]) {
            setErrors(validate(next));
        }
    };

    const handleBlur = (e) => {
        const { name } = e.target;
        setTouched((t) => ({ ...t, [name]: true }));
        setErrors(validate(formData));
    };

    useEffect(() => {
        const user = localStorage.getItem("user");
        const token = localStorage.getItem("token");
        if (user && token) {
            navigate("/");
        }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setAlert(null);

        /* mark all fields touched */
        setTouched({ email: true, password: true });
        const errs = validate(formData);
        setErrors(errs);
        if (Object.keys(errs).length) return;

        setLoading(true);
        try {
            const res = await axios.post(
                `${API_BASE_URL}/auth/login`,
                formData
            );

            localStorage.setItem("token", res.data.token);

            localStorage.setItem("user", JSON.stringify(res.data.user));
            if (remember) {
                localStorage.setItem("rememberedEmail", formData.email);
            }

            setAlert({ type: "success", msg: "Login successful! Redirecting…" });
            setTimeout(() => navigate("/"), 1200);
        } catch (err) {
            setAlert({
                type: "error",
                msg: err.response?.data?.message || "Login failed. Check your credentials and try again."
            });
        } finally {
            setLoading(false);
        }
    };

    const fieldStatus = (name) => {
        if (!touched[name]) return "";
        return errors[name] ? "input-error" : "input-success";
    };

    return (
        <div className="auth-page">

            {/* ── Left brand panel ────────────────────────────── */}
            <div className="auth-brand">
                <div className="auth-brand-logo">
                    {/* <i className="fa-solid fa-train-subway"></i> */}
                    <img src={Logo} height={"40px"} width={"40px"} style={{borderRadius: "25px"}} />
                    RailGo
                </div>

                <div className="auth-brand-content">
                    <span className="auth-brand-tag">India&apos;s Trusted Rail Platform</span>
                    <h1>
                        Your next journey<br />
                        starts <em>right here.</em>
                    </h1>
                    <p>
                        Book train tickets instantly, check real-time seat availability,
                        and manage every trip from one place.
                    </p>
                    <div className="auth-brand-stats">
                        <div>
                            <strong>2M+</strong>
                            <span>Tickets Booked</span>
                        </div>
                        <div>
                            <strong>800+</strong>
                            <span>Train Routes</span>
                        </div>
                        <div>
                            <strong>4.8 ★</strong>
                            <span>User Rating</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Right form panel ────────────────────────────── */}
            <div className="auth-form-panel">
                <div className="auth-form-wrap">

                    <div className="auth-form-header">
                        <h2>Welcome back</h2>
                        <p>Sign in to access your bookings and travel history.</p>
                    </div>

                    {alert && (
                        <div className={`auth-alert ${alert.type}`}>
                            <i className={`fa-solid ${alert.type === "error" ? "fa-circle-exclamation" : "fa-circle-check"}`}></i>
                            {alert.msg}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} noValidate>

                        {/* Email */}
                        <div className="auth-field">
                            <label htmlFor="email">Email Address</label>
                            <div className="auth-field-inner">
                                <i className="fa-solid fa-envelope field-icon"></i>
                                <input
                                    id="email"
                                    type="email"
                                    name="email"
                                    className={fieldStatus("email")}
                                    placeholder="you@example.com"
                                    value={formData.email}
                                    onChange={handleChange}
                                    onBlur={handleBlur}
                                    autoComplete="email"
                                />
                            </div>
                            {touched.email && errors.email && (
                                <span className="field-msg error">
                                    <i className="fa-solid fa-circle-exclamation"></i>
                                    {errors.email}
                                </span>
                            )}
                            {touched.email && !errors.email && (
                                <span className="field-msg success">
                                    <i className="fa-solid fa-circle-check"></i>
                                    Looks good!
                                </span>
                            )}
                        </div>

                        {/* Password */}
                        <div className="auth-field">
                            <label htmlFor="password">Password</label>
                            <div className="auth-field-inner">
                                <i className="fa-solid fa-lock field-icon"></i>
                                <input
                                    id="password"
                                    type={showPwd ? "text" : "password"}
                                    name="password"
                                    className={fieldStatus("password")}
                                    placeholder="••••••••"
                                    value={formData.password}
                                    onChange={handleChange}
                                    onBlur={handleBlur}
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    className="pwd-toggle"
                                    onClick={() => setShowPwd((s) => !s)}
                                    aria-label={showPwd ? "Hide password" : "Show password"}
                                >
                                    <i className={`fa-solid ${showPwd ? "fa-eye-slash" : "fa-eye"}`}></i>
                                </button>
                            </div>
                            {touched.password && errors.password && (
                                <span className="field-msg error">
                                    <i className="fa-solid fa-circle-exclamation"></i>
                                    {errors.password}
                                </span>
                            )}
                        </div>

                        {/* Remember & Forgot */}
                        <div className="auth-extras">
                            <label className="auth-remember">
                                <input
                                    type="checkbox"
                                    checked={remember}
                                    onChange={(e) => setRemember(e.target.checked)}
                                />
                                Remember me
                            </label>
                            <Link to="/forgot-password" className="auth-forgot">
                                Forgot password?
                            </Link>
                        </div>

                        <button
                            type="submit"
                            className="auth-submit"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <span className="btn-spinner"></span>
                                    Signing in…
                                </>
                            ) : (
                                <>
                                    <i className="fa-solid fa-right-to-bracket"></i>
                                    Sign In
                                </>
                            )}
                        </button>
                    </form>

                    <div className="auth-switch">
                        New to RailBook?&nbsp;
                        <Link to="/signup">Create a free account</Link>
                    </div>

                    <p className="auth-terms">
                        By signing in you agree to our{" "}
                        <Link to="/terms">Terms of Service</Link> and{" "}
                        <Link to="/privacy">Privacy Policy</Link>.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default Login;