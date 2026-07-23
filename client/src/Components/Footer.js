import { Link } from "react-router-dom";
import "../Styles/Footer.css";
import Logo from "../Assets/logo.png"

function Footer() {
    return (
        <footer className="site-footer">
            <div className="container">
                <div className="footer-grid">
                    <div className="footer-brand">
                        <Link className="footer-logo" to="/">
                            <img src={Logo} height={"30px"} width={"30px"} style={{borderRadius: "25px"}} />
                            <span>RailGo</span>
                        </Link>
                        <p>
                            A modern train ticket booking experience for searching routes,
                            checking availability, and planning journeys with less friction.
                        </p>
                    </div>

                    <div className="footer-links">
                        <h3>Explore</h3>
                        <Link to="/">Home</Link>
                        <Link to="/trains">Trains</Link>
                        <Link to="/pnr-status">PNR Status</Link>
                    </div>

                    <div className="footer-links">
                        <h3>Account</h3>
                        <Link to="/login">Login</Link>
                        <Link to="/signup">Sign Up</Link>
                        <Link to="/my-bookings">My Bookings</Link>
                    </div>

                    <div className="footer-contact">
                        <h3>Support</h3>
                        <div>
                            <i className="fa-solid fa-envelope"></i>
                            support@railgo.com
                        </div>
                        <div>
                            <i className="fa-solid fa-phone"></i>
                            +91 1800 000 000
                        </div>
                    </div>
                </div>

                <div className="footer-bottom">
                    <span>Copyright 2026 RailGo. All rights reserved.</span>
                    <div>
                        <a href="#top" aria-label="Back to top">
                            <i className="fa-solid fa-arrow-up"></i>
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}

export default Footer;
