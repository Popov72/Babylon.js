import type { FunctionComponent } from "react";
import type { AvatarManager, StoredAvatar, RestPoseDataUpdate } from "./avatarManager";
import type { NamingSchemeManager } from "./namingSchemeManager";
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
import type { Node } from "core/node";
import type { AbstractMesh } from "core/Meshes/abstractMesh";
import { FilesInputStore } from "core/Misc/filesInputStore";

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
    nodeTree: {
        flex: 1,
        overflowY: "auto",
        border: `1px solid ${tokens.colorNeutralStroke2}`,
        borderRadius: tokens.borderRadiusMedium,
        minHeight: "80px",
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

type AvatarEdit = {
    id: string | null;
    originalName: string | null;
    name: string;
    sourceType: "url" | "file" | "scene";
    url: string;
    files: File[];
    /** Index into the nodeList array — used for unique selection in the dialog. */
    rootNodeIndex: number;
    /** Name of the root node — for display and scene-source lookup. */
    rootNodeName: string;
    namingScheme: string;
    restPoseJson: string;
    sessionOnly?: boolean;
};

type NodeInfo = {
    name: string;
    depth: number;
    /** Index in scene.meshes (-1 if not a mesh). */
    meshIndex: number;
    /** Pre-computed tree prefix using box-drawing characters (e.g. "│  ├─ "). */
    prefix: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively builds a flat node list with tree-drawing prefixes.
 * `ancestorContinues` tracks, for each ancestor depth, whether a vertical line should continue
 * (i.e. the ancestor has more siblings below it).
 * @param node - The current node.
 * @param depth - The current depth level.
 * @param list - The flat list being built.
 * @param ancestorContinues - Tracks vertical line continuation per depth.
 * @param meshes - Optional meshes array for mesh index lookup.
 */
function BuildNodeList(node: Node, depth: number, list: NodeInfo[], ancestorContinues: boolean[], meshes?: AbstractMesh[]): void {
    let prefix = "";
    if (depth > 0) {
        // Draw continuation lines for ancestors
        for (let i = 1; i < depth; i++) {
            prefix += ancestorContinues[i] ? "│  " : "   ";
        }
        // Draw the branch connector for this node
        const isLast = !ancestorContinues[depth];
        prefix += isLast ? "└─ " : "├─ ";
    }
    const meshIndex = meshes ? meshes.indexOf(node as AbstractMesh) : -1;
    list.push({ name: node.name, depth, meshIndex, prefix });

    const children = node.getChildren();
    for (let i = 0; i < children.length; i++) {
        const isLastChild = i === children.length - 1;
        ancestorContinues[depth + 1] = !isLastChild;
        BuildNodeList(children[i], depth + 1, list, ancestorContinues, meshes);
    }
}

/**
 * Detects the best matching naming scheme by checking how many node names
 * appear in each scheme. Returns the scheme with the most matches
 * (minimum 10 required), or null if none qualify.
 * @param nodeNames - Set of node names to match against schemes.
 * @param namingSchemeManager - The naming scheme manager.
 * @returns The best matching scheme name, or null.
 */
function DetectNamingScheme(nodeNames: Set<string>, namingSchemeManager: NamingSchemeManager): string | null {
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
        for (const name of nodeNames) {
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

export const AvatarsPanel: FunctionComponent<{
    avatarManager: AvatarManager;
    namingSchemeManager: NamingSchemeManager;
    getCurrentScene: () => Nullable<Scene>;
    onMutate: () => void;
    onEditingChange: (editing: boolean) => void;
}> = ({ avatarManager, namingSchemeManager, getCurrentScene, onMutate, onEditingChange }) => {
    const classes = useStyles();
    const [editing, setEditing] = useState<AvatarEdit | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
    const [nodeList, setNodeList] = useState<NodeInfo[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);

    // Temp engine/scene for preview loading
    const tempEngineRef = useRef<NullEngine | null>(null);
    const tempSceneRef = useRef<Scene | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Dispose temp engine on unmount
    useEffect(() => {
        return () => {
            tempSceneRef.current?.dispose();
            tempEngineRef.current?.dispose();
        };
    }, []);

    const setEditingWithNotify = useCallback(
        (value: AvatarEdit | null) => {
            setEditing(value);
            onEditingChange(value !== null);
        },
        [onEditingChange]
    );

    const allAvatars = [...avatarManager.getAllAvatars()].sort((a, b) => a.name.localeCompare(b.name));
    const schemeNames = namingSchemeManager.getAllSchemeNames();

    const avatarColumnSizing: TableColumnSizingOptions = {
        name: { defaultWidth: 150 },
        source: { defaultWidth: 60 },
        scheme: { defaultWidth: 150 },
        actions: { defaultWidth: 80 },
    };

    const avatarColumns: TableColumnDefinition<StoredAvatar>[] = [
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
            setNodeList([]);
            setError(null);

            // Dispose previous temp scene/engine
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
                    // Register all files in FilesInputStore so the scene loader can resolve relative references.
                    // Keys must be lowercase filenames — this matches how fileTools.ts resolves "file:" URLs.
                    let sceneFile: File | undefined;
                    for (const file of files) {
                        const name = file.name.toLowerCase();
                        FilesInputStore.FilesToLoad[name] = file;
                        // The main scene file is the one whose extension has a registered loader plugin
                        const ext = name.split(".").pop();
                        if (ext && SceneLoader.IsPluginForExtensionAvailable("." + ext)) {
                            sceneFile = file;
                        }
                    }
                    if (!sceneFile) {
                        sceneFile = files[0];
                    }
                    // Use "file:" as rootUrl so the loader resolves relative assets (e.g. .bin, textures) from FilesInputStore
                    await ImportMeshAsync(sceneFile.name, scene, { rootUrl: "file:" });
                }

                // Build the node tree from root nodes
                const nodes: NodeInfo[] = [];
                const rootNodes = scene.rootNodes;
                const meshList = [...scene.meshes];
                for (let i = 0; i < rootNodes.length; i++) {
                    const ancestorContinues: boolean[] = [];
                    ancestorContinues[0] = i < rootNodes.length - 1;
                    BuildNodeList(rootNodes[i], 0, nodes, ancestorContinues, meshList);
                }
                setNodeList(nodes);
                // Auto-select first node and optionally detect the naming scheme
                if (nodes.length > 0) {
                    let detectedScheme: string | null = null;

                    if (autoDetectScheme) {
                        const nodeNames = new Set(nodes.map((n) => n.name));
                        detectedScheme = DetectNamingScheme(nodeNames, namingSchemeManager);

                        // Fallback: if no match from node names, try skeleton bone names
                        if (!detectedScheme) {
                            const boneNames = new Set<string>();
                            for (const mesh of scene.meshes) {
                                if (mesh.skeleton) {
                                    for (const bone of mesh.skeleton.bones) {
                                        boneNames.add(bone.name);
                                    }
                                }
                            }
                            if (boneNames.size > 0) {
                                detectedScheme = DetectNamingScheme(boneNames, namingSchemeManager);
                            }
                        }
                    }

                    setEditing((prev) => {
                        if (!prev) {
                            return prev;
                        }
                        // Resolve rootNodeIndex: use existing if valid, else find by name, else default to 0
                        let idx = prev.rootNodeIndex;
                        if (idx < 0 && prev.rootNodeName) {
                            idx = nodes.findIndex((n) => n.name === prev.rootNodeName);
                        }
                        if (idx < 0) {
                            idx = 0;
                        }

                        // Detect naming scheme from the selected node's subtree
                        let scheme = detectedScheme;
                        if (!scheme) {
                            const selectedDepth = nodes[idx].depth;
                            const descendantNames = new Set<string>();
                            descendantNames.add(nodes[idx].name);
                            for (let j = idx + 1; j < nodes.length; j++) {
                                if (nodes[j].depth <= selectedDepth) {
                                    break;
                                }
                                descendantNames.add(nodes[j].name);
                            }
                            scheme = DetectNamingScheme(descendantNames, namingSchemeManager);
                        }

                        return {
                            ...prev,
                            rootNodeIndex: idx,
                            rootNodeName: prev.rootNodeName || nodes[idx].name,
                            ...(scheme ? { namingScheme: scheme } : {}),
                        };
                    });
                }
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
            originalName: null,
            name: "",
            sourceType: "url",
            url: "",
            files: [],
            rootNodeIndex: -1,
            rootNodeName: "",
            namingScheme: schemeNames[0] ?? "",
            restPoseJson: "",
        });
        setError(null);
        setNodeList([]);
    }, [schemeNames, setEditingWithNotify]);

    const startEdit = useCallback(
        async (avatar: StoredAvatar) => {
            setEditingWithNotify({
                id: avatar.id,
                originalName: avatar.name,
                name: avatar.name,
                sourceType: avatar.source,
                url: avatar.url ?? "",
                files: [],
                rootNodeIndex: -1,
                rootNodeName: avatar.rootNodeName,
                namingScheme: avatar.namingScheme,
                restPoseJson: avatar.restPoseUpdate ? JSON.stringify(avatar.restPoseUpdate, undefined, 2) : "",
                sessionOnly: avatar.sessionOnly,
            });
            setError(null);
            setNodeList([]);
            // Auto-load preview
            if (avatar.source === "scene") {
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
                    const foundIdx = nodes.findIndex((n) => n.name === avatar.rootNodeName);
                    if (foundIdx >= 0) {
                        setEditing((prev) => (prev ? { ...prev, rootNodeIndex: foundIdx } : prev));
                    }
                }
            } else if (avatar.source === "url" && avatar.url) {
                void loadPreview("url", avatar.url, [], false);
            } else if (avatar.source === "file" && avatar.fileNames?.length) {
                const files = await avatarManager.getFilesAsync(avatar.id, avatar.fileNames);
                if (files.length > 0) {
                    void loadPreview("file", "", files, false);
                }
            }
        },
        [setEditingWithNotify, loadPreview, avatarManager, getCurrentScene]
    );

    const startImportFromScene = useCallback(() => {
        const scene = getCurrentScene();
        if (!scene) {
            return;
        }

        setEditingWithNotify({
            id: null,
            originalName: null,
            name: "",
            sourceType: "scene",
            url: "",
            files: [],
            rootNodeIndex: -1,
            rootNodeName: "",
            namingScheme: schemeNames[0] ?? "",
            restPoseJson: "",
            sessionOnly: true,
        });
        setError(null);

        // Build node tree directly from the PG scene's root nodes
        const nodes: NodeInfo[] = [];
        const rootNodes = scene.rootNodes;
        for (let i = 0; i < rootNodes.length; i++) {
            const ancestorContinues: boolean[] = [];
            ancestorContinues[0] = i < rootNodes.length - 1;
            BuildNodeList(rootNodes[i], 0, nodes, ancestorContinues);
        }
        setNodeList(nodes);

        // Auto-detect naming scheme from the first (default-selected) node's subtree
        let detectedScheme: string | null = null;
        if (nodes.length > 0) {
            const firstDepth = nodes[0].depth;
            const descendantNames = new Set<string>();
            descendantNames.add(nodes[0].name);
            for (let j = 1; j < nodes.length; j++) {
                if (nodes[j].depth <= firstDepth) {
                    break;
                }
                descendantNames.add(nodes[j].name);
            }
            detectedScheme = DetectNamingScheme(descendantNames, namingSchemeManager);
        }
        // Fallback: try skeleton bone names
        if (!detectedScheme) {
            const boneNames = new Set<string>();
            for (const mesh of scene.meshes) {
                if (mesh.skeleton) {
                    for (const bone of mesh.skeleton.bones) {
                        boneNames.add(bone.name);
                    }
                }
            }
            if (boneNames.size > 0) {
                detectedScheme = DetectNamingScheme(boneNames, namingSchemeManager);
            }
        }

        if (nodes.length > 0) {
            setEditing((prev) => {
                if (!prev) {
                    return prev;
                }
                return {
                    ...prev,
                    rootNodeIndex: 0,
                    rootNodeName: nodes[0].name,
                    ...(detectedScheme ? { namingScheme: detectedScheme } : {}),
                };
            });
        }
    }, [getCurrentScene, schemeNames, setEditingWithNotify, namingSchemeManager]);

    const handleCancel = useCallback(() => {
        setEditingWithNotify(null);
        setError(null);
        setNodeList([]);
        // Dispose temp scene
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
        if (!editing.rootNodeName) {
            setError("Please load the file and select a root node.");
            return;
        }
        if (!editing.namingScheme) {
            setError("Please select a naming scheme.");
            return;
        }
        // Check for duplicate name (only when adding or renaming)
        if (editing.originalName !== editing.name.trim()) {
            const existing = avatarManager.getAvatar(editing.name.trim());
            if (existing) {
                setError(`An avatar named "${editing.name.trim()}" already exists.`);
                return;
            }
        }

        try {
            // Use existing id or let addAvatar generate a new one
            const avatarId = editing.id ?? "";

            let fileNames: string[] | undefined;
            if (editing.sourceType === "file" && editing.files.length > 0) {
                // For new avatars, we pass "" and addAvatar will assign the id before we store.
                // So we need to store files after addAvatar for new entries. Let's handle this:
                if (avatarId) {
                    fileNames = await avatarManager.storeFilesAsync(avatarId, editing.files);
                }
            } else if (editing.sourceType === "file" && editing.id) {
                // Editing an existing file-based avatar without new files — keep existing file names
                const existing = avatarManager.getAvatarById(editing.id);
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

            const selectedNode = editing.rootNodeIndex >= 0 ? nodeList[editing.rootNodeIndex] : undefined;
            const avatar: StoredAvatar = {
                id: avatarId,
                name: editing.name.trim(),
                source: editing.sourceType,
                url: editing.sourceType === "url" ? editing.url.trim() : undefined,
                fileNames: editing.sourceType === "file" ? fileNames : undefined,
                namingScheme: editing.namingScheme,
                rootNodeName: editing.rootNodeName,
                rootNodeIndex: editing.sourceType !== "scene" && selectedNode ? selectedNode.meshIndex : undefined,
                restPoseUpdate,
                sessionOnly: editing.sessionOnly,
            };

            avatarManager.addAvatar(avatar);

            // For new file-based avatars, the id was just generated by addAvatar — store files now
            if (editing.sourceType === "file" && editing.files.length > 0 && !avatarId) {
                const storedFileNames = await avatarManager.storeFilesAsync(avatar.id, editing.files);
                avatar.fileNames = storedFileNames;
                avatarManager.addAvatar(avatar); // update with file names
            }

            setEditingWithNotify(null);
            setError(null);
            setNodeList([]);
            onMutate();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [editing, avatarManager, onMutate, setEditingWithNotify]);

    const handleDelete = useCallback((avatar: StoredAvatar) => {
        setConfirmDelete({ id: avatar.id, name: avatar.name });
    }, []);

    const handleConfirmDelete = useCallback(async () => {
        if (!confirmDelete) {
            return;
        }
        await avatarManager.removeAvatarAsync(confirmDelete.id);
        setConfirmDelete(null);
        onMutate();
    }, [confirmDelete, avatarManager, onMutate]);

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
                        <DialogTitle>Delete Avatar</DialogTitle>
                        <DialogContent>
                            Delete avatar <strong>"{confirmDelete?.name}"</strong> and all associated files?
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
            {allAvatars.length === 0 && <Caption1 className={classes.emptyMsg}>No custom avatars defined.</Caption1>}
            <DataGrid
                items={allAvatars}
                columns={avatarColumns}
                getRowId={(item) => item.id}
                className={mergeClasses(editing ? classes.dataGridCompact : classes.dataGridFlex)}
                resizableColumns
                columnSizingOptions={avatarColumnSizing}
            >
                <DataGridHeader>
                    <DataGridRow>{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow>
                </DataGridHeader>
                <DataGridBody<StoredAvatar>>
                    {({ item, rowId }) => <DataGridRow<StoredAvatar> key={rowId}>{({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}</DataGridRow>}
                </DataGridBody>
            </DataGrid>

            {editing && (
                <div className={classes.editSectionFlex}>
                    <Body1Strong>{editing.originalName ? `Editing "${editing.originalName}"` : "New Avatar"}</Body1Strong>

                    {/* Name */}
                    <div className={classes.formRow}>
                        <Label className={classes.formLabel}>Name</Label>
                        <TextInput className={classes.formControl} value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
                    </div>

                    {/* URL input — loads on Enter or blur (hidden for scene-sourced entries) */}
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

                    {/* Node tree */}
                    {nodeList.length > 0 && (
                        <>
                            <Caption1 className={classes.subtleText}>Select the root node of the avatar ({nodeList.length} nodes found):</Caption1>
                            <div className={classes.nodeTree}>
                                {nodeList.map((node, idx) => (
                                    <div
                                        key={idx}
                                        className={mergeClasses(classes.nodeRow, editing.rootNodeIndex === idx ? classes.nodeRowSelected : undefined)}
                                        onClick={() => {
                                            // Collect descendant names from the selected node for naming scheme detection
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
