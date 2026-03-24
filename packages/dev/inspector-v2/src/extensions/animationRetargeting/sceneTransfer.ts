import type { Nullable } from "core/types";
import type { Scene } from "core/scene";
import type { Node } from "core/node";
import type { Skeleton } from "core/Bones/skeleton";
import type { Material } from "core/Materials/material";

import { AbstractMesh } from "core/Meshes/abstractMesh";

/**
 * Manages the temporary transfer of nodes from a source scene (e.g. the PG scene) into a
 * target scene (the retargeting scene). Patches `_scene` and pushes into scene arrays
 * directly to avoid observable side effects. On restore, reverts all changes so the
 * source scene is left untouched.
 */
export class SceneTransfer {
    private _sourceScene: Nullable<Scene> = null;
    private _targetScene: Nullable<Scene> = null;
    private _allNodes: Node[] = [];
    private _meshes: Array<{ mesh: AbstractMesh; originalLayerMask: number }> = [];
    private _skeletons: Skeleton[] = [];
    private _materials: Material[] = [];
    private _rootOriginalName = "";

    /** True when nodes have been transferred and not yet restored. */
    public get isActive(): boolean {
        return this._sourceScene !== null;
    }

    /** The transferred meshes (with their saved original layer masks). */
    public get movedMeshes(): ReadonlyArray<{ mesh: AbstractMesh; originalLayerMask: number }> {
        return this._meshes;
    }

    /**
     * Temporarily restores all nodes to the source scene, executes the callback,
     * then re-transfers them to the target scene. Useful when the source scene
     * needs to be serialized or inspected while nodes are borrowed.
     * @param callback - The callback to execute while nodes are restored.
     * @returns The result of the callback.
     */
    public async withRestoredSourceAsync<T>(callback: () => T | Promise<T>): Promise<T> {
        if (!this._sourceScene || !this._targetScene) {
            return await callback();
        }
        const source = this._sourceScene;
        const target = this._targetScene;
        const rootName = this._rootOriginalName;

        // Save the current (retargeting) layer masks before restoring
        const currentLayerMasks = new Map<AbstractMesh, number>();
        for (const { mesh } of this._meshes) {
            currentLayerMasks.set(mesh, mesh.layerMask);
        }

        // Temporarily restore
        this._restoreInternal();

        try {
            return await callback();
        } finally {
            // Re-transfer (restore cleared all state, so re-run transfer)
            const sourceRoot = source.getMeshByName(rootName);
            if (sourceRoot) {
                this.transfer(source, target, rootName);
                // Re-apply the retargeting layer masks (not the original PG ones)
                for (const { mesh } of this._meshes) {
                    const savedMask = currentLayerMasks.get(mesh);
                    if (savedMask !== undefined) {
                        mesh.layerMask = savedMask;
                    }
                }
                // Re-apply avatar name (transfer saves the original name)
                sourceRoot.name = "avatar";
            }
        }
    }

    /**
     * Transfers a node hierarchy from `sourceScene` into `targetScene`.
     * The root node is looked up by name in the source scene.
     * @param sourceScene - The source scene to transfer from.
     * @param targetScene - The target scene to transfer into.
     * @param rootNodeName - The name of the root node to transfer.
     * @returns The root mesh, or null if not found.
     */
    public transfer(sourceScene: Scene, targetScene: Scene, rootNodeName: string): Nullable<AbstractMesh> {
        this.restore();

        const sourceRoot = sourceScene.getMeshByName(rootNodeName);
        if (!sourceRoot) {
            return null;
        }

        this._sourceScene = sourceScene;
        this._targetScene = targetScene;
        this._rootOriginalName = sourceRoot.name;

        // Patch _scene on the root and all descendants, and push meshes/skeletons
        // directly into the target scene arrays. We avoid addMesh/addTransformNode
        // to prevent side effects (observable notifications, index bookkeeping issues).
        const allNodes = [sourceRoot as Node, ...sourceRoot.getDescendants(false)];
        for (const node of allNodes) {
            node._scene = targetScene;
            this._allNodes.push(node);
            if (node instanceof AbstractMesh) {
                this._meshes.push({ mesh: node, originalLayerMask: node.layerMask });
                targetScene.meshes.push(node);
                node._resyncLightSources();
            }
        }

        // Push skeletons into the target scene and patch their _scene
        for (const { mesh } of this._meshes) {
            if (mesh.skeleton && !this._skeletons.includes(mesh.skeleton)) {
                this._skeletons.push(mesh.skeleton);
                (mesh.skeleton as any)._scene = targetScene;
                targetScene.skeletons.push(mesh.skeleton);
            }
        }

        // Patch _scene on materials
        for (const { mesh } of this._meshes) {
            if (mesh.material && !this._materials.includes(mesh.material)) {
                this._materials.push(mesh.material);
                (mesh.material as any)._scene = targetScene;
            }
        }

        return sourceRoot;
    }

    /**
     * Restores all transferred nodes back to the source scene.
     * Reverts `_scene`, layer masks, and removes entries from the target scene arrays.
     */
    public restore(): void {
        this._restoreInternal();
    }

    private _restoreInternal(): void {
        if (!this._sourceScene || !this._targetScene) {
            return;
        }

        // Restore original root name
        if (this._meshes.length > 0) {
            this._meshes[0].mesh.name = this._rootOriginalName;
        }

        // Build sets for fast lookup
        const meshSet = new Set(this._meshes.map((m) => m.mesh));
        const skeletonSet = new Set(this._skeletons);

        // Filter borrowed entries out of the target scene arrays
        this._targetScene.meshes = this._targetScene.meshes.filter((m) => !meshSet.has(m));
        this._targetScene.skeletons = this._targetScene.skeletons.filter((s) => !skeletonSet.has(s));

        // Restore _scene and layer masks on all borrowed nodes
        for (const node of this._allNodes) {
            node._scene = this._sourceScene;
        }
        for (const { mesh, originalLayerMask } of this._meshes) {
            mesh.layerMask = originalLayerMask;
        }
        for (const skeleton of this._skeletons) {
            (skeleton as any)._scene = this._sourceScene;
        }
        for (const material of this._materials) {
            (material as any)._scene = this._sourceScene;
        }

        this._sourceScene = null;
        this._targetScene = null;
        this._allNodes = [];
        this._meshes = [];
        this._skeletons = [];
        this._materials = [];
        this._rootOriginalName = "";
    }
}
