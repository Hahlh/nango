import type { Timestamps } from './Generic.js';

export interface EnvironmentVariable extends Timestamps {
    id?: number;
    name: string;
    value: string;
    environment_id: number;
    value_iv?: string | null;
    value_tag?: string | null;
}
