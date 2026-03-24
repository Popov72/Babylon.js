import type { FunctionComponent } from "react";
import type { AnimationManager, StoredAnimation, AnimationGroupMapping } from "./animationManager";
import type { NamingSchemeManager } from "./namingSchemeManager";
import type { RestPoseDataUpdate } from "./avatarManager";
import type { Nullable } from "core/types";

import { useState, useCallback, useRef, useEffect } from "react";
import {
    Input,
    Label,
    makeStyles,
    mergeClasses,
    tokens,
    Body1Strong,
    Caption1,
    Dialog,
    DialogSurface,
    DialogBody,
    DialogTitle,
    DialogContent,
    DialogActions,
    Spinner,
    DataGrid,
    DataGridHeader,
    DataGridBody,
    DataGridRow,
    DataGridHeaderCell,
    DataGridCell,
    createTableColumn,
} from "@fluentui/react-components";
import type { TableColumnDefinition, TableColumnSizingOptions } from "@fluentui/react-components";
import { Button } from "shared-ui-components/fluent/primitives/button";
import { TextInput } from "shared-ui-components/fluent/primitives/textInput";
import { StringDropdown } from "shared-ui-components/fluent/primitives/dropdown";
import { AddRegular, DeleteRegular, EditRegular, ArrowUploadRegular, DocumentArrowLeftRegular } from "@fluentui/react-icons";
import { Textarea } from "shared-ui-components/fluent/primitives/textarea";
import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { ImportMeshAsync, SceneLoader } from "core/Loading/sceneLoader";
import { FilesInputStore } from "core/Misc/filesInputStore";
import type { Node } from "core/node";

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
    panel: {
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalS,
    },
    listHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexShrink: 0,
        paddingBottom: tokens.spacingVerticalXS,
    },
    listButtons: {
        display: "flex",
        gap: tokens.spacingHorizontalXS,
    },
    editSectionFlex: {
        flex: 1,
        overflowY: "auto",
        borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
        paddingTop: tokens.spacingVerticalS,
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalS,
    },
    formRow: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalS,
        flexShrink: 0,
    },
    formLabel: {
        flexShrink: 0,
        width: "110px",
    },
    formControl: {
        flex: 1,
        textAlign: "left",
        "& span": { textAlign: "left" },
        "& input": { textAlign: "left" },
    },
    actionRow: {
        display: "flex",
        gap: tokens.spacingHorizontalS,
        justifyContent: "flex-end",
        flexShrink: 0,
    },
    errorText: {
        color: tokens.colorPaletteRedForeground1,
        fontSize: tokens.fontSizeBase200,
        flexShrink: 0,
    },
    warningText: {
        color: tokens.colorPaletteYellowForeground1,
        fontSize: tokens.fontSizeBase200,
        flexShrink: 0,
    },
    emptyMsg: {
        padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
        color: tokens.colorNeutralForeground3,
        fontSize: tokens.fontSizeBase200,
    },
    confirmSurface: {
        width: "380px",
        maxWidth: "90vw",
    },
    restPoseTextarea: {
        resize: "vertical",
        width: "100%",
        minHeight: "150px",
        maxHeight: "300px",
        boxSizing: "border-box",
        border: `1px solid ${tokens.colorNeutralStroke1}`,
        borderRadius: tokens.borderRadiusMedium,
        padding: `${tokens.spacingVerticalSNudge} ${tokens.spacingHorizontalS}`,
        fontFamily: "monospace",
        fontSize: tokens.fontSizeBase100,
        backgroundColor: tokens.colorNeutralBackground1,
        color: tokens.colorNeutralForeground1,
    },
    dropZone: {
        border: `2px dashed ${tokens.colorNeutralStroke1}`,
        borderRadius: tokens.borderRadiusMedium,
        padding: tokens.spacingVerticalM,
        textAlign: "center",
        cursor: "pointer",
        color: tokens.colorNeutralForeground3,
        fontSize: tokens.fontSizeBase200,
    },
    dropZoneActive: {
        border: `2px dashed ${tokens.colorCompoundBrandStroke}`,
        backgroundColor: tokens.colorBrandBackground2,
    },
    animList: {
        flex: 1,
        overflowY: "auto",
        border: `1px solid ${tokens.colorNeutralStroke2}`,
        borderRadius: tokens.borderRadiusMedium,
        minHeight: "60px",
    },
    animRow: {
        display: "flex",
        alignItems: "center",
        padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
        gap: tokens.spacingHorizontalS,
        fontSize: tokens.fontSizeBase200,
        borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
        ":last-child": { borderBottom: "none" },
    },
    animRowName: {
        flex: "0 0 40%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: tokens.colorNeutralForeground3,
    },
    animRowInput: {
        flex: 1,
    },
    animRowError: {
        color: tokens.colorPaletteRedForeground1,
        fontSize: tokens.fontSizeBase100,
        flexShrink: 0,
    },
    nodeTree: {
        flex: 1,
        overflowY: "auto",
        border: `1px solid ${tokens.colorNeutralStroke2}`,
        borderRadius: tokens.borderRadiusMedium,
        minHeight: "60px",
        maxHeight: "150px",
    },
    nodeRow: {
        padding: `0 ${tokens.spacingHorizontalS}`,
        fontSize: tokens.fontSizeBase200,
        lineHeight: "13px",
        fontFamily: "monospace",
        cursor: "pointer",
        whiteSpace: "pre",
    },
    nodeRowSelected: {
        backgroundColor: tokens.colorBrandBackground2,
        fontWeight: "bold",
    },
    dataGridFlex: {
        flex: 1,
        overflowY: "auto",
    },
    dataGridCompact: {
        maxHeight: "140px",
        overflowY: "auto",
    },
    hiddenInput: {
        display: "none",
    },
    subtleText: {
        color: tokens.colorNeutralForeground3,
    },
    spinnerInline: {
        display: "inline-block",
    },
    formRowAlignStart: {
        alignItems: "flex-start",
    },
    formLabelPadTop: {
        paddingTop: "6px",
    },
});

// ─── Types ────────────────────────────────────────────────────────────────────

type NodeInfo = {
    name: string;
    depth: number;
    prefix: string;
};

type AnimationEdit = {
    id: string | null;
    name: string;
    sourceType: "url" | "file" | "scene";
    url: string;
    files: File[];
    /** One row per animation group found in the file. */
    mappings: AnimationGroupMapping[];
    /** Index into the nodeList array — used for unique selection in the dialog. */
    rootNodeIndex: number;
    /** Display name of the root node. */
    rootNodeName: string;
    namingScheme: string;
    restPoseJson: string;
    sessionOnly?: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function BuildNodeList(node: Node, depth: number, list: NodeInfo[], ancestorContinues: boolean[]): void {
    let prefix = "";
    if (depth > 0) {
        for (let i = 1; i < depth; i++) {
            prefix += ancestorContinues[i] ? "│  " : "   ";
        }
        const isLast = !ancestorContinues[depth];
        prefix += isLast ? "└─ " : "├─ ";
    }
    list.push({ name: node.name, depth, prefix });
    const children = node.getChildren();
    for (let i = 0; i < children.length; i++) {
        const isLastChild = i === children.length - 1;
        ancestorContinues[depth + 1] = !isLastChild;
        BuildNodeList(children[i], depth + 1, list, ancestorContinues);
    }
}

/**
 * Detects the best matching naming scheme by checking how many target names
 * appear in each scheme. Returns the scheme with the most matches
 * (minimum 10 required), or null if none qualify.
 * @param targetNames - Set of animation target names.
 * @param namingSchemeManager - The naming scheme manager.
 * @returns The best matching scheme name, or null.
 */
function DetectNamingScheme(targetNames: Set<string>, namingSchemeManager: NamingSchemeManager): string | null {
    const schemeNames = namingSchemeManager.getAllSchemeNames();
    let bestScheme: string | null = null;
    let bestCount = 0;

    for (const schemeName of schemeNames) {
        const entries = namingSchemeManager.getNamingScheme(schemeName);
        if (!entries) {
            continue;
        }
        const boneSet = new Set(entries.map((e) => e.name));
        let matches = 0;
        for (const name of targetNames) {
            if (boneSet.has(name)) {
                matches++;
            }
        }
        if (matches > bestCount) {
            bestCount = matches;
            bestScheme = schemeName;
        }
    }

    return bestCount >= 10 ? bestScheme : null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const AnimationsPanel: FunctionComponent<{
    animationManager: AnimationManager;
    namingSchemeManager: NamingSchemeManager;
    getCurrentScene: () => Nullable<Scene>;
    onMutate: () => void;
    onEditingChange: (editing: boolean) => void;
}> = ({ animationManager, namingSchemeManager, getCurrentScene, onMutate, onEditingChange }) => {
    const classes = useStyles();
    const [editing, setEditing] = useState<AnimationEdit | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [nodeList, setNodeList] = useState<NodeInfo[]>([]);

    const tempEngineRef = useRef<NullEngine | null>(null);
    const tempSceneRef = useRef<Scene | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        return () => {
            tempSceneRef.current?.dispose();
            tempEngineRef.current?.dispose();
        };
    }, []);

    const setEditingWithNotify = useCallback(
        (value: AnimationEdit | null) => {
            setEditing(value);
            onEditingChange(value !== null);
        },
        [onEditingChange]
    );

    const allAnimations = [...animationManager.getAllAnimations()].sort((a, b) => a.name.localeCompare(b.name));
    const schemeNames = namingSchemeManager.getAllSchemeNames();

    const animationColumnSizing: TableColumnSizingOptions = {
        name: { defaultWidth: 150 },
        source: { defaultWidth: 60 },
        scheme: { defaultWidth: 150 },
        actions: { defaultWidth: 80 },
    };

    const animationColumns: TableColumnDefinition<StoredAnimation>[] = [
        createTableColumn({ columnId: "name", renderHeaderCell: () => "Name", renderCell: (item) => item.name }),
        createTableColumn({
            columnId: "source",
            renderHeaderCell: () => "Source",
            renderCell: (item) =>
                item.sessionOnly
                    ? `${item.source === "scene" ? "Scene" : item.source === "url" ? "URL" : "File"} (session)`
                    : item.source === "scene"
                      ? "Scene"
                      : item.source === "url"
                        ? "URL"
                        : "File",
        }),
        createTableColumn({ columnId: "scheme", renderHeaderCell: () => "Scheme", renderCell: (item) => item.namingScheme }),
        createTableColumn({
            columnId: "actions",
            renderHeaderCell: () => "",
            renderCell: (item) => (
                <>
                    <Button
                        appearance="transparent"
                        icon={EditRegular}
                        title="Edit"
                        disabled={!!editing}
                        onClick={() => {
                            void startEdit(item);
                        }}
                    />
                    <Button appearance="transparent" icon={DeleteRegular} title="Delete" disabled={!!editing} onClick={() => handleDelete(item)} />
                </>
            ),
        }),
    ];

    // ─── Load preview ─────────────────────────────────────────────────────

    const loadPreview = useCallback(
        async (sourceType: "url" | "file", url: string, files: File[], autoDetectScheme: boolean) => {
            setIsLoading(true);
            setError(null);

            tempSceneRef.current?.dispose();
            tempEngineRef.current?.dispose();

            try {
                const engine = new NullEngine();
                tempEngineRef.current = engine;
                const scene = new Scene(engine);
                tempSceneRef.current = scene;

                if (sourceType === "url") {
                    await ImportMeshAsync(url.trim(), scene);
                } else {
                    let sceneFile: File | undefined;
                    for (const file of files) {
                        const name = file.name.toLowerCase();
                        FilesInputStore.FilesToLoad[name] = file;
                        const ext = name.split(".").pop();
                        if (ext && SceneLoader.IsPluginForExtensionAvailable("." + ext)) {
                            sceneFile = file;
                        }
                    }
                    if (!sceneFile) {
                        sceneFile = files[0];
                    }
                    await ImportMeshAsync(sceneFile.name, scene, { rootUrl: "file:" });
                }

                const groups = scene.animationGroups;
                if (groups.length === 0) {
                    setError("No animations found in this file.");
                    setIsLoading(false);
                    return;
                }

                // Detect naming scheme only for new loads (not when editing an existing entry)
                let detectedScheme: string | null = null;
                if (autoDetectScheme) {
                    const targetNames = new Set<string>();
                    for (const group of groups) {
                        for (const ta of group.targetedAnimations) {
                            if (ta.target?.name) {
                                targetNames.add(ta.target.name as string);
                            }
                        }
                    }
                    detectedScheme = DetectNamingScheme(targetNames, namingSchemeManager);
                }

                // Build the node tree from root nodes
                const nodes: NodeInfo[] = [];
                const rootNodes = scene.rootNodes;
                for (let i = 0; i < rootNodes.length; i++) {
                    const ancestorContinues: boolean[] = [];
                    ancestorContinues[0] = i < rootNodes.length - 1;
                    BuildNodeList(rootNodes[i], 0, nodes, ancestorContinues);
                }
                setNodeList(nodes);

                // Build mappings from the loaded animation groups, preserving existing display names by index
                setEditing((prev) => {
                    if (!prev) {
                        return prev;
                    }
                    const existingByIndex = new Map<number, string>();
                    for (const m of prev.mappings) {
                        if (m.displayName) {
                            existingByIndex.set(m.index, m.displayName);
                        }
                    }
                    const newMappings: AnimationGroupMapping[] = groups.map((g, i) => ({
                        index: i,
                        groupName: g.name,
                        displayName: existingByIndex.get(i) ?? "",
                    }));
                    // Resolve rootNodeIndex
                    let idx = prev.rootNodeIndex;
                    if (idx < 0 && prev.rootNodeName) {
                        idx = nodes.findIndex((n) => n.name === prev.rootNodeName);
                    }
                    if (idx < 0) {
                        idx = 0;
                    }
                    return {
                        ...prev,
                        mappings: newMappings,
                        rootNodeIndex: idx,
                        rootNodeName: prev.rootNodeName || (nodes.length > 0 ? (nodes[idx]?.name ?? "") : ""),
                        ...(detectedScheme ? { namingScheme: detectedScheme } : {}),
                    };
                });
            } catch (e) {
                setError(`Failed to load: ${e instanceof Error ? e.message : String(e)}`);
            } finally {
                setIsLoading(false);
            }
        },
        [namingSchemeManager]
    );

    // ─── CRUD handlers ────────────────────────────────────────────────────

    const startAdd = useCallback(() => {
        setEditingWithNotify({
            id: null,
            name: "",
            sourceType: "url",
            url: "",
            files: [],
            mappings: [],
            rootNodeIndex: -1,
            rootNodeName: "",
            namingScheme: schemeNames[0] ?? "",
            restPoseJson: "",
        });
        setError(null);
        setNodeList([]);
    }, [schemeNames, setEditingWithNotify]);

    const startEdit = useCallback(
        async (animation: StoredAnimation) => {
            setEditingWithNotify({
                id: animation.id,
                name: animation.name,
                sourceType: animation.source,
                url: animation.url ?? "",
                files: [],
                mappings: animation.animations.map((m) => ({ ...m })),
                rootNodeIndex: -1,
                rootNodeName: animation.rootNodeName ?? "",
                namingScheme: animation.namingScheme,
                restPoseJson: animation.restPoseUpdate ? JSON.stringify(animation.restPoseUpdate, undefined, 2) : "",
                sessionOnly: animation.sessionOnly,
            });
            setError(null);
            if (animation.source === "scene") {
                const scene = getCurrentScene();
                if (scene) {
                    const nodes: NodeInfo[] = [];
                    const rootNodes = scene.rootNodes;
                    for (let i = 0; i < rootNodes.length; i++) {
                        const ancestorContinues: boolean[] = [];
                        ancestorContinues[0] = i < rootNodes.length - 1;
                        BuildNodeList(rootNodes[i], 0, nodes, ancestorContinues);
                    }
                    setNodeList(nodes);
                    // Resolve rootNodeIndex from the stored name
                    const foundIdx = nodes.findIndex((n) => n.name === animation.rootNodeName);
                    if (foundIdx >= 0) {
                        setEditing((prev) => (prev ? { ...prev, rootNodeIndex: foundIdx } : prev));
                    }
                }
            } else if (animation.source === "url" && animation.url) {
                void loadPreview("url", animation.url, [], false);
            } else if (animation.source === "file" && animation.fileNames?.length) {
                const files = await animationManager.getFilesAsync(animation.id, animation.fileNames);
                if (files.length > 0) {
                    void loadPreview("file", "", files, false);
                }
            }
        },
        [setEditingWithNotify, loadPreview, animationManager, getCurrentScene]
    );

    const startImportFromScene = useCallback(() => {
        const scene = getCurrentScene();
        if (!scene) {
            return;
        }

        const groups = scene.animationGroups;
        if (groups.length === 0) {
            setError("No animation groups found in the current scene.");
            return;
        }

        // Pause any playing animations and go to frame 0 so we capture the correct rest pose
        let hadPlayingAnimations = false;
        for (const group of groups) {
            if (group.isPlaying) {
                hadPlayingAnimations = true;
                group.pause();
                group.goToFrame(0);
            }
        }
        if (hadPlayingAnimations) {
            setWarning(
                "Playing animations have been stopped. Animations should not be playing during import to ensure correct rest pose data. " +
                    "The first frame will be used as the rest pose, but it may not be accurate if the animation was already running."
            );
        } else {
            setWarning(null);
        }

        // Build mappings from scene animation groups
        const mappings: AnimationGroupMapping[] = groups.map((g, i) => ({
            index: i,
            groupName: g.name,
            displayName: "",
        }));

        // Build node tree from the scene
        const nodes: NodeInfo[] = [];
        const rootNodes = scene.rootNodes;
        for (let i = 0; i < rootNodes.length; i++) {
            const ancestorContinues: boolean[] = [];
            ancestorContinues[0] = i < rootNodes.length - 1;
            BuildNodeList(rootNodes[i], 0, nodes, ancestorContinues);
        }
        setNodeList(nodes);

        // Auto-detect naming scheme from animation targets
        const targetNames = new Set<string>();
        for (const group of groups) {
            for (const ta of group.targetedAnimations) {
                if (ta.target?.name) {
                    targetNames.add(ta.target.name as string);
                }
            }
        }
        const detectedScheme = DetectNamingScheme(targetNames, namingSchemeManager);

        setEditingWithNotify({
            id: null,
            name: "",
            sourceType: "scene",
            url: "",
            files: [],
            mappings,
            rootNodeIndex: 0,
            rootNodeName: nodes.length > 0 ? nodes[0].name : "",
            namingScheme: detectedScheme ?? schemeNames[0] ?? "",
            restPoseJson: "",
            sessionOnly: true,
        });
        setError(null);
    }, [getCurrentScene, schemeNames, setEditingWithNotify, namingSchemeManager]);

    const handleCancel = useCallback(() => {
        setEditingWithNotify(null);
        setError(null);
        setWarning(null);
        setNodeList([]);
        tempSceneRef.current?.dispose();
        tempSceneRef.current = null;
        tempEngineRef.current?.dispose();
        tempEngineRef.current = null;
    }, [setEditingWithNotify]);

    const handleSave = useCallback(async () => {
        if (!editing) {
            return;
        }
        if (!editing.name.trim()) {
            setError("Name is required.");
            return;
        }
        if (!editing.namingScheme) {
            setError("Please select a naming scheme.");
            return;
        }

        // Validate display names: check for duplicates within the current mappings
        const seenNames = new Set<string>();
        for (const m of editing.mappings) {
            const dn = m.displayName.trim();
            if (!dn) {
                continue;
            }
            if (seenNames.has(dn)) {
                setError(`Duplicate display name "${dn}" within this file.`);
                return;
            }
            seenNames.add(dn);
            // Check against other files
            if (animationManager.isDisplayNameUsed(dn, editing.id ?? undefined)) {
                setError(`Display name "${dn}" is already used by another animation file.`);
                return;
            }
        }

        try {
            const animId = editing.id ?? "";

            let fileNames: string[] | undefined;
            if (editing.sourceType === "file" && editing.files.length > 0) {
                if (animId) {
                    fileNames = await animationManager.storeFilesAsync(animId, editing.files);
                }
            } else if (editing.sourceType === "file" && editing.id) {
                const existing = animationManager.getAnimationById(editing.id);
                fileNames = existing?.fileNames;
            }

            let restPoseUpdate: RestPoseDataUpdate | undefined;
            if (editing.restPoseJson.trim()) {
                try {
                    restPoseUpdate = JSON.parse(editing.restPoseJson);
                } catch {
                    setError("Invalid JSON in rest pose data.");
                    return;
                }
            }

            const animation: StoredAnimation = {
                id: animId,
                name: editing.name.trim(),
                source: editing.sourceType,
                url: editing.sourceType === "url" ? editing.url.trim() : undefined,
                fileNames: editing.sourceType === "file" ? fileNames : undefined,
                namingScheme: editing.namingScheme,
                rootNodeName: editing.rootNodeName,
                animations: editing.mappings.map((m) => ({ ...m, displayName: m.displayName.trim() })),
                restPoseUpdate,
                sessionOnly: editing.sessionOnly,
            };

            animationManager.addAnimation(animation);

            if (editing.sourceType === "file" && editing.files.length > 0 && !animId) {
                const storedFileNames = await animationManager.storeFilesAsync(animation.id, editing.files);
                animation.fileNames = storedFileNames;
                animationManager.addAnimation(animation);
            }

            setEditingWithNotify(null);
            setError(null);
            setNodeList([]);
            onMutate();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [editing, animationManager, onMutate, setEditingWithNotify]);

    const handleDelete = useCallback((animation: StoredAnimation) => {
        setConfirmDelete({ id: animation.id, label: animation.name });
    }, []);

    const handleConfirmDelete = useCallback(async () => {
        if (!confirmDelete) {
            return;
        }
        await animationManager.removeAnimationAsync(confirmDelete.id);
        setConfirmDelete(null);
        onMutate();
    }, [confirmDelete, animationManager, onMutate]);

    // ─── Mapping display name helpers ─────────────────────────────────────

    const updateMappingDisplayName = useCallback(
        (index: number, displayName: string) => {
            if (!editing) {
                return;
            }
            setEditing({
                ...editing,
                mappings: editing.mappings.map((m) => (m.index === index ? { ...m, displayName } : m)),
            });
        },
        [editing]
    );

    const getMappingError = useCallback(
        (mapping: AnimationGroupMapping): string | null => {
            if (!editing) {
                return null;
            }
            const dn = mapping.displayName.trim();
            if (!dn) {
                return null;
            }
            // Duplicate within current file
            const duplicateInFile = editing.mappings.some((m) => m.index !== mapping.index && m.displayName.trim() === dn);
            if (duplicateInFile) {
                return "Duplicate name in this file";
            }
            // Duplicate in other files
            if (animationManager.isDisplayNameUsed(dn, editing.id ?? undefined)) {
                return "Name already used";
            }
            return null;
        },
        [editing, animationManager]
    );

    // ─── Drag & drop ──────────────────────────────────────────────────────

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(false);
            if (!editing) {
                return;
            }
            const droppedFiles = Array.from(e.dataTransfer.files);
            if (droppedFiles.length > 0) {
                const updated = { ...editing, sourceType: "file" as const, files: droppedFiles, url: "" };
                setEditing(updated);
                void loadPreview("file", "", droppedFiles, true);
            }
        },
        [editing, loadPreview]
    );

    const handleFileInput = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            if (!editing || !e.target.files) {
                return;
            }
            const selectedFiles = Array.from(e.target.files);
            if (selectedFiles.length > 0) {
                const updated = { ...editing, sourceType: "file" as const, files: selectedFiles, url: "" };
                setEditing(updated);
                void loadPreview("file", "", selectedFiles, true);
            }
        },
        [editing, loadPreview]
    );

    // ─── Render ───────────────────────────────────────────────────────────

    return (
        <div className={classes.panel}>
            {/* Confirm delete dialog */}
            <Dialog
                open={confirmDelete !== null}
                onOpenChange={(_, d) => {
                    if (!d.open) {
                        setConfirmDelete(null);
                    }
                }}
            >
                <DialogSurface className={classes.confirmSurface}>
                    <DialogBody>
                        <DialogTitle>Delete Animation</DialogTitle>
                        <DialogContent>
                            Delete animation <strong>"{confirmDelete?.label}"</strong> and all associated files?
                        </DialogContent>
                        <DialogActions>
                            <Button appearance="secondary" label="Cancel" onClick={() => setConfirmDelete(null)} />
                            <Button appearance="primary" label="Delete" onClick={handleConfirmDelete} />
                        </DialogActions>
                    </DialogBody>
                </DialogSurface>
            </Dialog>

            <div className={classes.listHeader}>
                <div className={classes.listButtons}>
                    <Button icon={AddRegular} label="Add" onClick={startAdd} disabled={!!editing} />
                    <Button icon={DocumentArrowLeftRegular} label="Import from scene" onClick={startImportFromScene} disabled={!!editing || !getCurrentScene()} />
                </div>
            </div>
            {allAnimations.length === 0 && <Caption1 className={classes.emptyMsg}>No custom animations defined.</Caption1>}
            <DataGrid
                items={allAnimations}
                columns={animationColumns}
                getRowId={(item) => item.id}
                className={mergeClasses(editing ? classes.dataGridCompact : classes.dataGridFlex)}
                resizableColumns
                columnSizingOptions={animationColumnSizing}
            >
                <DataGridHeader>
                    <DataGridRow>{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow>
                </DataGridHeader>
                <DataGridBody<StoredAnimation>>
                    {({ item, rowId }) => <DataGridRow<StoredAnimation> key={rowId}>{({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}</DataGridRow>}
                </DataGridBody>
            </DataGrid>

            {editing && (
                <div className={classes.editSectionFlex}>
                    <Body1Strong>{editing.id ? "Edit Animation File" : "New Animation File"}</Body1Strong>

                    {/* Name */}
                    <div className={classes.formRow}>
                        <Label className={classes.formLabel}>Name</Label>
                        <TextInput className={classes.formControl} value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
                    </div>

                    {/* URL input — hidden for scene-sourced entries */}
                    {editing.sourceType !== "scene" && (
                        <div className={classes.formRow}>
                            <Label className={classes.formLabel}>URL</Label>
                            <Input
                                className={classes.formControl}
                                size="small"
                                value={editing.url}
                                placeholder="https://..."
                                onChange={(_, d) => setEditing({ ...editing, url: d.value })}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && editing.url.trim()) {
                                        setEditing({ ...editing, sourceType: "url", files: [] });
                                        void loadPreview("url", editing.url, [], true);
                                    }
                                }}
                                input={{
                                    onBlur: () => {
                                        if (editing.url.trim() && editing.sourceType !== "file") {
                                            void loadPreview("url", editing.url, [], true);
                                        }
                                    },
                                }}
                            />
                        </div>
                    )}

                    {/* Drop zone — hidden for scene-sourced entries */}
                    {editing.sourceType !== "scene" && (
                        <div
                            className={mergeClasses(classes.dropZone, isDragOver ? classes.dropZoneActive : undefined)}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <ArrowUploadRegular />
                            <div>Drop file(s) here or click to browse</div>
                            <input ref={fileInputRef} type="file" multiple className={classes.hiddenInput} onChange={handleFileInput} />
                        </div>
                    )}

                    {/* Loading indicator */}
                    {isLoading && (
                        <Caption1 className={classes.subtleText}>
                            Loading… <Spinner size="tiny" className={classes.spinnerInline} />
                        </Caption1>
                    )}

                    {/* Animation group mapping table */}
                    {editing.mappings.length > 0 && (
                        <>
                            <Caption1 className={classes.subtleText}>
                                Assign display names to animation groups ({editing.mappings.length} found). Leave empty to exclude an animation.
                            </Caption1>
                            <div className={classes.animList}>
                                {editing.mappings.map((mapping) => {
                                    const rowError = getMappingError(mapping);
                                    return (
                                        <div key={mapping.index} className={classes.animRow}>
                                            <Caption1 className={classes.animRowName} title={mapping.groupName}>
                                                {mapping.groupName}
                                            </Caption1>
                                            <Input
                                                className={classes.animRowInput}
                                                size="small"
                                                placeholder="Display name"
                                                value={mapping.displayName}
                                                onChange={(_, d) => updateMappingDisplayName(mapping.index, d.value)}
                                            />
                                            {rowError && <Caption1 className={classes.animRowError}>{rowError}</Caption1>}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {/* Node tree for root node selection */}
                    {nodeList.length > 0 && (
                        <>
                            <Caption1 className={classes.subtleText}>Select the root node for skeleton creation ({nodeList.length} nodes found):</Caption1>
                            <div className={classes.nodeTree}>
                                {nodeList.map((node, idx) => (
                                    <div
                                        key={idx}
                                        className={mergeClasses(classes.nodeRow, editing.rootNodeIndex === idx ? classes.nodeRowSelected : undefined)}
                                        onClick={() => {
                                            // Collect descendant names for naming scheme detection
                                            const selectedDepth = node.depth;
                                            const descendantNames = new Set<string>();
                                            descendantNames.add(node.name);
                                            for (let j = idx + 1; j < nodeList.length; j++) {
                                                if (nodeList[j].depth <= selectedDepth) {
                                                    break;
                                                }
                                                descendantNames.add(nodeList[j].name);
                                            }
                                            const detected = DetectNamingScheme(descendantNames, namingSchemeManager);
                                            setEditing({
                                                ...editing,
                                                rootNodeIndex: idx,
                                                rootNodeName: node.name,
                                                ...(detected ? { namingScheme: detected } : {}),
                                            });
                                        }}
                                    >
                                        {node.prefix + node.name}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Naming scheme */}
                    <div className={classes.formRow}>
                        <Label className={classes.formLabel}>Naming scheme</Label>
                        <StringDropdown
                            className={classes.formControl}
                            value={editing.namingScheme}
                            options={schemeNames.map((n) => ({ label: n, value: n }))}
                            onChange={(v) => setEditing({ ...editing, namingScheme: v })}
                        />
                    </div>

                    {/* Rest pose data */}
                    <div className={mergeClasses(classes.formRow, classes.formRowAlignStart)}>
                        <Label className={mergeClasses(classes.formLabel, classes.formLabelPadTop)}>Rest pose data</Label>
                        <Textarea
                            className={classes.restPoseTextarea}
                            value={editing.restPoseJson}
                            placeholder='JSON array (optional). Use gizmos + "Save as rest pose" to generate this data.'
                            onChange={(newVal) => setEditing({ ...editing, restPoseJson: newVal })}
                        />
                    </div>

                    {warning && <Caption1 className={classes.warningText}>{warning}</Caption1>}
                    {error && <Caption1 className={classes.errorText}>{error}</Caption1>}
                    <div className={classes.actionRow}>
                        <Button appearance="secondary" label="Cancel" onClick={handleCancel} />
                        <Button appearance="primary" label="Save" onClick={handleSave} />
                    </div>
                </div>
            )}
        </div>
    );
};
