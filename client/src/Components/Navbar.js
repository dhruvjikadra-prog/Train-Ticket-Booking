import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import "../Styles/Navbar.css";
import logo from "../Assets/logo.png";

const safeJsonParse = (value) => {
    try {
        return value ? JSON.parse(value) : null;
    } catch (error) {
        return null;
    }
};

function Navbar() {

    const [user, setUser] = useState(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const syncUserFromStorage = () => {
            const token = localStorage.getItem("token");
            const storedUser = safeJsonParse(localStorage.getItem("user"));

            setUser(token && storedUser ? storedUser : null);
        };

        const handleUserUpdated = (event) => {
            setUser(event.detail?.user || null);
        };

        syncUserFromStorage();
        window.addEventListener("storage", syncUserFromStorage);
        window.addEventListener("railgo:user-updated", handleUserUpdated);

        return () => {
            window.removeEventListener("storage", syncUserFromStorage);
            window.removeEventListener("railgo:user-updated", handleUserUpdated);
        };
    }, []);

    useEffect(() => {
        if (!dropdownOpen) return undefined;

        const handlePointerDown = (event) => {
            if (!dropdownRef.current?.contains(event.target)) {
                setDropdownOpen(false);
            }
        };

        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                setDropdownOpen(false);
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [dropdownOpen]);

    const handleLogout = () => {

        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setDropdownOpen(false);

        window.location.href = "/";
    };

    return (
        <nav className="navbar navbar-expand-lg navbar-light custom-navbar sticky-top">
            <div className="container">

                {/* Logo */}
                <a className="navbar-brand logo-area" href="/">
                    {/* <i className="fa-solid fa-train train-icon"></i> */}
                    <img
                        src={logo}
                        alt="RailGo Logo"
                        className="logo-image"
                    />
                    <span className="logo-text">RailGo</span>
                </a>

                {/* Mobile Toggle */}
                <button
                    aria-controls="navbarContent"
                    aria-label="Toggle navigation"
                    aria-expanded="false"
                    className="navbar-toggler"
                    type="button"
                    data-bs-toggle="collapse"
                    data-bs-target="#navbarContent"
                >
                    <span className="navbar-toggler-icon"></span>
                </button>

                <div
                    className="collapse navbar-collapse"
                    id="navbarContent"
                >
                    {/* Center Links */}
                    <ul className="navbar-nav mx-auto">

                        <li className="nav-item">
                            <NavLink className="nav-link" to="/">
                                <i className="fa-solid fa-house me-2"></i>
                                Home
                            </NavLink>
                        </li>

                        <li className="nav-item">
                            <NavLink className="nav-link" to="/trains">
                                <i className="fa-solid fa-train me-2"></i>
                                Trains
                            </NavLink>
                        </li>

                        <li className="nav-item">
                            <NavLink className="nav-link" to="/pnr-status">
                                <i className="fa-solid fa-ticket me-2"></i>
                                PNR Status
                            </NavLink>
                        </li>

                        {/* <li className="nav-item">
                            <Link className="nav-link" to="/live-status">
                                <i className="fa-solid fa-location-dot me-2"></i>
                                Live Status
                            </Link>
                        </li> */}

                        <li className="nav-item">
                            <NavLink className="nav-link" to="/my-bookings">
                                <i className="fa-solid fa-list-check me-2"></i>
                                My Bookings
                            </NavLink>
                        </li>

                    </ul>

                    {/* Right Dropdown */}
                    <div className={`dropdown account-dropdown ${dropdownOpen ? "is-open" : ""}`} ref={dropdownRef}>

                        <button
                            type="button"
                            className="btn profile-btn dropdown-toggle"
                            aria-expanded={dropdownOpen}
                            aria-haspopup="true"
                            onClick={() => setDropdownOpen((open) => !open)}
                        >
                            <i className="fa-solid fa-user me-2"></i>
                            {user ? user.name : "Login"}
                        </button>

                        <ul className={`dropdown-menu dropdown-menu-end account-dropdown-menu ${user ? "logged-in" : "logged-out"} ${dropdownOpen ? "is-open" : ""}`}>

                            {/* <li>
                                <div className="dropdown-header-box">
                                    <h6>Welcome to RailGo</h6>
                                    <p>Book your journey in seconds</p>
                                </div>
                            </li> */}

                            {user ? (
                                <>
                                    <li>
                                        <div
                                            className="dropdown-item-text navbar-user-card"
                                        >
                                            <strong>{user.name}</strong>
                                            <br />
                                            <small>{user.email}</small>
                                        </div>
                                    </li>

                                    <li>
                                        <Link
                                            className="dropdown-item"
                                            to="/profile"
                                            onClick={() => setDropdownOpen(false)}
                                        >
                                            <i className="fa-solid fa-user me-2"></i>
                                            Profile
                                        </Link>
                                    </li>

                                    {/* <li>
                                        <Link
                                            className="dropdown-item"
                                            to="/my-bookings"
                                        >
                                            <i className="fa-solid fa-ticket me-2"></i>
                                            My Bookings
                                        </Link>
                                    </li> */}

                                    <li>
                                        <hr className="dropdown-divider" />
                                    </li>

                                    <li>
                                        <button
                                            type="button"
                                            className="dropdown-item"
                                            onClick={handleLogout}
                                        >
                                            <i className="fa-solid fa-right-from-bracket me-2"></i>
                                            Logout
                                        </button>
                                    </li>
                                </>
                            ) : (
                                <>
                                    <li>
                                        <Link
                                            className="dropdown-item"
                                            to="/login"
                                            onClick={() => setDropdownOpen(false)}
                                        >
                                            <i className="fa-solid fa-user me-2"></i>
                                            User Login
                                        </Link>
                                    </li>

                                    <li>
                                        <Link
                                            className="dropdown-item"
                                            to="/admin-login"
                                            onClick={() => setDropdownOpen(false)}
                                        >
                                            <i className="fa-solid fa-user-shield me-2"></i>
                                            Admin Login
                                        </Link>
                                    </li>

                                    <li>
                                        <hr className="dropdown-divider" />
                                    </li>

                                    <li>
                                        <Link
                                            className="dropdown-item"
                                            to="/signup"
                                            onClick={() => setDropdownOpen(false)}
                                        >
                                            <i className="fa-solid fa-user-plus me-2"></i>
                                            Sign Up
                                        </Link>
                                    </li>
                                </>
                            )}

                        </ul>

                    </div>

                </div>
            </div>
        </nav>
    );
}

export default Navbar;
