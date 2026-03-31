import { type Nullable } from "core/types";
import { type IRetargetOptions } from "core/Animations/animatorAvatar";
import { type Engine } from "core/Engines/engine";

import { ArcRotateCamera } from "core/Cameras/arcRotateCamera";
import { Vector3 } from "core/Maths/math.vector";
import { DirectionalLight } from "core/Lights/directionalLight";
import { ShadowGenerator } from "core/Lights/Shadows/shadowGenerator";
import { ShadowOnlyMaterial } from "materials/shadowOnly/shadowOnlyMaterial";
import { GridMaterial } from "materials/grid/gridMaterial";
import { MeshBuilder } from "core/Meshes/meshBuilder";
import { Observable } from "core/Misc/observable";
import { Logger } from "core/Misc/logger";
import { PointerEventTypes } from "core/Events/pointerEvents";
import { CubeTexture } from "core/Materials/Textures/cubeTexture";
import { Scene } from "core/scene";

import { Avatar } from "./avatar";
import { AnimationSource } from "./animation";
import { HTMLConsole } from "./htmlConsole";
import { type NamingSchemeManager } from "./namingSchemeManager";
import { type AvatarManager, type RestPoseDataUpdate } from "./avatarManager";
import { type AnimationManager } from "./animationManager";
import { SaveSnippet, TestPlaygroundCode, ExportToSceneCode, ExportToSceneHeader, ExportToSceneHelpersCode } from "./helperFunctions";

export type { GizmoType } from "./avatar";

/**
 *
 */
export interface IRetargetingParams {
    // Avatar
    /**
     *
     */
    avatarName: string;
    /**
     *
     */
    avatarRescaleAvatar: boolean;
    /**
     *
     */
    avatarAnimSpeed: number;
    // Animation
    /**
     *
     */
    animationName: string;
    /**
     *
     */
    animationSpeed: number;
    // Retarget
    /**
     *
     */
    fixAnimations: boolean;
    /**
     *
     */
    checkHierarchy: boolean;
    /**
     *
     */
    retargetAnimationKeys: boolean;
    /**
     *
     */
    fixRootPosition: boolean;
    /**
     *
     */
    fixGroundReference: boolean;
    /**
     *
     */
    fixGroundReferenceDynamicRefNode: boolean;
    /**
     *
     */
    rootNodeName: string;
    /**
     *
     */
    groundReferenceNodeName: string;
    /**
     *
     */
    groundReferenceVerticalAxis: "" | "X" | "Y" | "Z";
}

const Camera1LayerMask = 0x1fffffff;
const Camera2LayerMask = 0x2fffffff;
const SharedLayerMask = 0x30000000;
const ShadowLayerMask1 = 0x10000000;
const ShadowLayerMask2 = 0x20000000;

/**
 *
 */
export class RetargetingSceneManager {
    private _engine: Nullable<Engine> = null;
    private _scene: Nullable<Scene> = null;
    private _savedRenderLoops: Array<() => void> = [];

    /**
     *
     */
    public avatar: Nullable<Avatar> = null;
    /**
     *
     */
    public animationSource: Nullable<AnimationSource> = null;
    /**
     *
     */
    public htmlConsole!: HTMLConsole;

    private _retargetOptions: Nullable<IRetargetOptions> = null;
    private _lastRetargetParams: Nullable<IRetargetingParams> = null;
    private _lastAvatarRestPose: RestPoseDataUpdate | undefined;
    private _lastAnimationRestPose: RestPoseDataUpdate | undefined;
    private _isRetargeted = false;

    /**
     *
     */
    public readonly onRetargetDoneObservable = new Observable<void>();

    public get isRetargeted(): boolean {
        return this._isRetargeted;
    }

    public get scene(): Nullable<Scene> {
        return this._scene;
    }

    public constructor() {}

    public initialize(engine: Engine): void {
        this._engine = engine;

        // Save and clear existing render loops so we can run our own
        this._savedRenderLoops = [...(engine as any)._activeRenderLoops];
        engine.stopRenderLoop();

        this.htmlConsole = new HTMLConsole();
        this._scene = new Scene(this._engine);

        // Remove the retargeting scene from the engine's scenes list so it won't
        // be auto-disposed when the engine is disposed (e.g. PG Play button).
        // We manage the scene lifecycle ourselves in dispose().
        const idx = this._engine.scenes.indexOf(this._scene);
        if (idx !== -1) {
            this._engine.scenes.splice(idx, 1);
        }

        this._scene.environmentTexture = CubeTexture.CreateFromPrefilteredData("https://playground.babylonjs.com/textures/environment.env", this._scene);

        const camera1 = new ArcRotateCamera("camera1", 1.57, Math.PI / 2.2, 11.5, new Vector3(0, 0.8, 0), this._scene);
        camera1.wheelPrecision = 50;
        camera1.layerMask = Camera1LayerMask;
        camera1.minZ = 0.02;
        camera1.viewport.width = 0.5;
        camera1.attachControl(true);

        const camera2 = camera1.clone("camera2") as ArcRotateCamera;
        camera2.wheelPrecision = 50;
        camera2.layerMask = Camera2LayerMask;
        camera2.minZ = 0.02;
        camera2.viewport.x = 0.5;
        camera2.viewport.width = 0.5;
        camera2.attachControl(true);

        this._scene.activeCameras = [camera1, camera2];

        // Shadow-only ground planes (left / right)
        const sm = new ShadowOnlyMaterial("shadowMat", this._scene);
        const groundShadow1 = MeshBuilder.CreateGround("groundShadow1", { width: 40, height: 40 }, this._scene);
        groundShadow1.position.y = 0.01;
        groundShadow1.material = sm;
        groundShadow1.receiveShadows = true;
        groundShadow1.layerMask = ShadowLayerMask1;

        const groundShadow2 = MeshBuilder.CreateGround("groundShadow2", { width: 40, height: 40 }, this._scene);
        groundShadow2.position.y = 0.01;
        groundShadow2.material = sm;
        groundShadow2.receiveShadows = true;
        groundShadow2.layerMask = ShadowLayerMask2;

        // Shared grid ground
        const gridMaterial = new GridMaterial("grid", this._scene);
        gridMaterial.mainColor.setAll(0.7);
        gridMaterial.lineColor.setAll(0.2);
        gridMaterial.gridRatio = 0.4;
        gridMaterial.majorUnitFrequency = 1000;
        const ground = MeshBuilder.CreateGround("ground", { width: 40, height: 40 }, this._scene);
        ground.material = gridMaterial;
        ground.layerMask = SharedLayerMask;

        // Directional lights (one per viewport)
        const light1 = new DirectionalLight("dirLight1", new Vector3(-1, -4, -2), this._scene);
        light1.shadowMaxZ = 7;
        light1.autoUpdateExtends = false;
        light1.orthoLeft = -1.1;
        light1.orthoRight = 5;
        light1.orthoBottom = -3;
        light1.orthoTop = 4;
        light1.includeOnlyWithLayerMask = Camera1LayerMask;

        const light2 = light1.clone("dirLight2") as DirectionalLight;
        light2.includeOnlyWithLayerMask = Camera2LayerMask;

        const shadowGen1 = new ShadowGenerator(2048, light1);
        shadowGen1.usePercentageCloserFiltering = true;
        shadowGen1.getShadowMap()!.activeCamera = camera1;
        shadowGen1.bias = 0.01;

        const shadowGen2 = new ShadowGenerator(2048, light2);
        shadowGen2.usePercentageCloserFiltering = true;
        shadowGen2.getShadowMap()!.activeCamera = camera2;
        shadowGen2.bias = 0.01;

        // Create Avatar and AnimationSource (separate classes)
        this.avatar = new Avatar(this._scene, camera1, shadowGen1);
        this.animationSource = new AnimationSource(this._scene, camera2, shadowGen2);

        // Delegate bone-click picking to the correct half of the split viewport.
        this._scene.onPointerObservable.add((pointerInfo) => {
            if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
                const x = this._scene!.pointerX;
                const halfWidth = this._engine!.getRenderWidth() / 2;
                if (x <= halfWidth) {
                    this.avatar?.handleBoneClick(x, this._scene!.pointerY);
                } else {
                    this.animationSource?.handleBoneClick(x, this._scene!.pointerY);
                }
            }
        });

        this._engine.runRenderLoop(() => this._scene?.render());
    }

    public retarget(params: IRetargetingParams, namingSchemeManager: NamingSchemeManager, avatarManager: AvatarManager, animationManager: AnimationManager): void {
        const { avatar, animationSource } = this;
        if (!avatar?.animatorAvatar || !animationSource?.animationGroup) {
            return;
        }

        const storedAvatar = avatarManager.getAvatar(params.avatarName);
        const storedAnimation = animationManager.getByDisplayName(params.animationName)?.entry;
        const sourceScheme = storedAnimation?.namingScheme;
        const targetScheme = storedAvatar?.namingScheme;
        if (!sourceScheme || !targetScheme) {
            return;
        }

        this._lastRetargetParams = params;
        this._lastAvatarRestPose = storedAvatar?.restPoseUpdate;
        this._lastAnimationRestPose = storedAnimation?.restPoseUpdate;

        avatar.prepareRetargeting();
        animationSource.prepareRetargeting();

        this._retargetOptions = {
            animationGroupName: "avatar",
            fixAnimations: params.fixAnimations,
            checkHierarchy: params.checkHierarchy,
            retargetAnimationKeys: params.retargetAnimationKeys,
            fixRootPosition: params.fixRootPosition,
            fixGroundReference: params.fixGroundReference,
            fixGroundReferenceDynamicRefNode: params.fixGroundReferenceDynamicRefNode,
            rootNodeName: params.rootNodeName === "Auto" ? "" : params.rootNodeName,
            groundReferenceNodeName: params.groundReferenceNodeName,
            groundReferenceVerticalAxis: params.groundReferenceVerticalAxis,
            mapNodeNames: namingSchemeManager.getRemapping(sourceScheme, targetScheme),
        };

        const retargetedGroup = avatar.animatorAvatar.retargetAnimationGroup(animationSource.animationGroup, this._retargetOptions);

        this._isRetargeted = true;
        avatar.setRetargetedAnimation(retargetedGroup, params.avatarAnimSpeed);
        animationSource.play(params.animationSpeed);

        this.onRetargetDoneObservable.notifyObservers();
    }

    /**
     * Generates retargeting code for "Export to Scene".
     * Returns an object with helpers code and main function code, or null if not ready.
     * For file-based entries, converts them to base64 data URLs.
     * @param avatarManager - The avatar manager.
     * @param animationManager - The animation manager.
     * @param functionName - The name for the generated function.
     * @returns Object with code strings, or null if not ready.
     */
    public async generateRetargetingCodeAsync(
        avatarManager: AvatarManager,
        animationManager: AnimationManager,
        functionName: string
    ): Promise<{
        /**
         *
         */
        helpersCode: string /**
         *
         */;
        headerCode: string /**
         *
         */;
        functionCode: string /**
         *
         */;
        functionName: string;
    } | null> {
        if (!this._isRetargeted || !this._retargetOptions || !this._lastRetargetParams || !this.avatar || !this.animationSource) {
            return null;
        }

        const params = this._lastRetargetParams;
        const storedAvatar = avatarManager.getAvatar(params.avatarName);
        const result = animationManager.getByDisplayName(params.animationName);
        if (!storedAvatar || !result) {
            return null;
        }
        const storedAnimation = result.entry;
        const animationGroupIndex = result.mapping.index;

        // Resolve URLs — for file-based entries, convert to base64 data URLs
        let avatarUrl = storedAvatar.url ?? "";
        let animationUrl = storedAnimation.url ?? "";

        if (storedAvatar.source === "file" && storedAvatar.fileNames?.length) {
            avatarUrl = await this._fileToDataUrlAsync(avatarManager, storedAvatar.id, storedAvatar.fileNames);
        }
        if (storedAnimation.source === "file" && storedAnimation.fileNames?.length) {
            animationUrl = await this._fileToDataUrlAsync(animationManager, storedAnimation.id, storedAnimation.fileNames);
        }

        const boneTransformations = this.avatar.buildExportData(this._lastAvatarRestPose);
        const animationTransformNodes = this.animationSource.buildExportData(this._lastAnimationRestPose);

        const mapNodes: string[] = [];
        const map = this._retargetOptions.mapNodeNames;
        if (map) {
            for (const [source, target] of map) {
                mapNodes.push(source, target);
            }
        }

        const optionsCopy = { ...this._retargetOptions, mapNodeNames: undefined, animationGroupName: `${storedAvatar.name} - ${params.animationName}` };

        const functionCode = ExportToSceneCode.replace(/%functionName%/g, functionName)
            .replace("%avatarSource%", storedAvatar.source === "scene" ? "scene" : "url")
            .replace(/%avatarPath%/g, avatarUrl.replace(/"/g, '\\"'))
            .replace(/%avatarRootNodeName%/g, storedAvatar.rootNodeName)
            .replace(/%avatarRootNodeIndex%/g, String(storedAvatar.rootNodeIndex ?? 0))
            .replace("%animationSource%", storedAnimation.source === "scene" ? "scene" : "url")
            .replace(/%animationPath%/g, animationUrl.replace(/"/g, '\\"'))
            .replace("%animationGroupIndex%", String(animationGroupIndex))
            .replace("%retargetOptions%", JSON.stringify(optionsCopy, undefined, 8))
            .replace("%avatarRestPoseUpdate%", JSON.stringify(boneTransformations))
            .replace("%animationRestPoseUpdate%", JSON.stringify(animationTransformNodes))
            .replace("%nameRemapping%", JSON.stringify(mapNodes));

        return { helpersCode: ExportToSceneHelpersCode, headerCode: ExportToSceneHeader, functionCode, functionName };
    }

    public async exportToPlaygroundAsync(avatarManager: AvatarManager, animationManager: AnimationManager, onBeforeOpen?: () => void): Promise<boolean> {
        if (!this._isRetargeted || !this._retargetOptions || !this._lastRetargetParams || !this.avatar || !this.animationSource) {
            return false;
        }

        const params = this._lastRetargetParams;
        const storedAvatar = avatarManager.getAvatar(params.avatarName);
        const result = animationManager.getByDisplayName(params.animationName);
        if (!storedAvatar || !result) {
            return false;
        }
        const storedAnimation = result.entry;
        const animationGroupIndex = result.mapping.index;

        // Resolve URLs — for file-based entries, convert main file to a base64 data URL
        let avatarUrl = storedAvatar.url ?? "";
        let animationUrl = storedAnimation.url ?? "";

        if (storedAvatar.source === "file" && storedAvatar.fileNames?.length) {
            avatarUrl = await this._fileToDataUrlAsync(avatarManager, storedAvatar.id, storedAvatar.fileNames);
        }
        if (storedAnimation.source === "file" && storedAnimation.fileNames?.length) {
            animationUrl = await this._fileToDataUrlAsync(animationManager, storedAnimation.id, storedAnimation.fileNames);
        }

        if (!avatarUrl || !animationUrl) {
            Logger.Warn("Cannot export to playground: failed to resolve avatar/animation files.");
            return false;
        }

        const boneTransformations = this.avatar.buildExportData(this._lastAvatarRestPose);
        const animationTransformNodes = this.animationSource.buildExportData(this._lastAnimationRestPose);

        const mapNodes: string[] = [];
        const map = this._retargetOptions.mapNodeNames;
        if (map) {
            for (const [source, target] of map) {
                mapNodes.push(source, target);
            }
        }

        const optionsCopy = { ...this._retargetOptions, mapNodeNames: undefined, animationGroupName: `${storedAvatar.name} - ${params.animationName}` };
        const code = TestPlaygroundCode.replace("%avatarPath%", avatarUrl.replace(/"/g, '\\"'))
            .replace("%animationPath%", animationUrl.replace(/"/g, '\\"'))
            .replace(/%avatarRootNodeIndex%/g, String(storedAvatar.rootNodeIndex ?? 0))
            .replace("%animationGroupIndex%", String(animationGroupIndex))
            .replace("%retargetOptions%", JSON.stringify(optionsCopy, undefined, 8))
            .replace("%avatarRestPoseUpdate%", JSON.stringify(boneTransformations))
            .replace("%animationRestPoseUpdate%", JSON.stringify(animationTransformNodes))
            .replace("%nameRemapping%", JSON.stringify(mapNodes));

        await SaveSnippet(code, onBeforeOpen);
        return true;
    }

    /**
     * Reads files from IndexedDB and converts them to base64 data URLs.
     * For single-file formats (.glb), returns just the data URL.
     * For multi-file formats (.gltf + .bin + textures), returns a "file:" URL
     * and includes code to register all companion files in FilesInputStore.
     * @param manager - The manager providing file access.
     * @param id - The entry id.
     * @param fileNames - The file names to retrieve.
     * @returns The data URL string.
     */
    private async _fileToDataUrlAsync(manager: { getFilesAsync(id: string, fileNames: string[]): Promise<File[]> }, id: string, fileNames: string[]): Promise<string> {
        const files = await manager.getFilesAsync(id, fileNames);
        let mainFile: File | undefined;
        for (const file of files) {
            const ext = file.name.toLowerCase().split(".").pop();
            if (ext === "glb" || ext === "gltf" || ext === "babylon") {
                mainFile = file;
                break;
            }
        }
        if (!mainFile) {
            return "";
        }

        // For .glb (single file), convert directly to base64 data URL
        if (files.length === 1 || mainFile.name.toLowerCase().endsWith(".glb")) {
            return await this._fileToBase64Async(mainFile);
        }

        // For multi-file (.gltf + companions): convert all files to base64 and
        // use a special "files:" prefix that the export templates will handle
        const fileEntries = await Promise.all(files.map(async (file) => ({ name: file.name, dataUrl: await this._fileToBase64Async(file) })));
        // Encode all files as a JSON blob after a "files:" prefix
        return "files:" + JSON.stringify(fileEntries);
    }

    private async _fileToBase64Async(file: File): Promise<string> {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return "data:;base64," + btoa(binary);
    }

    public dispose(): void {
        try {
            this.avatar?.dispose();
        } catch {
            // Ignore — engine/scene may already be disposed
        }
        try {
            this.animationSource?.dispose();
        } catch {
            // Ignore
        }
        this.htmlConsole.dispose();
        try {
            this._scene?.dispose();
        } catch {
            // Ignore
        }

        // Restore original render loops instead of disposing the engine — we don't own it.
        // Guard against the engine already being disposed (e.g. PG Play button disposes
        // the engine before our cleanup runs).
        if (this._engine && !this._engine.isDisposed) {
            this._engine.stopRenderLoop();
            for (const loop of this._savedRenderLoops) {
                this._engine.runRenderLoop(loop);
            }
        }
        this._savedRenderLoops = [];

        this.avatar = null;
        this.animationSource = null;
        this._scene = null;
        this._engine = null;
    }
}
