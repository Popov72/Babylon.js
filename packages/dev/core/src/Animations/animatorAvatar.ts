import type {
    AbstractMesh,
    MorphTargetManager,
    TransformNode,
    Immutable,
    Bone,
    Nullable,
    MorphTarget,
    AnimationGroup,
    Animation,
    Node,
    Skeleton,
    TargetedAnimation,
} from "core/index";
import { Vector3, Quaternion, TmpVectors } from "core/Maths/math.vector";
import { Logger } from "../Misc/logger";

/**
 * Options for retargeting an animation group to an avatar.
 */
export interface IRetargetOptions {
    /**
     * If true, the animation group will be cloned before retargeting, leaving the original animation group unchanged.
     * If false, the original animation group will be modified (targets and animations).
     * Default is true.
     */
    cloneAnimationGroup?: boolean;

    /**
     * The name to assign to the cloned animation group if cloneAnimationGroup is true.
     * If not specified, the same name as the original animation group will be used.
     */
    clonedAnimationGroupName?: string;

    /**
     * If true, the retargeted animations will be fixed to correct common issues like orthogonal quaternions.
     * Default is true.
     */
    fixAnimations?: boolean;

    /**
     * If true, the parent hierarchy of bones and transform nodes will be checked during retargeting.
     * Animations will be removed if the hierarchies don't match.
     * Default is true.
     */
    checkHierarchy?: boolean;

    /**
     * If true, the frame values in the animation keyframes will be adjusted during retargeting to account for differences
     * between the source and target bone transforms.
     * Default is true.
     */
    retargetAnimationKeys?: boolean;
}

/**
 * Represents an animator avatar that manages skeletons and morph target managers for a hierarchical transform node and mesh structure.
 * This class is used to group and manage animation-related resources (skeletons and morph targets) associated with a root transform node and its descendants.
 */
export class AnimatorAvatar {
    /**
     * Set of skeletons found in the mesh hierarchy.
     * Each skeleton in this set has its bones linked to corresponding transform nodes.
     */
    public skeletons: Set<Skeleton>;

    /**
     * Set of morph target managers found in the mesh hierarchy.
     * Each morph target manager is configured with the appropriate mesh name and influencer count.
     */
    public morphTargetManagers: Set<MorphTargetManager>;

    private _mapMorphTargetNameToMorphTarget: Map<string, MorphTarget>;
    /**
     * Map of morph target names to their corresponding MorphTarget instances.
     * The keys are constructed using the format "meshName_morphTargetName".
     */
    public get mapMorphTargetNameToMorphTarget(): Immutable<Map<string, MorphTarget>> {
        if (!this._mapMorphTargetNameToMorphTarget) {
            this._buildMorphTargetMap();
        }
        return this._mapMorphTargetNameToMorphTarget;
    }

    /**
     * Indicates whether to show warnings during retargeting operations.
     */
    public showWarnings = true;

    /**
     * Creates an instance of AnimatorAvatar.
     * @param name - The name to assign to this avatar and its root node
     * @param rootNode - The root node of the avatar hierarchy. This node and its descendants will be scanned for skeletons and morph target managers. If not provided, you are expected to manually manage skeletons and morph target managers.
     * @param _disposeResources - Indicates whether to dispose of resources (skeletons, morph target managers, root node and descendants + materials and textures) when the avatar is disposed (true by default)
     */
    constructor(
        public readonly name: string,
        public readonly rootNode?: TransformNode,
        private _disposeResources = true
    ) {
        this.skeletons = new Set<Skeleton>();
        this.morphTargetManagers = new Set<MorphTargetManager>();

        if (!rootNode) {
            return;
        }

        rootNode.name = name;

        if (!rootNode.rotationQuaternion) {
            rootNode.rotationQuaternion = new Quaternion();
        }

        rootNode
            .getChildMeshes(false, (node) => {
                const mesh = node as AbstractMesh;
                return mesh.getTotalVertices && mesh.getTotalVertices() > 0;
            })
            .forEach((mesh) => {
                if (mesh.skeleton) {
                    this.skeletons.add(mesh.skeleton);
                }

                if (mesh.morphTargetManager) {
                    mesh.morphTargetManager.meshName = mesh.name;
                    mesh.morphTargetManager.numMaxInfluencers = mesh.morphTargetManager.numTargets;

                    this.morphTargetManagers.add(mesh.morphTargetManager);
                }
            });
    }

    /**
     * Finds a bone in the avatar's skeletons by its linked transform node or the name of the linked transform node.
     * @param nameOrTransformNode The linked transform node or the name of the linked transform node
     * @returns The found bone or null if not found
     */
    public findBone(nameOrTransformNode: string | TransformNode): Nullable<Bone> {
        const isName = !this._isTransformNode(nameOrTransformNode);
        const iterator = this.skeletons.keys();

        let bone: Nullable<Bone> = null;

        for (let key = iterator.next(); key.done !== true; key = iterator.next()) {
            const skeleton = key.value;

            if (isName) {
                bone = skeleton.findBoneFromLinkedTransformNodeName(nameOrTransformNode);
            } else {
                bone = skeleton.findBoneFromLinkedTransformNode(nameOrTransformNode);
            }

            if (bone) {
                return bone;
            }
        }

        return null;
    }

    /**
     * Make sures that the animation group passed as the first parameter will animate the bones in the skeleton(s) / the morphs in the morph target manager(s) of the avatar.
     * Retargeting is based on the names of the targets (TransformNode or MorphTarget) in the animation and the names of the bones in the skeleton / morph targets in the morph target manager.
     * So make sure the names are the same in both cases!
     * If no bones with the same name as a target (TransformNode) of a targeted animation are found, the targeted animation is removed from the animation group.
     * Same for morph targets.
     * @param animationGroup The animation group to retarget
     * @param options Options for retargeting the animation group (optional)
     * @returns The retargeted animation group (a clone if the cloneAnimationGroup option is true (which is the default), otherwise the original animation group)
     */
    public retargetAnimationGroup(animationGroup: AnimationGroup, options?: IRetargetOptions): AnimationGroup {
        const localOptions: IRetargetOptions = {
            cloneAnimationGroup: true,
            clonedAnimationGroupName: animationGroup.name,
            fixAnimations: true,
            checkHierarchy: true,
            retargetAnimationKeys: true,
            ...options,
        };

        if (localOptions.cloneAnimationGroup) {
            animationGroup = animationGroup.clone(localOptions.clonedAnimationGroupName!, undefined, true, true);
        }

        const mapTransformNodeToRootNode: Map<TransformNode, Node> = new Map<TransformNode, Node>();
        const lstAnims = new Set<Animation>();

        for (let i = 0; i < animationGroup.targetedAnimations.length; ++i) {
            const ta = animationGroup.targetedAnimations[i];
            const animation = ta.animation;

            if (lstAnims.has(animation)) {
                Logger.Warn(
                    `RetargetAnimationGroup - Avatar '${this.name}', AnimationGroup '${animationGroup.name}': animation '${animation.name}' is used multiple times in the same animation group: duplicated animations are not supported, the retargeted animation may not work as expected`
                );
            }

            lstAnims.add(animation);

            switch (animation.targetProperty) {
                case "influence": {
                    if (!this._retargetMorphTarget(ta, animationGroup.name)) {
                        animationGroup.targetedAnimations.splice(i, 1);
                        i--;
                    }
                    break;
                }
                case "position":
                case "rotationQuaternion":
                case "scaling": {
                    if (ta.target.getClassName?.() !== "TransformNode") {
                        break;
                    }

                    const sourceTransformNode = ta.target as TransformNode;
                    const targetBone = this.findBone(sourceTransformNode.name);

                    if (!targetBone) {
                        if (this.showWarnings) {
                            Logger.Warn(
                                `RetargetAnimationGroup - Avatar '${this.name}', AnimationGroup '${animationGroup.name}': "${sourceTransformNode.name}" bone not found in any skeleton of avatar: animation removed`
                            );
                        }
                        break;
                    }

                    if (!this._retargetTransformNodeToBone(ta, sourceTransformNode, targetBone, animationGroup.name, mapTransformNodeToRootNode, !!localOptions.checkHierarchy)) {
                        animationGroup.targetedAnimations.splice(i, 1);
                        i--;
                    } else if (localOptions.retargetAnimationKeys) {
                        this._retargetAnimationKeys(ta.animation, sourceTransformNode, targetBone);
                    }

                    break;
                }
            }
        }

        if (localOptions.fixAnimations) {
            this._fixAnimationGroup(animationGroup);
        }

        return animationGroup;
    }

    private _retargetMorphTarget(ta: TargetedAnimation, animationGroupName: string) {
        const morphTarget = ta.target as MorphTarget;
        const key = morphTarget.morphTargetManager?.meshName + "_" + morphTarget.name;

        if (!this.mapMorphTargetNameToMorphTarget.has(key)) {
            if (this.showWarnings) {
                Logger.Warn(
                    `RetargetAnimationGroup - Avatar '${this.name}', AnimationGroup '${animationGroupName}': "${morphTarget.name}" morph target not found in morph target manager of mesh "${morphTarget.morphTargetManager?.meshName}": animation removed`
                );
            }
            return false;
        }

        ta.target = this.mapMorphTargetNameToMorphTarget.get(key)!;

        return true;
    }

    private _retargetTransformNodeToBone(
        ta: TargetedAnimation,
        sourceTransformNode: TransformNode,
        targetBone: Bone,
        animationGroupName: string,
        mapTransformNodeToRootNode: Map<TransformNode, Node>,
        checkHierarchy: boolean
    ) {
        if (checkHierarchy) {
            let rootNode = mapTransformNodeToRootNode.get(sourceTransformNode);

            if (!rootNode) {
                rootNode = this._getRootNode(sourceTransformNode);
                mapTransformNodeToRootNode.set(sourceTransformNode, rootNode);
            }

            if (!this._checkParentHierarchy(targetBone, rootNode!)) {
                if (this.showWarnings) {
                    Logger.Warn(
                        `RetargetAnimationGroup - Avatar '${this.name}', AnimationGroup '${animationGroupName}': parent hierarchy mismatch between bone "${targetBone.name}" and transform node "${sourceTransformNode.name}": animation removed`
                    );
                }
                return false;
            }
        }

        ta.target = targetBone._linkedTransformNode;

        return true;
    }

    private _retargetAnimationKeys(animation: Animation, sourceTransformNode: TransformNode, targetBone: Bone) {
        const isRootBone = !targetBone.parent;
        const keys = animation.getKeys();

        const sourceTransformNodeInverseRotation = sourceTransformNode.rotationQuaternion!.conjugate();
        const sourceTransformationInverseScaling = new Vector3(1 / sourceTransformNode.scaling.x, 1 / sourceTransformNode.scaling.y, 1 / sourceTransformNode.scaling.z);

        const targetBonePosition = targetBone.position;
        const targetBoneRotation = targetBone.rotationQuaternion;
        const targetBoneScaling = targetBone.scaling;
        // const targetBonePosition = TmpVectors.Vector3[3];
        // const targetBoneRotation = TmpVectors.Quaternion[2];
        // const targetBoneScaling = TmpVectors.Vector3[4];

        // targetBone.getBindMatrix().decompose(targetBoneScaling, targetBoneRotation, targetBonePosition);

        // Difference between target and source
        const diffQuaternion = sourceTransformNodeInverseRotation.multiplyToRef(targetBoneRotation, TmpVectors.Quaternion[0]).normalize();
        const diffPosition = targetBonePosition.subtractToRef(sourceTransformNode.position, TmpVectors.Vector3[0]);
        const diffScaling = targetBoneScaling.divideToRef(sourceTransformNode.scaling, TmpVectors.Vector3[1]);

        switch (animation.targetProperty) {
            case "rotationQuaternion": {
                if (isRootBone) {
                    for (const key of keys) {
                        const quaternion = key.value as Quaternion;

                        key.value = quaternion.multiplyInPlace(diffQuaternion);
                    }
                } else {
                    for (const key of keys) {
                        const quaternion = key.value as Quaternion;
                        const animDiffQuaternion = sourceTransformNodeInverseRotation.multiplyToRef(quaternion, TmpVectors.Quaternion[1]);

                        key.value = targetBoneRotation.multiplyToRef(animDiffQuaternion, TmpVectors.Quaternion[1]).normalizeToRef(quaternion);
                    }
                }
                break;
            }
            case "position": {
                for (const key of keys) {
                    const position = key.value as Vector3;

                    key.value = diffPosition.addToRef(position, position);
                }
                break;
            }
            case "scaling": {
                if (isRootBone) {
                    for (const key of keys) {
                        const scaling = key.value as Vector3;

                        key.value = scaling.multiplyInPlace(diffScaling);
                    }
                } else {
                    for (const key of keys) {
                        const scaling = key.value as Vector3;
                        const animDiffScaling = sourceTransformationInverseScaling.multiplyToRef(scaling, TmpVectors.Vector3[2]);

                        key.value = targetBoneScaling.multiplyToRef(animDiffScaling, scaling);
                    }
                }
                break;
            }
        }
    }

    /**
     * Disposes of the avatar and releases all associated resources.
     * This will dispose all skeletons, morph target managers, and the root mesh with its descendants (including materials and textures).
     * If disposeResources was set to false in the constructor, this method does nothing.
     */
    public dispose(): void {
        if (!this._disposeResources) {
            return;
        }

        const iterator = this.skeletons.keys();
        for (let key = iterator.next(); key.done !== true; key = iterator.next()) {
            key.value.dispose();
        }

        const iterator2 = this.morphTargetManagers.keys();
        for (let key = iterator2.next(); key.done !== true; key = iterator2.next()) {
            key.value.dispose();
        }

        this.rootNode?.dispose(false, true);
    }

    private _isTransformNode(nameOrTransformNode: string | TransformNode): nameOrTransformNode is TransformNode {
        return typeof nameOrTransformNode !== "string";
    }

    private _buildMorphTargetMap(): void {
        this._mapMorphTargetNameToMorphTarget = new Map<string, MorphTarget>();

        for (const manager of this.morphTargetManagers) {
            const numTargets = manager.numTargets;

            for (let t = 0; t < numTargets; ++t) {
                const target = manager.getTarget(t);
                const key = manager.meshName + "_" + target.name;

                this._mapMorphTargetNameToMorphTarget.set(key, target);
            }
        }
    }

    /**
     * This method does two things:
     *   - It deletes a targeted animation if a bone corresponding to the target cannot be found
     *   - It corrects quaternion animations when two consecutive quaternions are orthogonal to each other. When this happens, in 99.99% of cases it's an error
     *     in the animation data, as two consecutive rotations should normally be close to each other and not have a large gap.
     *     The fix is to copy the first quaternion into the second.
     * @param animationGroup The animation group to fix
     * @internal
     */
    private _fixAnimationGroup(animationGroup: AnimationGroup) {
        for (let i = 0; i < animationGroup.targetedAnimations.length; ++i) {
            const ta = animationGroup.targetedAnimations[i];

            switch (ta.animation.targetProperty) {
                case "position":
                case "rotationQuaternion":
                case "scaling": {
                    if (ta.target.getClassName() !== "TransformNode") {
                        break;
                    }

                    const transformNode = ta.target as TransformNode;
                    const bone = this.findBone(transformNode);

                    if (!bone) {
                        if (this.showWarnings) {
                            Logger.Warn(
                                `FixAnimationGroup - Avatar '${this.name}', AnimationGroup '${animationGroup.name}': no bone in any skeleton of the avatar ${this.name} animates the transform node ${transformNode.name}: animation removed`
                            );
                        }
                        animationGroup.targetedAnimations.splice(i, 1);
                        i--;
                        continue;
                    }

                    ta.target = bone._linkedTransformNode;

                    if (ta.animation.targetProperty === "rotationQuaternion") {
                        this._fixAnimationQuaternion(ta.animation);
                    }
                }
            }
        }
    }

    private _fixAnimationQuaternion(animation: Animation, epsilon = 0.001) {
        const keys = animation.getKeys();

        for (let i = 0; i < keys.length - 1; ++i) {
            const curQuat = keys[i].value as Quaternion;
            const nextQuat = keys[i + 1].value as Quaternion;

            if (Math.abs(Quaternion.Dot(curQuat, nextQuat)) < epsilon) {
                keys[i + 1].value = curQuat.clone();
                i += 1;
            }
        }
    }

    private _getRootNode(node: Node): Node {
        let current: Node = node;

        while (current.parent) {
            current = current.parent;
        }

        return current;
    }

    /**
     * Checks whether the parent hierarchy of a bone matches that of a given transform node. Checks are performed by name.
     * It works by first finding the transform node in the descendants of the root transform node that matches the bone's linked transform node.
     * Then it traverses up the hierarchy of both the bone and the transform node, comparing their names at each level.
     * @param bone The bone to check
     * @param rootTransformNode The root transform node to check against
     * @returns True if the hierarchies match, false otherwise
     * @internal
     */
    private _checkParentHierarchy(bone: Bone, rootTransformNode: Node) {
        const children = rootTransformNode.getDescendants(false, (node) => node.name === bone._linkedTransformNode!.name);
        if (!children || children.length !== 1) {
            return false;
        }

        let transformNode: Nullable<Node> = children[0];

        while (bone) {
            if (bone._linkedTransformNode!.name !== transformNode?.name) {
                return false;
            }

            bone = bone.parent;
            transformNode = transformNode.parent;
        }

        return true;
    }
}
