import stationCoordinates from "./stationCordinates";

/*
 * ----------------------------------------------------------------------
 * Shared rail corridors
 * ----------------------------------------------------------------------
 * This is the "permanent" piece of the fix. Instead of hand-maintaining a
 * full coordinate path per train number, we maintain corridors keyed by
 * the two station CODES at either end of a hop (e.g. "ADI -> KOTA").
 *
 * Any train whose stop list contains that consecutive pair automatically
 * gets the correct in-between shape points for that hop, whether or not
 * the train itself stops there. No train-specific data entry required.
 *
 * - Stations the train actually halts at -> rendered as markers/pins
 *   (handled in TrainRouteMap.js using the train's own `route` prop —
 *   unrelated to this file).
 * - Points listed here as `waypoints` -> NEVER rendered as a marker.
 *   They only exist to bend the polyline so it follows the real track
 *   instead of cutting a straight (or worse, an over-curved bezier)
 *   chord between two stops that may be hundreds of km apart.
 *
 * To extend coverage for a new corridor: add one `segment(...)` entry.
 * To fix/refine an existing corridor: edit its `waypoints` array. Every
 * train that uses that station pair benefits immediately, automatically.
 *
 * NOTE: the waypoint lat/lngs below are reasonable approximations of the
 * real alignment for demonstration purposes. For production-grade
 * accuracy, replace them with real trackside coordinates (e.g. sampled
 * from OpenRailwayMap / an Indian Railways track GeoJSON).
 * ----------------------------------------------------------------------
 */

const segment = (fromCode, toCode, waypoints = []) => ({
    from: fromCode,
    to: toCode,
    waypoints
});

const CORRIDOR_LIST = [
    // --- Mumbai suburban stretch ---
    segment("MMCT", "BVI", [
        { lat: 19.0544, lng: 72.8402 }, // Dadar/Bandra belt
        { lat: 19.1197, lng: 72.8468 }  // Andheri belt
    ]),
    segment("CSMT", "MMCT", [
        { lat: 18.9550, lng: 72.8270 }
    ]),

    // --- Western line: Mumbai -> Ahmedabad ---
    segment("BVI", "VAPI", [
        { lat: 19.4520, lng: 72.8100 }, // Virar
        { lat: 19.9975, lng: 72.7858 }  // Boisar/Umbergaon belt
    ]),
    segment("VAPI", "BL", []),
    segment("BL", "BIM", []),
    segment("BIM", "AML", []),
    segment("AML", "ACL", []),
    segment("ACL", "NVS", []),
    segment("NVS", "ST", []),
    segment("ST", "BH", [
        { lat: 21.4453, lng: 72.9628 } // crossing the Tapi/Narmada belt
    ]),
    segment("BH", "BRC", [
        { lat: 22.0184, lng: 73.0961 }
    ]),
    segment("BRC", "ANND", []),
    segment("ANND", "ND", []),
    segment("ND", "ADI", [
        { lat: 22.8908, lng: 72.7273 }
    ]),

    // --- Ahmedabad -> Delhi, via Kota ---
    segment("ADI", "KOTA", [
        { lat: 23.6850, lng: 73.6320 }, // Himmatnagar / Shamlaji belt
        { lat: 24.3540, lng: 74.4280 }, // near Chittorgarh
        { lat: 24.8800, lng: 75.1500 }  // Bhilwara / Bundi belt
    ]),
    segment("KOTA", "NZM", [
        { lat: 26.2389, lng: 76.1840 }, // Sawai Madhopur
        { lat: 27.1700, lng: 76.6300 }  // Bharatpur belt
    ]),

    // --- Deccan line: Mumbai -> Pune ---
    segment("CSMT", "PUNE", [
        { lat: 18.7480, lng: 73.3870 } // Lonavala ghat section
    ]),
    segment("MMCT", "PUNE", [
        { lat: 18.9990, lng: 73.1190 },
        { lat: 18.7480, lng: 73.3870 }
    ]),

    // --- Pune -> Chennai trunk ---
    segment("PUNE", "SUR", [
        { lat: 18.1390, lng: 74.6100 } // Daund belt
    ]),
    segment("SUR", "WADI", []),
    segment("WADI", "RC", []),
    segment("RC", "GTL", []),
    segment("GTL", "RU", [
        { lat: 14.4530, lng: 78.8240 } // Anantapur / Dharmavaram belt
    ]),
    segment("RU", "MAS", [
        { lat: 13.2270, lng: 79.9970 } // Arakkonam belt
    ])
];

// Build a bidirectional lookup so a corridor declared once works for
// trains travelling either direction: "FROM|TO" -> ordered waypoints.
const CORRIDOR_MAP = new Map();
CORRIDOR_LIST.forEach(({ from, to, waypoints }) => {
    CORRIDOR_MAP.set(`${from}|${to}`, waypoints);
    CORRIDOR_MAP.set(`${to}|${from}`, [...waypoints].reverse());
});

/**
 * Given the ordered list of station codes a train actually halts at,
 * returns the full ordered [lat, lng] path for the route line: every
 * stop's own coordinate, plus any known shaping waypoints in between.
 *
 * The result is meant to be drawn as a plain straight-segment polyline
 * (no curve fitting) — pass-through points just bend the line where the
 * real track bends; halts get their own marker rendered separately.
 */
export function buildRoutePath(stopCodes) {
    const path = [];

    stopCodes.forEach((code, index) => {
        const station = stationCoordinates[code];
        if (!station) return;

        if (path.length === 0) {
            path.push([station.lat, station.lng]);
            return;
        }

        const prevCode = stopCodes[index - 1];
        const between = CORRIDOR_MAP.get(`${prevCode}|${code}`) || [];
        between.forEach((point) => path.push([point.lat, point.lng]));
        path.push([station.lat, station.lng]);
    });

    return path;
}

export default buildRoutePath;