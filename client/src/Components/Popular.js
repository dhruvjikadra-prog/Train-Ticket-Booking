import "../Styles/Popular.css";

function PopularRoutes() {
    const routes = [
        {
            from: "Mumbai Central",
            to: "New Delhi",
            trains: "18 trains",
            duration: "15h 40m",
            fare: "Rs. 2,325"
        },
        {
            from: "Surat",
            to: "Ahmedabad",
            trains: "24 trains",
            duration: "4h 05m",
            fare: "Rs. 245"
        },
        {
            from: "Chennai Central",
            to: "Bengaluru City",
            trains: "16 trains",
            duration: "5h 55m",
            fare: "Rs. 520"
        },
        {
            from: "Howrah Junction",
            to: "Patna Junction",
            trains: "12 trains",
            duration: "8h 20m",
            fare: "Rs. 410"
        }
    ];

    return (
        <section className="popular-section">
            <div className="container">
                <div className="section-heading">
                    <span>Popular Routes</span>
                    <h2>Journeys Passengers Book Most</h2>
                    <p>Explore frequently travelled city pairs with quick timing and fare snapshots.</p>
                </div>

                <div className="popular-grid">
                    {routes.map((route) => (
                        <article className="route-card" key={`${route.from}-${route.to}`}>
                            <div className="route-icon">
                                <i className="fa-solid fa-train-subway"></i>
                            </div>

                            <div className="route-cities">
                                <strong>{route.from}</strong>
                                <span>
                                    <i className="fa-solid fa-arrow-right-long"></i>
                                </span>
                                <strong>{route.to}</strong>
                            </div>

                            <div className="route-meta">
                                <div>
                                    <i className="fa-solid fa-clock"></i>
                                    {route.duration}
                                </div>
                                <div>
                                    <i className="fa-solid fa-ticket"></i>
                                    {route.trains}
                                </div>
                            </div>

                            <div className="route-footer">
                                <span>From {route.fare}</span>
                                <button type="button" aria-label={`View trains from ${route.from} to ${route.to}`}>
                                    <i className="fa-solid fa-arrow-right"></i>
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}

export default PopularRoutes;
