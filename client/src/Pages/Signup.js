import { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { Link, useNavigate } from "react-router-dom";
import "../Styles/Auth.css";
import useDocumentTitle from "../hooks/useDocumentTitle";

/* ── Helpers ──────────────────────────────────────────────── */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const nameRegex = /^[A-Za-z\s'-]{2,}$/;

const getPasswordStrength = (pwd) => {
  if (!pwd) return null;
  const checks = [
    pwd.length >= 8,
    /[A-Z]/.test(pwd),
    /[0-9]/.test(pwd),
    /[^A-Za-z0-9]/.test(pwd),
  ];
  const score = checks.filter(Boolean).length;
  if (score <= 1) return "weak";
  if (score <= 3) return "fair";
  return "strong";
};

const strengthLabel = { weak: "Weak", fair: "Fair", strong: "Strong" };

const validate = (fields) => {
  const errors = {};

  if (!fields.name.trim()) {
    errors.name = "Full name is required.";
  } else if (!nameRegex.test(fields.name.trim())) {
    errors.name = "Name must be at least 2 characters and contain only letters.";
  }

  if (!fields.email.trim()) {
    errors.email = "Email address is required.";
  } else if (!emailRegex.test(fields.email)) {
    errors.email = "Enter a valid email address.";
  }

  if (!fields.phone.trim()) {
    errors.phone = "Mobile number is required.";
  } else if (!/^[6-9]\d{9}$/.test(fields.phone.replace(/\s/g, ""))) {
    errors.phone = "Enter a valid 10-digit Indian mobile number.";
  }

  if (!fields.password) {
    errors.password = "Password is required.";
  } else if (fields.password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  } else if (getPasswordStrength(fields.password) === "weak") {
    errors.password = "Password is too weak. Add uppercase letters, numbers, or symbols.";
  }

  if (!fields.confirm) {
    errors.confirm = "Please confirm your password.";
  } else if (fields.confirm !== fields.password) {
    errors.confirm = "Passwords do not match.";
  }

  if (!fields.agreed) {
    errors.agreed = "You must accept the terms to continue.";
  }

  return errors;
};

/* ── Component ────────────────────────────────────────────── */
function Signup() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: "", email: "", phone: "", password: "", confirm: "", agreed: false
  });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showCfm, setShowCfm] = useState(false);

  const strength = getPasswordStrength(formData.password);

  useDocumentTitle("RailBook - Sign Up");

  useEffect(() => {
    const user = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (user && token) {
      navigate("/");
    }
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const next = { ...formData, [name]: type === "checkbox" ? checked : value };
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAlert(null);

    const allTouched = Object.fromEntries(
      Object.keys(formData).map((k) => [k, true])
    );
    setTouched(allTouched);
    const errs = validate(formData);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const { confirm, agreed, phone, ...payloadFields } = formData;
      const payload = {
        ...payloadFields,
        mobile: phone.replace(/\s/g, "")
      };

      const res = await axios.post(
        `${API_BASE_URL}/auth/signup`,
        payload
      );
      setAlert({ type: "success", msg: res.data.message || "Account created! Redirecting to login…" });
      setTimeout(() => navigate("/"), 1500);
    } catch (err) {
      setAlert({
        type: "error",
        msg: err.response?.data?.message || "Signup failed. Please try again."
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
          <i className="fa-solid fa-train-subway"></i>
          RailBook
        </div>

        <div className="auth-brand-content">
          <span className="auth-brand-tag">Fast · Secure · Reliable</span>
          <h1>
            Book smarter,<br />
            travel <em>better.</em>
          </h1>
          <p>
            Join millions of travellers who use RailBook for instant
            ticket booking, live seat alerts, and hassle-free journeys.
          </p>
          <div className="auth-brand-stats">
            <div>
              <strong>60 sec</strong>
              <span>Avg. Booking Time</span>
            </div>
            <div>
              <strong>100%</strong>
              <span>Secure Payments</span>
            </div>
            <div>
              <strong>24 / 7</strong>
              <span>Support</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right form panel ────────────────────────────── */}
      <div className="auth-form-panel">
        <div className="auth-form-wrap">

          <div className="auth-form-header">
            <h2>Create your account</h2>
            <p>Takes less than a minute — start booking right away.</p>
          </div>

          {alert && (
            <div className={`auth-alert ${alert.type}`}>
              <i className={`fa-solid ${alert.type === "error" ? "fa-circle-exclamation" : "fa-circle-check"}`}></i>
              {alert.msg}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>

            {/* Full Name */}
            <div className="auth-field">
              <label htmlFor="name">Full Name</label>
              <div className="auth-field-inner">
                <i className="fa-solid fa-user field-icon"></i>
                <input
                  id="name"
                  type="text"
                  name="name"
                  className={fieldStatus("name")}
                  placeholder="Raj Sharma"
                  value={formData.name}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  autoComplete="name"
                />
              </div>
              {touched.name && errors.name && (
                <span className="field-msg error">
                  <i className="fa-solid fa-circle-exclamation"></i>
                  {errors.name}
                </span>
              )}
            </div>

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

            {/* Mobile */}
            <div className="auth-field">
              <label htmlFor="phone">Mobile Number</label>
              <div className="auth-field-inner">
                <i className="fa-solid fa-mobile-screen field-icon"></i>
                <input
                  id="phone"
                  type="tel"
                  name="phone"
                  className={fieldStatus("phone")}
                  placeholder="98XXXXXXXX"
                  value={formData.phone}
                  onChange={(event) => {
                    const next = {
                      ...formData,
                      phone: event.target.value.replace(/\D/g, "").slice(0, 10)
                    };
                    setFormData(next);
                    if (touched.phone) {
                      setErrors(validate(next));
                    }
                  }}
                  onBlur={handleBlur}
                  maxLength={10}
                  autoComplete="tel"
                />
              </div>
              {touched.phone && errors.phone && (
                <span className="field-msg error">
                  <i className="fa-solid fa-circle-exclamation"></i>
                  {errors.phone}
                </span>
              )}
              {!touched.phone && (
                <span className="field-msg hint">
                  <i className="fa-solid fa-circle-info"></i>
                  Used for booking confirmations &amp; OTP.
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
                  placeholder="Min. 8 characters"
                  value={formData.password}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  autoComplete="new-password"
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

              {/* Strength bar */}
              {formData.password && strength && (
                <div className="pwd-strength">
                  <div className="pwd-strength-bar">
                    <div className={`pwd-strength-fill ${strength}`}></div>
                  </div>
                  <span className={`pwd-strength-label ${strength}`}>
                    {strengthLabel[strength]} password
                  </span>
                </div>
              )}

              {touched.password && errors.password && (
                <span className="field-msg error">
                  <i className="fa-solid fa-circle-exclamation"></i>
                  {errors.password}
                </span>
              )}
            </div>

            {/* Confirm Password */}
            <div className="auth-field">
              <label htmlFor="confirm">Confirm Password</label>
              <div className="auth-field-inner">
                <i className="fa-solid fa-shield-halved field-icon"></i>
                <input
                  id="confirm"
                  type={showCfm ? "text" : "password"}
                  name="confirm"
                  className={fieldStatus("confirm")}
                  placeholder="Re-enter your password"
                  value={formData.confirm}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="pwd-toggle"
                  onClick={() => setShowCfm((s) => !s)}
                  aria-label={showCfm ? "Hide password" : "Show password"}
                >
                  <i className={`fa-solid ${showCfm ? "fa-eye-slash" : "fa-eye"}`}></i>
                </button>
              </div>
              {touched.confirm && errors.confirm && (
                <span className="field-msg error">
                  <i className="fa-solid fa-circle-exclamation"></i>
                  {errors.confirm}
                </span>
              )}
              {touched.confirm && !errors.confirm && formData.confirm && (
                <span className="field-msg success">
                  <i className="fa-solid fa-circle-check"></i>
                  Passwords match!
                </span>
              )}
            </div>

            {/* Terms checkbox */}
            <div className="auth-field" style={{ marginBottom: 24 }}>
              <label className="auth-remember" style={{ alignItems: "flex-start", gap: 10 }}>
                <input
                  type="checkbox"
                  name="agreed"
                  checked={formData.agreed}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  style={{ marginTop: 2 }}
                />
                <span style={{ fontWeight: 600, fontSize: 13.5, color: "#3a5269", lineHeight: 1.45 }}>
                  I agree to the&nbsp;
                  <Link to="/terms" style={{ color: "#0d6efd", fontWeight: 800 }}>Terms of Service</Link>
                  &nbsp;and&nbsp;
                  <Link to="/privacy" style={{ color: "#0d6efd", fontWeight: 800 }}>Privacy Policy</Link>.
                </span>
              </label>
              {touched.agreed && errors.agreed && (
                <span className="field-msg error" style={{ marginTop: 8 }}>
                  <i className="fa-solid fa-circle-exclamation"></i>
                  {errors.agreed}
                </span>
              )}
            </div>

            <button
              type="submit"
              className="auth-submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="btn-spinner"></span>
                  Creating account…
                </>
              ) : (
                <>
                  <i className="fa-solid fa-user-plus"></i>
                  Create Account
                </>
              )}
            </button>
          </form>

          <div className="auth-switch">
            Already have an account?&nbsp;
            <Link to="/">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Signup;
