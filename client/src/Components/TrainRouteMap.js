import React, { useEffect, useMemo, useState } from "react";
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Polyline,
    useMap
} from "react-leaflet";
import axios from "axios";
import { API_BASE_URL } from "../config/api";

import "../Styles/TrainRouteMap.css";
import L from "leaflet";

import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";


/* ----------------------------- marker icons ----------------------------- */
/*
 * Built with L.divIcon instead of image markers so they inherit the app's
 * theme via CSS (see .trm-pin-* rules in TrainRouteMap.css) instead of
 * shipping separate marker art.
 */

const makePinIcon = (variant) =>
    L.divIcon({
        className: "trm-pin-wrap",
        html: `<span class="trm-pin trm-pin-${variant}"></span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -14]
    });

const ORIGIN_ICON = makePinIcon("origin");
const DEST_ICON = makePinIcon("dest");
const STOP_ICON = makePinIcon("stop");

const LIVE_TRAIN_ICON = L.divIcon({
    className: "trm-pin-wrap",
    html: `
        <span class="trm-live-marker">
            <span class="trm-live-ring"></span>
            <span class="trm-live-core"><i class="fa-solid fa-train"></i></span>
        </span>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22]
});

/* --------------------------- helper components --------------------------- */

// Keeps the map framed around the current route. Runs inside MapContainer
// so it can reach the Leaflet map instance via useMap().
function FitRouteBounds({ positions }) {
    const map = useMap();

    useEffect(() => {
        if (!positions.length) return;

        if (positions.length === 1) {
            map.setView(positions[0], 11);
            return;
        }

        const bounds = L.latLngBounds(positions);
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 12 });
    }, [positions, map]);

    return null;
}

// Linear interpolation between two points, used to place the "live train"
// marker somewhere along the current leg rather than snapping it straight
// to a station.
function interpolatePosition(from, to, progress) {
    if (!from || !to) return null;
    const lat = from.lat + (to.lat - from.lat) * progress;
    const lng = from.lng + (to.lng - from.lng) * progress;
    return [lat, lng];
}

function StopPopupContent({ station, isOrigin, isDestination }) {
    const tag = isOrigin ? "Origin" : isDestination ? "Destination" : "Stop";

    return (
        <div className="trm-popup-inner">
            <div className={`trm-popup-tag trm-popup-tag-${tag.toLowerCase()}`}>{tag}</div>

            <div className="trm-popup-title">
                {station.stationName}
                <span className="trm-popup-code">{station.stationCode}</span>
            </div>

            <div className="trm-popup-grid">
                <div className="trm-popup-cell">
                    <span className="trm-popup-label">
                        <i className="fa-solid fa-right-to-bracket"></i> Arrival
                    </span>
                    <span className="trm-popup-value">{station.arrivalTime || "—"}</span>
                </div>

                <div className="trm-popup-cell">
                    <span className="trm-popup-label">
                        <i className="fa-solid fa-right-from-bracket"></i> Departure
                    </span>
                    <span className="trm-popup-value">{station.departureTime || "—"}</span>
                </div>
            </div>

            <div className="trm-popup-distance">
                <i className="fa-solid fa-road"></i>
                {station.distance ?? "—"} km from origin
            </div>
        </div>
    );
}

function StatusPanel({ icon, title, message, spin }) {
    return (
        <div className="trm-shell">
            <div className="trm-empty">
                <div className="trm-empty-icon">
                    <i className={`fa-solid ${icon}${spin ? " fa-spin" : ""}`}></i>
                </div>
                <h4>{title}</h4>
                {message && <p>{message}</p>}
            </div>
        </div>
    );
}

/* -------------------------------- main -------------------------------- */

function TrainRouteMap({ route = [], trainNumber, liveInfo = null }) {
    // status: "loading" | "ready" | "empty" | "error"
    const [status, setStatus] = useState("loading");
    const [errorMessage, setErrorMessage] = useState("");
    const [routeMapPoints, setRouteMapPoints] = useState([]);
    const [polylinePoints, setPolylinePoints] = useState([]);

    // This component only ever mounts while the route-map modal is open
    // (TrainSchedule.js renders it inside `{showRouteMap && (...)}`), so
    // this fetch naturally fires "when show map" and never on a normal
    // page load. No coordinates are bundled in the frontend anymore --
    // everything comes from the TrainRouteMap collection via this call.
    useEffect(() => {
        if (!trainNumber) {
            setStatus("empty");
            return;
        }

        let active = true;
        setStatus("loading");
        setErrorMessage("");

        axios
            .get(`${API_BASE_URL}/train-route-map/${trainNumber}`)
            .then((res) => {
                if (!active) return;
                const routeData = res.data?.route;

                if (!routeData) {
                    setRouteMapPoints([]);
                    setStatus("empty");
                    return;
                }

                const points = routeData.stations.map((station, index) => ({
                    sequence: index + 1,
                    stationCode: station.code,
                    stationName: station.name,
                    lat: station.lat,
                    lng: station.lng
                }));

                setRouteMapPoints(points);
                setStatus(points.length ? "ready" : "empty");
                setPolylinePoints(
                    (routeData.polyline || []).map(point => [point[0], point[1]])
                );
            })
            .catch((err) => {
                if (!active) return;
                setRouteMapPoints([]);
                if (err.response?.status === 404) {
                    setStatus("empty");
                } else {
                    setStatus("error");
                    setErrorMessage(
                        err.response?.data?.message ||
                        "Couldn't load the route map for this train."
                    );
                }
            });

        return () => {
            active = false;
        };
    }, [trainNumber]);

    // Quick lookup of this train's own schedule info (arrival/departure/
    // distance/halt) per station code, for the stop popups.
    const scheduleByCode = useMemo(() => {
        const map = new Map();
        route.forEach((stop) => map.set(stop.stationCode, stop));
        return map;
    }, [route]);

    // Only points the API flagged isStop:true get a marker. Their
    // popup details are merged in from the train's own schedule.
    const stopMarkers = useMemo(() => {

        return route
            .map((stop) => {

                const point = routeMapPoints.find(
                    (p) => p.stationCode === stop.stationCode
                );

                if (!point) return null;

                return {
                    ...point,
                    ...stop
                };

            })
            .filter(Boolean);

    }, [route, routeMapPoints]);

    const positions = useMemo(
        () => stopMarkers.map((stop) => [stop.lat, stop.lng]),
        [stopMarkers]
    );

    // The full line: every point in sequence order, stops and
    // pass-through shaping points alike, joined as plain straight
    // segments -- no curve-fitting that could pull it off a real point.
    const polylinePositions = useMemo(() => {
        return polylinePoints.length
            ? polylinePoints
            : routeMapPoints.map(p => [p.lat, p.lng]);
    }, [polylinePoints, routeMapPoints]);

    const liveMarkerPosition = useMemo(() => {
        if (!liveInfo || liveInfo.status !== "running") return null;

        const from = stopMarkers.find(
            (s) => s.stopNumber === liveInfo.fromStop?.stopNumber
        );
        const to = stopMarkers.find(
            (s) => s.stopNumber === liveInfo.toStop?.stopNumber
        );

        if (!from || !to) return null;
        return interpolatePosition(from, to, liveInfo.progress ?? 0);
    }, [stopMarkers, liveInfo]);

    if (status === "loading") {
        return (
            <StatusPanel
                icon="fa-circle-notch"
                spin
                title="Loading route map…"
            />
        );
    }

    if (status === "error") {
        return (
            <StatusPanel
                icon="fa-triangle-exclamation"
                title="Couldn't load the map"
                message={errorMessage}
            />
        );
    }

    if (status === "empty" || !positions.length) {
        return (
            <StatusPanel
                icon="fa-map-location-dot"
                title="No map data available"
                message="We don't have a stored route map for this train yet."
            />
        );
    }

    return (
        <div className="trm-shell">
            <MapContainer
                center={positions[0]}
                zoom={7}
                scrollWheelZoom={true}
                className="trm-map"
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
                />
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
                />

                <FitRouteBounds positions={positions} />

                {/* soft glow underlay for the route line */}
                <Polyline
                    positions={polylinePositions}
                    pathOptions={{
                        className: "trm-route-glow"
                    }}
                />

                <Polyline
                    positions={polylinePositions}
                    pathOptions={{
                        className: "trm-route-line"
                    }}
                />

                {stopMarkers.map((station, index) => {
                    const isOrigin = index === 0;
                    const isDestination = index === stopMarkers.length - 1;
                    const icon = isOrigin
                        ? ORIGIN_ICON
                        : isDestination
                            ? DEST_ICON
                            : STOP_ICON;

                    return (
                        <Marker
                            key={station.stationCode}
                            position={[station.lat, station.lng]}
                            icon={icon}
                        >
                            <Popup className="trm-popup" closeButton={false}>
                                <StopPopupContent
                                    station={station}
                                    isOrigin={isOrigin}
                                    isDestination={isDestination}
                                />
                            </Popup>
                        </Marker>
                    );
                })}

                {liveMarkerPosition && (
                    <Marker position={liveMarkerPosition} icon={LIVE_TRAIN_ICON} zIndexOffset={1000}>
                        <Popup className="trm-popup" closeButton={false}>
                            <div className="trm-popup-inner trm-popup-live">
                                <div className="trm-popup-tag trm-popup-tag-live">
                                    <i className="fa-solid fa-circle trm-live-dot"></i> Live
                                </div>
                                <div className="trm-popup-title">On the move</div>
                                <p>
                                    Heading to <strong>{liveInfo.toStop?.stationName}</strong>
                                </p>
                            </div>
                        </Popup>
                    </Marker>
                )}
            </MapContainer>

            <div className="trm-legend">
                <span><i className="trm-legend-dot trm-legend-origin"></i> Origin</span>
                <span><i className="trm-legend-dot trm-legend-stop"></i> Stop</span>
                <span><i className="trm-legend-dot trm-legend-dest"></i> Destination</span>
                {liveMarkerPosition && (
                    <span><i className="trm-legend-dot trm-legend-live"></i> Live position</span>
                )}
            </div>
        </div>
    );
}

export default TrainRouteMap;