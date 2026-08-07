/**
 * Build-time configuration.
 *
 * Isolated in its own module because Vite statically replaces
 * `import.meta.env.VITE_*` at build time — keeping those reads here means every
 * other module stays plain JavaScript that Node can import directly in tests.
 */

export const BUILD_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

export const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || undefined;
