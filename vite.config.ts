/// <reference types="vitest" />

// Configure Vitest (https://vitest.dev/config/)

import { defineConfig } from 'vite';

export default defineConfig({
    test: {
        include: ['**/*.unit.{test,spec}.?(c|m)[jt]s?(x)']
    }
});
