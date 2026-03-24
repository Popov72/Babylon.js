import type { IDisposable } from "core/index";
import type { Engine } from "core/Engines/engine";
import type { ServiceDefinition } from "../../modularity/serviceDefinition";
import type { IShellService } from "../../services/shellService";
import type { ISettingsStore } from "../../services/settingsStore";
import type { ISceneContext } from "../../services/sceneContext";
import type { IPlaygroundBridge } from "../../services/playgroundBridgeService";
import { ShellServiceIdentity } from "../../services/shellService";
import { SettingsStoreIdentity } from "../../services/settingsStore";
import { SceneContextIdentity } from "../../services/sceneContext";
import { PlaygroundBridgeIdentity } from "../../services/playgroundBridgeService";

import type { IObserver } from "core/Misc/observable";
import { Observable } from "core/Misc/observable";
import { PersonRunningRegular } from "@fluentui/react-icons";

import { AnimationRetargetingViewport } from "./animationRetargetingViewport";
import { AnimationRetargetingPanel, DefaultPanelState } from "./animationRetargetingPanel";
import type { PanelStateStore } from "./animationRetargetingPanel";
import type { RetargetingSceneManager } from "./retargetingSceneManager";
import { NamingSchemeManager } from "./namingSchemeManager";
import { AvatarManager } from "./avatarManager";
import { AnimationManager } from "./animationManager";

// Module-level reference to the playground bridge. Set by the BridgeConsumer service
// when the inspector is opened from the Playground. Null otherwise.
let PlaygroundBridge: IPlaygroundBridge | null = null;

/**
 * Returns the playground bridge if available (inspector opened from PG).
 * @returns The playground bridge instance or null.
 */
export function GetPlaygroundBridge(): IPlaygroundBridge | null {
    return PlaygroundBridge;
}

/**
 * Service definition for the Animation Retargeting extension.
 * - Registers a dedicated 3D viewport (central content, left+right cameras).
 * - Registers a controls side pane with Avatar / Animation / Retarget sections.
 * - Exposes an Enable / Disable toggle to restore the original inspector scene.
 */
export const AnimationRetargetingServiceDefinition: ServiceDefinition<[], [IShellService, ISettingsStore, ISceneContext]> = {
    friendlyName: "Animation Retargeting",
    consumes: [ShellServiceIdentity, SettingsStoreIdentity, SceneContextIdentity],
    factory: (shellService, settingsStore, sceneContext) => {
        // Observable that fires whenever a new scene manager is ready (on each enable)
        const onManagerReadyObs = new Observable<RetargetingSceneManager>();
        // Observable that broadcasts enable/disable state changes to the panel
        const isEnabledObs = new Observable<boolean>();
        // Observable that fires when the config dialog closes — panel refreshes dropdowns
        const onConfigChangedObs = new Observable<void>();

        // Naming scheme manager — persists across extension lifetime via ISettingsStore
        const namingSchemeManager = new NamingSchemeManager(settingsStore);

        // Avatar manager — persists across extension lifetime via ISettingsStore + IndexedDB
        const avatarManager = new AvatarManager(settingsStore);

        // Animation manager — persists across extension lifetime via ISettingsStore + IndexedDB
        const animationManager = new AnimationManager(settingsStore);

        // Purge any session-only entries left over from a previous session
        avatarManager.purgeSessionOnly();
        animationManager.purgeSessionOnly();

        // Create default entries if both lists are empty (first-time use)
        if (avatarManager.getAllAvatars().length === 0 && animationManager.getAllDisplayNames().length === 0) {
            avatarManager.createDefaults();
            animationManager.createDefaults();
        }

        let isEnabled = false;
        let viewportReg: IDisposable | null = null;
        let currentManager: RetargetingSceneManager | null = null;
        let sceneDisposeObserver: IObserver | null = null;

        // Persists all panel UI state across remounts (e.g. when the panel is docked elsewhere)
        const allAvatars = avatarManager.getAllAvatars();
        const allDisplayNames = animationManager.getAllDisplayNames();
        const persistedPanelState: PanelStateStore = {
            ...DefaultPanelState,
            avatarName: allAvatars.length > 0 ? allAvatars[0].name : "",
            animationName: allDisplayNames.length > 0 ? allDisplayNames[0] : "",
        };

        function cleanupViewport(): void {
            sceneDisposeObserver?.remove();
            sceneDisposeObserver = null;
            viewportReg?.dispose();
            viewportReg = null;
            currentManager = null;
        }

        function setEnabled(enabled: boolean): void {
            if (enabled === isEnabled) {
                return;
            }
            isEnabled = enabled;

            if (enabled) {
                const scene = sceneContext.currentScene;
                if (!scene) {
                    return;
                }
                const engine = scene.getEngine() as Engine;

                // When the PG scene is disposed (e.g. Play button), clean up immediately
                // so the retargeting scene is torn down before the engine is fully disposed.
                sceneDisposeObserver = scene.onDisposeObservable.add(() => {
                    cleanupViewport();
                    isEnabled = false;
                    isEnabledObs.notifyObservers(false);
                });

                // Register the central-content viewport; the component uses the PG's engine
                viewportReg = shellService.addCentralContent({
                    key: "AnimationRetargetingViewport",
                    order: 10,
                    component: () => (
                        <AnimationRetargetingViewport
                            engine={engine}
                            onManagerReady={(manager) => {
                                currentManager = manager;
                                onManagerReadyObs.notifyObservers(manager);
                            }}
                        />
                    ),
                });
            } else {
                cleanupViewport();
            }

            isEnabledObs.notifyObservers(enabled);
        }

        // Start disabled so the user opts-in to the viewport
        setEnabled(false);

        const panelReg = shellService.addSidePane({
            key: "AnimationRetargetingPanel",
            title: "Animation Retargeting",
            icon: PersonRunningRegular,
            horizontalLocation: "left",
            verticalLocation: "top",
            content: () => (
                <AnimationRetargetingPanel
                    initialIsEnabled={isEnabled}
                    isEnabledObs={isEnabledObs}
                    onConfigChangedObs={onConfigChangedObs}
                    onManagerReadyObs={onManagerReadyObs}
                    getCurrentManager={() => currentManager}
                    getCurrentScene={() => sceneContext.currentScene}
                    getPlaygroundBridge={GetPlaygroundBridge}
                    namingSchemeManager={namingSchemeManager}
                    avatarManager={avatarManager}
                    animationManager={animationManager}
                    stateStore={persistedPanelState}
                    onSetEnabled={setEnabled}
                    onToggleConsole={() => currentManager?.htmlConsole.toggle()}
                />
            ),
        });

        // When the PG scene changes (e.g. Play button), auto-disable so the old
        // engine/scene references are released and render loops are restored cleanly.
        const sceneObserver = sceneContext.currentSceneObservable.add(() => {
            if (isEnabled) {
                setEnabled(false);
            }
        });

        return {
            dispose: () => {
                setEnabled(false);
                sceneObserver.remove();
                panelReg.dispose();
                onManagerReadyObs.clear();
                isEnabledObs.clear();
                onConfigChangedObs.clear();
            },
        };
    },
};

/**
 * Optional service that wires the Playground bridge when the inspector is opened from the PG.
 * If the bridge service is not registered (inspector opened outside PG), this service is simply
 * never created and the extension works without it.
 */
const BridgeConsumerServiceDefinition: ServiceDefinition<[], [IPlaygroundBridge]> = {
    friendlyName: "Animation Retargeting Bridge Consumer",
    consumes: [PlaygroundBridgeIdentity],
    factory: (bridge) => {
        PlaygroundBridge = bridge;
        return {
            dispose: () => {
                PlaygroundBridge = null;
            },
        };
    },
};

export default {
    serviceDefinitions: [AnimationRetargetingServiceDefinition, BridgeConsumerServiceDefinition],
} as const;
