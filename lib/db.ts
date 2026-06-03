import { blink } from './blink';

// Cast to any to bypass TypeScript BlinkDatabase type — tables are valid at runtime
export const db = blink.db as any;
