import "../Styles/Features.css";

function Features() {
    const features = [
        {
            icon: "fa-bolt",
            title: "Fast Booking",
            text: "Search trains, compare options, and move to booking without unnecessary steps."
        },
        {
            icon: "fa-shield-halved",
            title: "Secure Payment",
            text: "Protected checkout flow designed for safe railway ticket transactions."
        },
        {
            icon: "fa-location-crosshairs",
            title: "Live Journey Tools",
            text: "Keep key travel details visible with route, timing, and availability information."
        },
        {
            icon: "fa-ticket",
            title: "Digital Tickets",
            text: "Manage booking information in a clean digital format ready for travel."
        }
    ];

    return (
        <section className="features-section">
            <div className="container">
                <div className="section-heading">
                    <span>Why RailGo</span>
                    <h2>Built for simple, confident travel planning</h2>
                    <p>Everything on the page is tuned for quick comparison and clear decisions.</p>
                </div>

                <div className="features-grid">
                    {features.map((feature) => (
                        <article className="feature-card" key={feature.title}>
                            <div className="feature-icon">
                                <i className={`fa-solid ${feature.icon}`}></i>
                            </div>

                            <h3>{feature.title}</h3>
                            <p>{feature.text}</p>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}

export default Features;
