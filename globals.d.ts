// Ambient declarations for side-effect style imports under strict TypeScript.
// Next 15's next-env.d.ts no longer declares these, so `import './styles.css'`
// fails type-checking without this. See docs/ADR-001-cloudflare.md.
declare module '*.css'
declare module '*.scss'
// Package CSS subpath exports imported for side effects (Payload admin styles).
declare module '@payloadcms/next/css'
