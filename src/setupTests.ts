import '@testing-library/jest-dom';
import { vi } from 'vitest';
import React from 'react';

// Mock Tauri invoke
global.window.__TAURI__ = {
    core: {
        invoke: vi.fn().mockImplementation((cmd) => {
            console.log(`Mock invoke: ${cmd}`);
            return Promise.resolve([]);
        })
    }
} as any;

// Mock ReponsiveContainer from Recharts to render children directly
// Recharts uses ResizeObserver which fails in jsdom
vi.mock('recharts', async () => {
    const OriginalModule = await vi.importActual('recharts');
    return {
        ...OriginalModule,
        ResponsiveContainer: ({ children }: any) => React.createElement('div', { className: "recharts-responsive-container" }, children),
    };
});
