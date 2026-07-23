import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faArrowsRotate,
    faCalendarDays,
    faCheck,
    faCircleCheck,
    faCircleExclamation,
    faEnvelope,
    faEye,
    faEyeSlash,
    faIdCard,
    faKey,
    faLock,
    faPen,
    faPhone,
    faShieldHalved,
    faTrash,
    faTriangleExclamation,
    faUserPlus,
    faUsers,
    faXmark
} from "@fortawesome/free-solid-svg-icons";
import Navbar from "../Components/Navbar";
import "../Styles/Profile.css";

const USERS_API_BASE = `${API_BASE_URL}/users`;
const usersApi = axios.create({ baseURL: USERS_API_BASE, withCredentials: true });

usersApi.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");

    if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
});

const NAME_PATTERN = /^[a-zA-Z][a-zA-Z\s.'-]*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_PATTERN = /^[6-9]\d{9}$/;
const PASSENGER_NAME_PATTERN = /^[\p{L}][\p{L}\s.'-]{1,59}$/u;
const SAVED_PASSENGER_LIMIT = 12;

const EMPTY_PASSENGER_FORM = {
    name: "",
    age: "",
    gender: "",
    seniorCitizen: false
};

const PASSWORD_RULES = [
    { key: "length", label: "At least 8 characters", test: (v) => v.length >= 8 },
    { key: "upper", label: "One uppercase letter", test: (v) => /[A-Z]/.test(v) },
    { key: "lower", label: "One lowercase letter", test: (v) => /[a-z]/.test(v) },
    { key: "digit", label: "One number", test: (v) => /\d/.test(v) },
    { key: "symbol", label: "One special character", test: (v) => /[^A-Za-z0-9]/.test(v) }
];

const PROFILE_TABS = [
    { id: "profile", label: "Profile", icon: faIdCard },
    { id: "passengers", label: "Saved Passengers", icon: faUsers },
    { id: "security", label: "Change Password", icon: faKey }
];

const safeJsonParse = (value) => {
    try {
        return value ? JSON.parse(value) : null;
    } catch (error) {
        return null;
    }
};

const formatMemberSince = (value) => {
    if (!value) return "N/A";
    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    }).format(new Date(value));
};

const getInitials = (name) => {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const syncStoredUser = (profileUser) => {
    const storedUser = safeJsonParse(localStorage.getItem("user")) || {};
    const id = profileUser._id || profileUser.id || storedUser._id || storedUser.id;
    const nextUser = {
        ...storedUser,
        _id: id,
        id,
        name: profileUser.name,
        email: profileUser.email,
        mobile: profileUser.mobile || null,
        role: profileUser.role || storedUser.role || "user"
    };

    localStorage.setItem("user", JSON.stringify(nextUser));
    window.dispatchEvent(new CustomEvent("railgo:user-updated", { detail: { user: nextUser } }));
};

function Profile() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [activeTab, setActiveTab] = useState("profile");

    const [editingInfo, setEditingInfo] = useState(false);
    const [infoForm, setInfoForm] = useState({ name: "", email: "", mobile: "" });
    const [infoTouched, setInfoTouched] = useState({});
    const [infoSaving, setInfoSaving] = useState(false);
    const [infoServerErrors, setInfoServerErrors] = useState({});
    const [infoMessage, setInfoMessage] = useState({ type: "", text: "" });

    const [passwordForm, setPasswordForm] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
    });
    const [passwordTouched, setPasswordTouched] = useState({});
    const [passwordVisible, setPasswordVisible] = useState({
        currentPassword: false,
        newPassword: false,
        confirmPassword: false
    });
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordServerErrors, setPasswordServerErrors] = useState({});
    const [passwordMessage, setPasswordMessage] = useState({ type: "", text: "" });

    const [passengerForm, setPassengerForm] = useState(EMPTY_PASSENGER_FORM);
    const [passengerEditingId, setPassengerEditingId] = useState("");
    const [passengerTouched, setPassengerTouched] = useState({});
    const [passengerSaving, setPassengerSaving] = useState(false);
    const [passengerServerErrors, setPassengerServerErrors] = useState({});
    const [passengerMessage, setPassengerMessage] = useState({ type: "", text: "" });

    useEffect(() => {
        document.title = "RailGo | My Profile";
    }, []);

    const loadProfile = async () => {
        setLoading(true);
        setLoadError("");
        try {
            const response = await usersApi.get("/me");
            const loadedUser = {
                ...response.data.user,
                savedPassengers: response.data.user.savedPassengers || []
            };
            setUser(loadedUser);
            setInfoForm({
                name: loadedUser.name || "",
                email: loadedUser.email || "",
                mobile: loadedUser.mobile || ""
            });
        } catch (requestError) {
            setLoadError(
                requestError.response?.data?.message || "Unable to load your profile right now."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProfile();
    }, []);

    const savedPassengers = user?.savedPassengers || [];

    const infoErrors = useMemo(() => {
        const errors = {};

        const name = infoForm.name.trim();
        if (!name) {
            errors.name = "Name is required.";
        } else if (name.length < 2 || name.length > 80 || !NAME_PATTERN.test(name)) {
            errors.name = "Enter a valid name.";
        }

        const email = infoForm.email.trim();
        if (!email) {
            errors.email = "Email is required.";
        } else if (!EMAIL_PATTERN.test(email)) {
            errors.email = "Enter a valid email address.";
        }

        const mobile = infoForm.mobile.trim();
        if (mobile && !MOBILE_PATTERN.test(mobile)) {
            errors.mobile = "Enter a valid 10-digit mobile number.";
        }

        return errors;
    }, [infoForm]);

    const infoValid = Object.keys(infoErrors).length === 0;

    const startEditingInfo = () => {
        setInfoForm({
            name: user.name || "",
            email: user.email || "",
            mobile: user.mobile || ""
        });
        setInfoTouched({});
        setInfoServerErrors({});
        setInfoMessage({ type: "", text: "" });
        setEditingInfo(true);
    };

    const cancelEditingInfo = () => {
        if (infoSaving) return;
        setEditingInfo(false);
        setInfoServerErrors({});
    };

    const submitInfo = async (event) => {
        event.preventDefault();
        setInfoTouched({ name: true, email: true, mobile: true });
        setInfoMessage({ type: "", text: "" });

        if (!infoValid) return;

        setInfoSaving(true);
        setInfoServerErrors({});

        try {
            const response = await usersApi.put("/me", {
                name: infoForm.name.trim(),
                email: infoForm.email.trim().toLowerCase(),
                mobile: infoForm.mobile.trim()
            });

            const nextUser = {
                ...response.data.user,
                savedPassengers: response.data.user.savedPassengers || savedPassengers
            };
            setUser(nextUser);
            syncStoredUser(nextUser);
            setEditingInfo(false);
            setInfoMessage({ type: "success", text: "Profile updated successfully." });
        } catch (requestError) {
            const serverErrors = requestError.response?.data?.errors || {};
            setInfoServerErrors(serverErrors);
            setInfoMessage({
                type: "error",
                text:
                    requestError.response?.data?.message ||
                    "Unable to update your profile right now."
            });
        } finally {
            setInfoSaving(false);
        }
    };

    const passwordRuleResults = useMemo(
        () =>
            PASSWORD_RULES.map((rule) => ({
                ...rule,
                passed: rule.test(passwordForm.newPassword)
            })),
        [passwordForm.newPassword]
    );

    const newPasswordValid = passwordRuleResults.every((rule) => rule.passed);

    const passwordErrors = useMemo(() => {
        const errors = {};

        if (!passwordForm.currentPassword) {
            errors.currentPassword = "Current password is required.";
        }

        if (!passwordForm.newPassword) {
            errors.newPassword = "New password is required.";
        } else if (!newPasswordValid) {
            errors.newPassword = "Password does not meet all requirements.";
        }

        if (!passwordForm.confirmPassword) {
            errors.confirmPassword = "Please confirm your new password.";
        } else if (passwordForm.confirmPassword !== passwordForm.newPassword) {
            errors.confirmPassword = "Passwords do not match.";
        }

        if (
            passwordForm.currentPassword &&
            passwordForm.newPassword &&
            passwordForm.currentPassword === passwordForm.newPassword
        ) {
            errors.newPassword = "New password must be different from your current password.";
        }

        return errors;
    }, [passwordForm, newPasswordValid]);

    const passwordValid = Object.keys(passwordErrors).length === 0;

    const togglePasswordVisibility = (field) =>
        setPasswordVisible((prev) => ({ ...prev, [field]: !prev[field] }));

    const markPasswordTouched = (field) =>
        setPasswordTouched((prev) => ({ ...prev, [field]: true }));

    const resetPasswordForm = () => {
        if (passwordSaving) return;
        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setPasswordTouched({});
        setPasswordServerErrors({});
        setPasswordMessage({ type: "", text: "" });
    };

    const submitPassword = async (event) => {
        event.preventDefault();
        setPasswordTouched({ currentPassword: true, newPassword: true, confirmPassword: true });
        setPasswordMessage({ type: "", text: "" });

        if (!passwordValid) return;

        setPasswordSaving(true);
        setPasswordServerErrors({});

        try {
            await usersApi.put("/me/password", {
                currentPassword: passwordForm.currentPassword,
                newPassword: passwordForm.newPassword,
                confirmPassword: passwordForm.confirmPassword
            });

            setPasswordMessage({ type: "success", text: "Password changed successfully." });
            setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
            setPasswordTouched({});
        } catch (requestError) {
            const serverErrors = requestError.response?.data?.errors || {};
            setPasswordServerErrors(serverErrors);
            setPasswordMessage({
                type: "error",
                text:
                    requestError.response?.data?.message ||
                    "Unable to change your password right now."
            });
        } finally {
            setPasswordSaving(false);
        }
    };

    const passengerErrors = useMemo(() => {
        const errors = {};
        const name = passengerForm.name.trim();
        const age = Number(passengerForm.age);

        if (!name) {
            errors.name = "Passenger name is required.";
        } else if (!PASSENGER_NAME_PATTERN.test(name)) {
            errors.name = "Use 2-60 letters; spaces, apostrophes, dots, and hyphens are allowed.";
        }

        if (!passengerForm.age) {
            errors.age = "Passenger age is required.";
        } else if (!Number.isInteger(age) || age < 1 || age > 120) {
            errors.age = "Age must be a whole number between 1 and 120.";
        }

        if (!passengerForm.gender) {
            errors.gender = "Select gender.";
        }

        if (passengerForm.seniorCitizen && age < 60) {
            errors.age = "Senior Citizen can be selected only for age 60 or above.";
        }

        return errors;
    }, [passengerForm]);

    const passengerValid = Object.keys(passengerErrors).length === 0;

    const resetPassengerForm = () => {
        if (passengerSaving) return;
        setPassengerForm(EMPTY_PASSENGER_FORM);
        setPassengerEditingId("");
        setPassengerTouched({});
        setPassengerServerErrors({});
    };

    const startEditingPassenger = (passenger) => {
        setPassengerForm({
            name: passenger.name || "",
            age: passenger.age ? String(passenger.age) : "",
            gender: passenger.gender || "",
            seniorCitizen: Boolean(passenger.seniorCitizen)
        });
        setPassengerEditingId(passenger.id);
        setPassengerTouched({});
        setPassengerServerErrors({});
        setPassengerMessage({ type: "", text: "" });
    };

    const submitPassenger = async (event) => {
        event.preventDefault();
        setPassengerTouched({ name: true, age: true, gender: true });
        setPassengerMessage({ type: "", text: "" });

        if (!passengerValid) return;

        if (!passengerEditingId && savedPassengers.length >= SAVED_PASSENGER_LIMIT) {
            setPassengerMessage({
                type: "error",
                text: `You can save up to ${SAVED_PASSENGER_LIMIT} passengers.`
            });
            return;
        }

        setPassengerSaving(true);
        setPassengerServerErrors({});

        const payload = {
            name: passengerForm.name.trim(),
            age: Number(passengerForm.age),
            gender: passengerForm.gender,
            seniorCitizen: Boolean(passengerForm.seniorCitizen)
        };

        try {
            const response = passengerEditingId
                ? await usersApi.put(`/me/passengers/${passengerEditingId}`, payload)
                : await usersApi.post("/me/passengers", payload);

            const nextPassengers = response.data.savedPassengers || [];
            setUser((prev) => ({ ...prev, savedPassengers: nextPassengers }));
            setPassengerForm(EMPTY_PASSENGER_FORM);
            setPassengerEditingId("");
            setPassengerTouched({});
            setPassengerMessage({
                type: "success",
                text: response.data.message || "Passenger saved successfully."
            });
        } catch (requestError) {
            const serverErrors = requestError.response?.data?.errors || {};
            setPassengerServerErrors(serverErrors);
            setPassengerMessage({
                type: "error",
                text:
                    requestError.response?.data?.message ||
                    "Unable to save passenger right now."
            });
        } finally {
            setPassengerSaving(false);
        }
    };

    const removeSavedPassenger = async (passenger) => {
        if (passengerSaving) return;

        const confirmed = window.confirm(`Remove ${passenger.name} from saved passengers?`);
        if (!confirmed) return;

        setPassengerSaving(true);
        setPassengerMessage({ type: "", text: "" });

        try {
            const response = await usersApi.delete(`/me/passengers/${passenger.id}`);
            const nextPassengers = response.data.savedPassengers || [];
            setUser((prev) => ({ ...prev, savedPassengers: nextPassengers }));

            if (passengerEditingId === passenger.id) {
                setPassengerForm(EMPTY_PASSENGER_FORM);
                setPassengerEditingId("");
                setPassengerTouched({});
                setPassengerServerErrors({});
            }

            setPassengerMessage({
                type: "success",
                text: response.data.message || "Passenger removed successfully."
            });
        } catch (requestError) {
            setPassengerMessage({
                type: "error",
                text:
                    requestError.response?.data?.message ||
                    "Unable to remove passenger right now."
            });
        } finally {
            setPassengerSaving(false);
        }
    };

    if (loading) {
        return (
            <>
                <Navbar />
                <div className="up-page">
                    <div className="up-loading">
                        <FontAwesomeIcon icon={faArrowsRotate} className="up-spin" style={{ fontSize: 28 }} />
                        <span>Loading your profile...</span>
                    </div>
                </div>
            </>
        );
    }

    if (loadError && !user) {
        return (
            <>
                <Navbar />
                <div className="up-page">
                    <div className="up-load-error">
                        <FontAwesomeIcon icon={faTriangleExclamation} style={{ fontSize: 26 }} />
                        <p>{loadError}</p>
                        <button type="button" className="up-btn up-btn--primary" onClick={loadProfile}>
                            Try Again
                        </button>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <Navbar />

            <main className="up-page">
                <div className="up-container">
                    <aside className="up-summary-card">
                        <div className="up-avatar">{getInitials(user.name)}</div>
                        <h2>{user.name}</h2>
                        <span className="up-role-badge">{user.role}</span>

                        <ul className="up-summary-list">
                            <li>
                                <FontAwesomeIcon icon={faEnvelope} />
                                <span>{user.email}</span>
                            </li>
                            <li>
                                <FontAwesomeIcon icon={faPhone} />
                                <span>{user.mobile || "No mobile number added"}</span>
                            </li>
                            <li>
                                <FontAwesomeIcon icon={faCalendarDays} />
                                <span>Member since {formatMemberSince(user.memberSince)}</span>
                            </li>
                            <li>
                                <FontAwesomeIcon icon={faUsers} />
                                <span>{savedPassengers.length} saved passenger{savedPassengers.length === 1 ? "" : "s"}</span>
                            </li>
                        </ul>

                        <button
                            type="button"
                            className="up-summary-action"
                            onClick={() => setActiveTab("security")}
                        >
                            <FontAwesomeIcon icon={faKey} />
                            Change Password
                        </button>
                    </aside>

                    <div className="up-main">
                        <div className="up-tabs" role="tablist" aria-label="Profile sections">
                            {PROFILE_TABS.map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={activeTab === tab.id}
                                    className={`up-tab ${activeTab === tab.id ? "is-active" : ""}`}
                                    onClick={() => setActiveTab(tab.id)}
                                >
                                    <FontAwesomeIcon icon={tab.icon} />
                                    <span>{tab.label}</span>
                                </button>
                            ))}
                        </div>

                        {activeTab === "profile" && (
                            <section className="up-card">
                                <div className="up-card__head">
                                    <div>
                                        <h3>Personal Information</h3>
                                        <p>Your name, email, and mobile number</p>
                                    </div>
                                    {!editingInfo && (
                                        <button type="button" className="up-btn up-btn--ghost" onClick={startEditingInfo}>
                                            <FontAwesomeIcon icon={faPen} style={{ fontSize: 13 }} />
                                            Edit
                                        </button>
                                    )}
                                </div>

                                {infoMessage.text && (
                                    <div className={`up-banner up-banner--${infoMessage.type}`}>
                                        <FontAwesomeIcon
                                            icon={infoMessage.type === "success" ? faCircleCheck : faCircleExclamation}
                                            style={{ fontSize: 15 }}
                                        />
                                        <span>{infoMessage.text}</span>
                                    </div>
                                )}

                                {!editingInfo ? (
                                    <div className="up-view-grid">
                                        <div>
                                            <span>Full Name</span>
                                            <strong>{user.name}</strong>
                                        </div>
                                        <div>
                                            <span>Email Address</span>
                                            <strong>{user.email}</strong>
                                        </div>
                                        <div>
                                            <span>Mobile Number</span>
                                            <strong>{user.mobile || "Not added"}</strong>
                                        </div>
                                    </div>
                                ) : (
                                    <form onSubmit={submitInfo} noValidate>
                                        <fieldset className="up-fieldset" disabled={infoSaving}>
                                            <div className="up-form-grid">
                                                <div className="up-form-group">
                                                    <label htmlFor="profile-name">Full Name</label>
                                                    <input
                                                        id="profile-name"
                                                        type="text"
                                                        value={infoForm.name}
                                                        onChange={(e) =>
                                                            setInfoForm((prev) => ({ ...prev, name: e.target.value }))
                                                        }
                                                        onBlur={() => setInfoTouched((prev) => ({ ...prev, name: true }))}
                                                        className={
                                                            (infoTouched.name && infoErrors.name) || infoServerErrors.name
                                                                ? "up-input-error"
                                                                : ""
                                                        }
                                                        autoComplete="name"
                                                    />
                                                    {((infoTouched.name && infoErrors.name) || infoServerErrors.name) && (
                                                        <span className="up-field-error">
                                                            {infoErrors.name || infoServerErrors.name}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="up-form-group">
                                                    <label htmlFor="profile-email">Email Address</label>
                                                    <input
                                                        id="profile-email"
                                                        type="email"
                                                        value={infoForm.email}
                                                        onChange={(e) =>
                                                            setInfoForm((prev) => ({ ...prev, email: e.target.value }))
                                                        }
                                                        onBlur={() => setInfoTouched((prev) => ({ ...prev, email: true }))}
                                                        className={
                                                            (infoTouched.email && infoErrors.email) || infoServerErrors.email
                                                                ? "up-input-error"
                                                                : ""
                                                        }
                                                        autoComplete="email"
                                                    />
                                                    {((infoTouched.email && infoErrors.email) || infoServerErrors.email) && (
                                                        <span className="up-field-error">
                                                            {infoErrors.email || infoServerErrors.email}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="up-form-group">
                                                    <label htmlFor="profile-mobile">Mobile Number</label>
                                                    <input
                                                        id="profile-mobile"
                                                        type="tel"
                                                        inputMode="numeric"
                                                        placeholder="10-digit mobile number"
                                                        value={infoForm.mobile}
                                                        onChange={(e) =>
                                                            setInfoForm((prev) => ({
                                                                ...prev,
                                                                mobile: e.target.value.replace(/\D/g, "").slice(0, 10)
                                                            }))
                                                        }
                                                        onBlur={() => setInfoTouched((prev) => ({ ...prev, mobile: true }))}
                                                        className={
                                                            (infoTouched.mobile && infoErrors.mobile) || infoServerErrors.mobile
                                                                ? "up-input-error"
                                                                : ""
                                                        }
                                                        autoComplete="tel"
                                                    />
                                                    {((infoTouched.mobile && infoErrors.mobile) || infoServerErrors.mobile) && (
                                                        <span className="up-field-error">
                                                            {infoErrors.mobile || infoServerErrors.mobile}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="up-form-actions">
                                                <button type="button" className="up-btn" onClick={cancelEditingInfo}>
                                                    Cancel
                                                </button>
                                                <button type="submit" className="up-btn up-btn--primary">
                                                    {infoSaving ? "Saving..." : "Save Changes"}
                                                </button>
                                            </div>
                                        </fieldset>
                                    </form>
                                )}
                            </section>
                        )}

                        {activeTab === "passengers" && (
                            <section className="up-card">
                                <div className="up-card__head">
                                    <div>
                                        <h3>Saved Passengers</h3>
                                        <p>{savedPassengers.length} of {SAVED_PASSENGER_LIMIT} saved</p>
                                    </div>
                                    {passengerEditingId && (
                                        <button type="button" className="up-btn" onClick={resetPassengerForm}>
                                            Cancel Edit
                                        </button>
                                    )}
                                </div>

                                {passengerMessage.text && (
                                    <div className={`up-banner up-banner--${passengerMessage.type}`}>
                                        <FontAwesomeIcon
                                            icon={passengerMessage.type === "success" ? faCircleCheck : faCircleExclamation}
                                            style={{ fontSize: 15 }}
                                        />
                                        <span>{passengerMessage.text}</span>
                                    </div>
                                )}

                                <div className="up-passenger-layout">
                                    <form className="up-passenger-form" onSubmit={submitPassenger} noValidate>
                                        <fieldset className="up-fieldset" disabled={passengerSaving}>
                                            <div className="up-passenger-form-title">
                                                <FontAwesomeIcon icon={passengerEditingId ? faPen : faUserPlus} />
                                                <span>{passengerEditingId ? "Edit Passenger" : "Add Passenger"}</span>
                                            </div>

                                            <div className="up-form-grid">
                                                <div className="up-form-group">
                                                    <label htmlFor="saved-passenger-name">Full Name</label>
                                                    <input
                                                        id="saved-passenger-name"
                                                        type="text"
                                                        maxLength={60}
                                                        value={passengerForm.name}
                                                        onChange={(event) =>
                                                            setPassengerForm((prev) => ({ ...prev, name: event.target.value }))
                                                        }
                                                        onBlur={() => setPassengerTouched((prev) => ({ ...prev, name: true }))}
                                                        className={
                                                            (passengerTouched.name && passengerErrors.name) || passengerServerErrors.name
                                                                ? "up-input-error"
                                                                : ""
                                                        }
                                                    />
                                                    {((passengerTouched.name && passengerErrors.name) || passengerServerErrors.name) && (
                                                        <span className="up-field-error">
                                                            {passengerErrors.name || passengerServerErrors.name}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="up-form-group">
                                                    <label htmlFor="saved-passenger-age">Age</label>
                                                    <input
                                                        id="saved-passenger-age"
                                                        type="number"
                                                        min="1"
                                                        max="120"
                                                        inputMode="numeric"
                                                        value={passengerForm.age}
                                                        onChange={(event) =>
                                                            setPassengerForm((prev) => ({
                                                                ...prev,
                                                                age: event.target.value.replace(/\D/g, "").slice(0, 3)
                                                            }))
                                                        }
                                                        onBlur={() => setPassengerTouched((prev) => ({ ...prev, age: true }))}
                                                        className={
                                                            (passengerTouched.age && passengerErrors.age) || passengerServerErrors.age
                                                                ? "up-input-error"
                                                                : ""
                                                        }
                                                    />
                                                    {((passengerTouched.age && passengerErrors.age) || passengerServerErrors.age) && (
                                                        <span className="up-field-error">
                                                            {passengerErrors.age || passengerServerErrors.age}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="up-form-group">
                                                    <label htmlFor="saved-passenger-gender">Gender</label>
                                                    <select
                                                        id="saved-passenger-gender"
                                                        value={passengerForm.gender}
                                                        onChange={(event) =>
                                                            setPassengerForm((prev) => ({ ...prev, gender: event.target.value }))
                                                        }
                                                        onBlur={() => setPassengerTouched((prev) => ({ ...prev, gender: true }))}
                                                        className={
                                                            (passengerTouched.gender && passengerErrors.gender) || passengerServerErrors.gender
                                                                ? "up-input-error"
                                                                : ""
                                                        }
                                                    >
                                                        <option value="">Select Gender</option>
                                                        <option value="Male">Male</option>
                                                        <option value="Female">Female</option>
                                                        <option value="Other">Other</option>
                                                    </select>
                                                    {((passengerTouched.gender && passengerErrors.gender) || passengerServerErrors.gender) && (
                                                        <span className="up-field-error">
                                                            {passengerErrors.gender || passengerServerErrors.gender}
                                                        </span>
                                                    )}
                                                </div>

                                                <label className="up-checkbox-row">
                                                    <input
                                                        type="checkbox"
                                                        checked={passengerForm.seniorCitizen}
                                                        onChange={(event) =>
                                                            setPassengerForm((prev) => ({
                                                                ...prev,
                                                                seniorCitizen: event.target.checked
                                                            }))
                                                        }
                                                    />
                                                    <span>Senior Citizen</span>
                                                </label>
                                            </div>

                                            <div className="up-form-actions">
                                                <button
                                                    type="submit"
                                                    className="up-btn up-btn--primary"
                                                    disabled={!passengerEditingId && savedPassengers.length >= SAVED_PASSENGER_LIMIT}
                                                >
                                                    {passengerSaving
                                                        ? "Saving..."
                                                        : passengerEditingId
                                                            ? "Update Passenger"
                                                            : "Save Passenger"}
                                                </button>
                                            </div>
                                        </fieldset>
                                    </form>

                                    <div className="up-saved-passengers">
                                        {savedPassengers.length === 0 ? (
                                            <div className="up-empty-state">
                                                <FontAwesomeIcon icon={faUsers} />
                                                <span>No saved passengers yet.</span>
                                            </div>
                                        ) : (
                                            savedPassengers.map((passenger) => (
                                                <article className="up-saved-passenger" key={passenger.id}>
                                                    <div>
                                                        <h4>{passenger.name}</h4>
                                                        <p>
                                                            {passenger.age} yrs - {passenger.gender}
                                                            {passenger.seniorCitizen ? " - Senior Citizen" : ""}
                                                        </p>
                                                    </div>
                                                    <div className="up-passenger-actions">
                                                        <button
                                                            type="button"
                                                            className="up-icon-btn"
                                                            aria-label={`Edit ${passenger.name}`}
                                                            onClick={() => startEditingPassenger(passenger)}
                                                        >
                                                            <FontAwesomeIcon icon={faPen} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="up-icon-btn up-icon-btn--danger"
                                                            aria-label={`Remove ${passenger.name}`}
                                                            onClick={() => removeSavedPassenger(passenger)}
                                                        >
                                                            <FontAwesomeIcon icon={faTrash} />
                                                        </button>
                                                    </div>
                                                </article>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </section>
                        )}

                        {activeTab === "security" && (
                            <section className="up-card">
                                <div className="up-card__head">
                                    <div>
                                        <h3>
                                            <FontAwesomeIcon icon={faShieldHalved} style={{ fontSize: 15, marginRight: 8 }} />
                                            Change Password
                                        </h3>
                                        <p>Choose a strong password you have not used before</p>
                                    </div>
                                    <button type="button" className="up-btn" onClick={resetPasswordForm}>
                                        Clear
                                    </button>
                                </div>

                                {passwordMessage.text && (
                                    <div className={`up-banner up-banner--${passwordMessage.type}`}>
                                        <FontAwesomeIcon
                                            icon={passwordMessage.type === "success" ? faCircleCheck : faCircleExclamation}
                                            style={{ fontSize: 15 }}
                                        />
                                        <span>{passwordMessage.text}</span>
                                    </div>
                                )}

                                <form onSubmit={submitPassword} noValidate>
                                    <fieldset className="up-fieldset" disabled={passwordSaving}>
                                        <div className="up-form-grid up-form-grid--password">
                                            {[
                                                { key: "currentPassword", label: "Current Password", autoComplete: "current-password" },
                                                { key: "newPassword", label: "New Password", autoComplete: "new-password" },
                                                { key: "confirmPassword", label: "Confirm New Password", autoComplete: "new-password" }
                                            ].map((field) => (
                                                <div className="up-form-group up-form-group--full" key={field.key}>
                                                    <label htmlFor={`profile-${field.key}`}>{field.label}</label>
                                                    <div
                                                        className={`up-password-field ${(passwordTouched[field.key] &&
                                                            passwordErrors[field.key]) ||
                                                            passwordServerErrors[field.key]
                                                            ? "up-input-error"
                                                            : ""
                                                            }`}
                                                    >
                                                        <FontAwesomeIcon icon={faLock} style={{ fontSize: 14 }} />
                                                        <input
                                                            id={`profile-${field.key}`}
                                                            type={passwordVisible[field.key] ? "text" : "password"}
                                                            value={passwordForm[field.key]}
                                                            onChange={(e) =>
                                                                setPasswordForm((prev) => ({
                                                                    ...prev,
                                                                    [field.key]: e.target.value
                                                                }))
                                                            }
                                                            onBlur={() => markPasswordTouched(field.key)}
                                                            autoComplete={field.autoComplete}
                                                        />
                                                        <button
                                                            type="button"
                                                            className="up-eye-btn"
                                                            tabIndex={-1}
                                                            aria-label={
                                                                passwordVisible[field.key] ? "Hide password" : "Show password"
                                                            }
                                                            onClick={() => togglePasswordVisibility(field.key)}
                                                        >
                                                            <FontAwesomeIcon
                                                                icon={passwordVisible[field.key] ? faEyeSlash : faEye}
                                                                style={{ fontSize: 14 }}
                                                            />
                                                        </button>
                                                    </div>
                                                    {((passwordTouched[field.key] && passwordErrors[field.key]) ||
                                                        passwordServerErrors[field.key]) && (
                                                            <span className="up-field-error">
                                                                {passwordErrors[field.key] || passwordServerErrors[field.key]}
                                                            </span>
                                                        )}

                                                    {field.key === "newPassword" && passwordForm.newPassword && (
                                                        <ul className="up-password-rules">
                                                            {passwordRuleResults.map((rule) => (
                                                                <li key={rule.key} className={rule.passed ? "is-passed" : ""}>
                                                                    <FontAwesomeIcon
                                                                        icon={rule.passed ? faCheck : faXmark}
                                                                        style={{ fontSize: 11 }}
                                                                    />
                                                                    {rule.label}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            ))}
                                        </div>

                                        <div className="up-form-actions">
                                            <button type="submit" className="up-btn up-btn--primary">
                                                {passwordSaving ? "Updating..." : "Change Password"}
                                            </button>
                                        </div>
                                    </fieldset>
                                </form>
                            </section>
                        )}
                    </div>
                </div>
            </main>
        </>
    );
}

export default Profile;
