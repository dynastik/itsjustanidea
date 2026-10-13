// Shared zone constants (city vs highway) and the city -> highway handoff timings.
export const HIGHWAY_ZONE_Z = 80;
export const ZONE_HYSTERESIS = 10; // the on-ramp trigger line is painted at HIGHWAY_ZONE_Z + ZONE_HYSTERESIS

// Handoff: crossing the line switches WASD -> typing, but never abruptly.
export const HANDOFF_SPEED_S = 4;     // seconds over which the speed you carried in eases down to what your typing earns
export const HANDOFF_UI_FADE_S = 1.5; // seconds for the typing panel to fade in

// City district continues around the elevated crossing; the gameplay handoff remains at z=90.
export const CITY_Z_MIN = -220;
export const CITY_Z_MAX = 270;
export const CITY_BAY_WIDTH = 2.8;   // parking bay beside the road
export const CITY_WALK_WIDTH = 3.6;  // sidewalk beyond the bay