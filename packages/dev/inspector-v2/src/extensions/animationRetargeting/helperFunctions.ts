import { Logger } from "core/Misc/logger";

let CurrentSnippetToken = "";

export function DistancePointToLine(
    point: { x: number; y: number; z: number },
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number }
): number {
    const opX = point.x - origin.x;
    const opY = point.y - origin.y;
    const opZ = point.z - origin.z;

    const dot = opX * direction.x + opY * direction.y + opZ * direction.z;

    const projX = direction.x * dot;
    const projY = direction.y * dot;
    const projZ = direction.z * dot;

    const diffX = opX - projX;
    const diffY = opY - projY;
    const diffZ = opZ - projZ;

    return diffX * diffX + diffY * diffY + diffZ * diffZ;
}

function PackSnippetData(code: string) {
    const v2 = {
        v: 2,
        language: "TS",
        entry: "index.ts",
        imports: {},
        // eslint-disable-next-line @typescript-eslint/naming-convention
        files: { "index.ts": code },
    };
    const codeToSave = JSON.stringify(v2);
    const encoder = new TextEncoder();
    const buffer = encoder.encode(codeToSave);
    let testData = "";
    for (let i = 0; i < buffer.length; i++) {
        testData += String.fromCharCode(buffer[i]);
    }
    // EncodeArrayBufferToBase64 is not available as a module import easily, use btoa fallback
    const unicode = testData !== codeToSave ? btoa(testData) : undefined;
    const payload = JSON.stringify({
        code: codeToSave,
        unicode,
        engine: "WebGL2",
        version: 2,
    });
    return JSON.stringify({
        payload,
        name: "",
        description: "",
        tags: "",
    });
}

export async function SaveSnippet(code: string, onBeforeOpen?: () => void): Promise<void> {
    return await new Promise<void>((resolve, reject) => {
        const xmlHttp = new XMLHttpRequest();
        xmlHttp.onreadystatechange = () => {
            if (xmlHttp.readyState === 4) {
                if (xmlHttp.status === 200) {
                    const snippet = JSON.parse(xmlHttp.responseText);
                    const baseUrl = location.href.replace(location.hash, "");
                    let newUrl = baseUrl + "#" + snippet.id;
                    newUrl = newUrl.replace("##", "#");
                    CurrentSnippetToken = snippet.id;
                    if (snippet.version && snippet.version !== "0") {
                        newUrl += "#" + snippet.version;
                    }
                    onBeforeOpen?.();
                    window.open(newUrl, "_blank");
                    resolve();
                } else {
                    Logger.Error("Unable to save your code. It may be too long.");
                    reject(new Error("Unable to save snippet"));
                }
            }
        };

        xmlHttp.open("POST", "https://snippet.babylonjs.com" + (CurrentSnippetToken ? "/" + CurrentSnippetToken : ""), true);
        xmlHttp.withCredentials = false;
        xmlHttp.setRequestHeader("Content-Type", "application/json");
        xmlHttp.send(PackSnippetData(code));
    });
}

export const TestPlaygroundCode = `
type SourceDataUpdate = Array<{ name: string; data: { position?: number[], scaling?: number[], quaternion?: number[] } }>;

async function loadMeshesAsync(path: string, scene: BABYLON.Scene) {
    if (path.startsWith("files:")) {
        const entries = JSON.parse(path.substring(6)) as { name: string; dataUrl: string }[];
        let mainFile = "";
        for (const entry of entries) {
            const blob = await (await fetch(entry.dataUrl)).blob();
            BABYLON.FilesInputStore.FilesToLoad[entry.name.toLowerCase()] = new File([blob], entry.name);
            const ext = entry.name.toLowerCase().split(".").pop();
            if (ext === "gltf" || ext === "glb" || ext === "babylon") {
                mainFile = entry.name;
            }
        }
        return BABYLON.ImportMeshAsync(mainFile, scene, { rootUrl: "file:" });
    }
    return BABYLON.ImportMeshAsync(path, scene);
}

async function appendSceneAsync(path: string, scene: BABYLON.Scene) {
    if (path.startsWith("files:")) {
        const entries = JSON.parse(path.substring(6)) as { name: string; dataUrl: string }[];
        let mainFile = "";
        for (const entry of entries) {
            const blob = await (await fetch(entry.dataUrl)).blob();
            BABYLON.FilesInputStore.FilesToLoad[entry.name.toLowerCase()] = new File([blob], entry.name);
            const ext = entry.name.toLowerCase().split(".").pop();
            if (ext === "gltf" || ext === "glb" || ext === "babylon") {
                mainFile = entry.name;
            }
        }
        return BABYLON.AppendSceneAsync(mainFile, scene, { rootUrl: "file:" });
    }
    return BABYLON.AppendSceneAsync(path, scene);
}

const avatarRestPoseUpdate: SourceDataUpdate = %avatarRestPoseUpdate%;
const animationRestPoseUpdate: SourceDataUpdate = %animationRestPoseUpdate%;
const nameRemapping = %nameRemapping%;

class Playground {
    public static async CreateScene(engine: BABYLON.Engine, canvas: HTMLCanvasElement): Promise<BABYLON.Scene> {
        const avatarPath = "%avatarPath%";
        const animationPath = "%animationPath%";

        const scene = new BABYLON.Scene(engine);

        scene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData("textures/environment.env", scene);

        if (avatarPath.indexOf("glb") < 0 && avatarPath.indexOf("gltf") < 0) {
            new BABYLON.HemisphericLight("hemiLight", new BABYLON.Vector3(0, 1, 0), scene);
        }

        // Load the avatar
        const result = await loadMeshesAsync(avatarPath, scene);

        const avatarRootNode = result.meshes[%avatarRootNodeIndex%];
        avatarRootNode.name = "avatar";

        const numAnimations = scene.animationGroups.length;
        const animationGroupIndex = %animationGroupIndex%;

        // Load the animation
        await appendSceneAsync(animationPath, scene);

        const animRootNode = scene.getMeshByName("__root__");
        animRootNode.name = "reference";

        const sourceAnimationGroup = scene.animationGroups[numAnimations + animationGroupIndex];

        scene.stopAllAnimations();

        // Create the camera
        scene.createDefaultCamera(true, true, true);

        const camera = scene.activeCamera as BABYLON.ArcRotateCamera;

        camera.alpha += Math.PI;

        // Retarget the animation and play it
        const retargetOptions: BABYLON.IRetargetOptions = %retargetOptions%;

        const retargetedAnimation = Playground._RetargetAnimation(
            sourceAnimationGroup,
            animRootNode,
            avatarRootNode,
            animationRestPoseUpdate,
            avatarRestPoseUpdate,
            nameRemapping,
            retargetOptions
        );

        retargetedAnimation.start(true);

        return scene;
    }

    private static _RetargetAnimation(
        sourceAnimationGroup: BABYLON.AnimationGroup,
        animRootNode: BABYLON.AbstractMesh,
        avatarRootNode: BABYLON.AbstractMesh,
        animationRestPoseUpdate: SourceDataUpdate,
        avatarRestPoseUpdate: SourceDataUpdate,
        nameRemapping: string[],
        retargetOptions: BABYLON.IRetargetOptions,
        disposeSource = true)
    {
        const avatar = new BABYLON.AnimatorAvatar("avatar", avatarRootNode, false);

        for (const dataBlock of animationRestPoseUpdate) {
            const node = animRootNode.getChildTransformNodes(false, (node) => node.name === dataBlock.name)[0];
            if (node) {
                if (dataBlock.data.position) node.position.fromArray(dataBlock.data.position);
                if (dataBlock.data.scaling) node.scaling.fromArray(dataBlock.data.scaling);
                if (dataBlock.data.quaternion) node.rotationQuaternion!.fromArray(dataBlock.data.quaternion);
            }
        }

        if (avatarRestPoseUpdate.length > 0) {
            const [avatarSkeleton] = avatar.skeletons;

            for (const dataBlock of avatarRestPoseUpdate) {
                const index = avatarSkeleton.getBoneIndexByName(dataBlock.name);
                if (index !== -1) {
                    const bone = avatarSkeleton.bones[index];
                    if (dataBlock.data.position) bone.position = BABYLON.TmpVectors.Vector3[0].fromArray(dataBlock.data.position);
                    if (dataBlock.data.scaling) bone.scaling = BABYLON.TmpVectors.Vector3[0].fromArray(dataBlock.data.scaling);
                    if (dataBlock.data.quaternion) bone.rotationQuaternion = BABYLON.TmpVectors.Quaternion[0].fromArray(dataBlock.data.quaternion);
                }
            }
            avatarSkeleton.setCurrentPoseAsRest();
        }

        for (const skeleton of avatar.skeletons) {
            skeleton.returnToRest();
        }

        const mapNodeNames = new Map<string, string>();
        for (let i = 0; i < nameRemapping.length; i += 2) {
            mapNodeNames.set(nameRemapping[i], nameRemapping[i + 1]);
        }

        retargetOptions.mapNodeNames = mapNodeNames;

        const retargetedAnimation = avatar.retargetAnimationGroup(sourceAnimationGroup, retargetOptions);

        avatar.dispose();

        if (disposeSource) {
            sourceAnimationGroup.dispose();
            animRootNode.dispose(false);
        }

        return retargetedAnimation;
    }
}
export { Playground };
`;

/**
 * Helper code shared across all "Export to Scene" tabs.
 * Written to "retarget.helpers.ts" once and imported by each retargetingN.ts file.
 */
export const ExportToSceneHelpersCode = `
export type SourceDataUpdate = Array<{ name: string; data: { position?: number[], scaling?: number[], quaternion?: number[] } }>;

export async function loadMeshesAsync(path: string, scene: BABYLON.Scene) {
    if (path.startsWith("files:")) {
        const entries = JSON.parse(path.substring(6)) as { name: string; dataUrl: string }[];
        let mainFile = "";
        for (const entry of entries) {
            const blob = await (await fetch(entry.dataUrl)).blob();
            BABYLON.FilesInputStore.FilesToLoad[entry.name.toLowerCase()] = new File([blob], entry.name);
            const ext = entry.name.toLowerCase().split(".").pop();
            if (ext === "gltf" || ext === "glb" || ext === "babylon") {
                mainFile = entry.name;
            }
        }
        return BABYLON.ImportMeshAsync(mainFile, scene, { rootUrl: "file:" });
    }
    return BABYLON.ImportMeshAsync(path, scene);
}

export async function appendSceneAsync(path: string, scene: BABYLON.Scene) {
    if (path.startsWith("files:")) {
        const entries = JSON.parse(path.substring(6)) as { name: string; dataUrl: string }[];
        let mainFile = "";
        for (const entry of entries) {
            const blob = await (await fetch(entry.dataUrl)).blob();
            BABYLON.FilesInputStore.FilesToLoad[entry.name.toLowerCase()] = new File([blob], entry.name);
            const ext = entry.name.toLowerCase().split(".").pop();
            if (ext === "gltf" || ext === "glb" || ext === "babylon") {
                mainFile = entry.name;
            }
        }
        return BABYLON.AppendSceneAsync(mainFile, scene, { rootUrl: "file:" });
    }
    return BABYLON.AppendSceneAsync(path, scene);
}

export function retargetAnimationGroup(
    sourceAnimationGroup: BABYLON.AnimationGroup,
    animRootNode: BABYLON.AbstractMesh,
    avatarRootNode: BABYLON.AbstractMesh,
    animationRestPoseUpdate: SourceDataUpdate,
    avatarRestPoseUpdate: SourceDataUpdate,
    nameRemapping: string[],
    retargetOptions: BABYLON.IRetargetOptions,
    disposeSource = true,
): BABYLON.AnimationGroup {
    const avatar = new BABYLON.AnimatorAvatar("avatar", avatarRootNode, false, false);

    for (const dataBlock of animationRestPoseUpdate) {
        const node = animRootNode.getChildTransformNodes(false, (n) => n.name === dataBlock.name)[0];
        if (node) {
            if (dataBlock.data.position) node.position.fromArray(dataBlock.data.position);
            if (dataBlock.data.scaling) node.scaling.fromArray(dataBlock.data.scaling);
            if (dataBlock.data.quaternion) node.rotationQuaternion!.fromArray(dataBlock.data.quaternion);
        }
    }

    if (avatarRestPoseUpdate.length > 0) {
        const [avatarSkeleton] = avatar.skeletons;
        for (const dataBlock of avatarRestPoseUpdate) {
            const index = avatarSkeleton.getBoneIndexByName(dataBlock.name);
            if (index !== -1) {
                const bone = avatarSkeleton.bones[index];
                if (dataBlock.data.position) bone.position = BABYLON.TmpVectors.Vector3[0].fromArray(dataBlock.data.position);
                if (dataBlock.data.scaling) bone.scaling = BABYLON.TmpVectors.Vector3[0].fromArray(dataBlock.data.scaling);
                if (dataBlock.data.quaternion) bone.rotationQuaternion = BABYLON.TmpVectors.Quaternion[0].fromArray(dataBlock.data.quaternion);
            }
        }
        avatarSkeleton.setCurrentPoseAsRest();
    }

    for (const skeleton of avatar.skeletons) {
        skeleton.returnToRest();
    }

    const mapNodeNames = new Map<string, string>();
    for (let i = 0; i < nameRemapping.length; i += 2) {
        mapNodeNames.set(nameRemapping[i], nameRemapping[i + 1]);
    }
    retargetOptions.mapNodeNames = mapNodeNames;

    const retargetedAnimation = avatar.retargetAnimationGroup(sourceAnimationGroup, retargetOptions);

    avatar.dispose();

    if (disposeSource) {
        sourceAnimationGroup.dispose();
        animRootNode.dispose(false);
    }

    return retargetedAnimation;
}
`;

/**
 * Header for the retargeting.ts file — written once on first export.
 */
export const ExportToSceneHeader = `import { retargetAnimationGroup, loadMeshesAsync, appendSceneAsync } from "./retarget.helpers";
import type { SourceDataUpdate } from "./retarget.helpers";
`;

/**
 * Code template for "Export to Scene" — appended as a new function to retargeting.ts.
 * Data constants are inside the function so multiple functions can coexist.
 */
export const ExportToSceneCode = `
export async function %functionName%(scene: BABYLON.Scene): Promise<BABYLON.AnimationGroup | null> {
    const avatarSource: "url" | "scene" = "%avatarSource%";
    const animationSource: "url" | "scene" = "%animationSource%";
    const animationGroupIndex = %animationGroupIndex%;

    const avatarRestPoseUpdate: SourceDataUpdate = %avatarRestPoseUpdate%;
    const animationRestPoseUpdate: SourceDataUpdate = %animationRestPoseUpdate%;
    const nameRemapping: string[] = %nameRemapping%;

    let avatarRootNode: BABYLON.AbstractMesh;
    let sourceAnimationGroup: BABYLON.AnimationGroup;

    // Load or find the avatar
    // @ts-ignore
    if (avatarSource === "url") {
        const result = await loadMeshesAsync("%avatarPath%", scene);
        avatarRootNode = result.meshes[%avatarRootNodeIndex%];
    } else {
        const found = scene.getMeshByName("%avatarRootNodeName%");
        if (!found) {
            console.error("%functionName%: avatar root node '%avatarRootNodeName%' not found in scene.");
            return null;
        }
        avatarRootNode = found;
    }

    // Load or find the animation
    const numAnimsBefore = scene.animationGroups.length;
    // @ts-ignore
    if (animationSource === "url") {
        await appendSceneAsync("%animationPath%", scene);
        sourceAnimationGroup = scene.animationGroups[numAnimsBefore + animationGroupIndex];
    } else {
        sourceAnimationGroup = scene.animationGroups[animationGroupIndex];
    }

    // Find the animation root node by walking up from the first animation target
    const target = sourceAnimationGroup.targetedAnimations[0]?.target as BABYLON.TransformNode | undefined;
    let animRoot = target;
    while (animRoot?.parent) {
        animRoot = animRoot.parent as BABYLON.TransformNode;
    }
    const animRootNode = (animRoot ?? avatarRootNode) as BABYLON.AbstractMesh;

    sourceAnimationGroup.stop();

    const retargetOptions: BABYLON.IRetargetOptions = %retargetOptions%;

    const retargetedAnimation = retargetAnimationGroup(
        sourceAnimationGroup, animRootNode, avatarRootNode,
        animationRestPoseUpdate, avatarRestPoseUpdate, nameRemapping,
        // @ts-ignore
        retargetOptions, animationSource === "url",
    );

    retargetedAnimation.start(true);

    return retargetedAnimation;
}
`;
