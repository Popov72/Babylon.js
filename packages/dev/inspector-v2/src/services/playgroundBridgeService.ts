import type { IService } from "../modularity/serviceDefinition";

/**
 * The unique identity symbol for the playground bridge service.
 */
export const PlaygroundBridgeIdentity = Symbol("PlaygroundBridge");

/**
 * Provides a communication bridge between the Inspector and the Playground editor.
 * This service is only available when the Inspector is opened from the Playground.
 * Extensions should consume it optionally and gracefully handle its absence.
 */
export interface IPlaygroundBridge extends IService<typeof PlaygroundBridgeIdentity> {
    /**
     * Adds a new file tab to the Playground editor with the given content.
     * If a file with the same path already exists, its content is updated.
     * @param path The file path (e.g. "retargeting.ts")
     * @param content The file content
     */
    addFileTab(path: string, content: string): void;

    /**
     * Returns the content of a file, or undefined if it doesn't exist.
     * @param path The file path
     */
    getFileContent(path: string): string | undefined;

    /**
     * Returns the entry file path (e.g. "index.ts" or "index.js").
     */
    getEntryFilePath(): string;
}
