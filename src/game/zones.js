// Shared zone constants (city vs highway) and the city -> highway handoff timings.
export const HIGHWAY_ZONE_Z = 80;
export const ZONE_HYSTERESIS = 10; // the on-ramp trigger line is painted at HIGHWAY_ZONE_Z + ZONE_HYSTERESIS

// Handoff: crossing the line switches WASD -> typing, but never abruptly.
export const HANDOFF_SPEED_S = 4;     // seconds over which the speed you carried in eases down to what your typing earns
export const HANDOFF_UI_FADE_S = 1.5; // seconds for the typing panel to fade in
