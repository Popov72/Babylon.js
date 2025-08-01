import { VertexBuffer } from "../Buffers/buffer";
import type { SubMesh } from "../Meshes/subMesh";
import type { _InstancesBatch } from "../Meshes/mesh";
import { Mesh } from "../Meshes/mesh";
import { Scene } from "../scene";
import type { AbstractEngine } from "../Engines/abstractEngine";
import { Constants } from "../Engines/constants";
import type { ISceneComponent } from "../sceneComponent";
import { SceneComponentConstants } from "../sceneComponent";
import { DrawWrapper } from "../Materials/drawWrapper";

import { AddClipPlaneUniforms, BindClipPlane, PrepareStringDefinesForClipPlanes } from "core/Materials/clipPlaneMaterialHelper";
import { BindBonesParameters, BindMorphTargetParameters, PrepareDefinesAndAttributesForMorphTargets, PushAttributesForInstances } from "../Materials/materialHelper.functions";
import { EffectFallbacks } from "core/Materials/effectFallbacks";
import type { IEffectCreationOptions } from "core/Materials/effect";
import { ShaderLanguage } from "core/Materials/shaderLanguage";

declare module "../scene" {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    export interface Scene {
        /** @internal */
        _outlineRenderer: OutlineRenderer;

        /**
         * Gets the outline renderer associated with the scene
         * @returns a OutlineRenderer
         */
        getOutlineRenderer(): OutlineRenderer;
    }
}

/**
 * Gets the outline renderer associated with the scene
 * @returns a OutlineRenderer
 */
Scene.prototype.getOutlineRenderer = function (): OutlineRenderer {
    if (!this._outlineRenderer) {
        this._outlineRenderer = new OutlineRenderer(this);
    }
    return this._outlineRenderer;
};

declare module "../Meshes/abstractMesh" {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    export interface AbstractMesh {
        /** @internal (Backing field) */
        _renderOutline: boolean;
        /**
         * Gets or sets a boolean indicating if the outline must be rendered as well
         * @see https://www.babylonjs-playground.com/#10WJ5S#3
         */
        renderOutline: boolean;

        /** @internal (Backing field) */
        _renderOverlay: boolean;
        /**
         * Gets or sets a boolean indicating if the overlay must be rendered as well
         * @see https://www.babylonjs-playground.com/#10WJ5S#2
         */
        renderOverlay: boolean;
    }
}

Object.defineProperty(Mesh.prototype, "renderOutline", {
    get: function (this: Mesh) {
        return this._renderOutline;
    },
    set: function (this: Mesh, value: boolean) {
        if (value) {
            // Lazy Load the component.
            this.getScene().getOutlineRenderer();
        }
        this._renderOutline = value;
    },
    enumerable: true,
    configurable: true,
});

Object.defineProperty(Mesh.prototype, "renderOverlay", {
    get: function (this: Mesh) {
        return this._renderOverlay;
    },
    set: function (this: Mesh, value: boolean) {
        if (value) {
            // Lazy Load the component.
            this.getScene().getOutlineRenderer();
        }
        this._renderOverlay = value;
    },
    enumerable: true,
    configurable: true,
});

/**
 * This class is responsible to draw the outline/overlay of meshes.
 * It should not be used directly but through the available method on mesh.
 */
export class OutlineRenderer implements ISceneComponent {
    /**
     * Stencil value used to avoid outline being seen within the mesh when the mesh is transparent
     */
    private static _StencilReference = 0x04;
    /**
     * The name of the component. Each component must have a unique name.
     */
    public name = SceneComponentConstants.NAME_OUTLINERENDERER;

    /**
     * The scene the component belongs to.
     */
    public scene: Scene;

    /**
     * Defines a zOffset default Factor to prevent zFighting between the overlay and the mesh.
     */
    public zOffset = 1;

    /**
     * Defines a zOffset default Unit to prevent zFighting between the overlay and the mesh.
     */
    public zOffsetUnits = 4; // 4 to account for projection a bit by default

    private _engine: AbstractEngine;
    private _savedDepthWrite: boolean;
    private _passIdForDrawWrapper: number[];

    /** Shader language used by the Outline renderer. */
    protected _shaderLanguage = ShaderLanguage.GLSL;

    /**
     * Gets the shader language used in the Outline renderer.
     */
    public get shaderLanguage(): ShaderLanguage {
        return this._shaderLanguage;
    }

    /**
     * Instantiates a new outline renderer. (There could be only one per scene).
     * @param scene Defines the scene it belongs to
     */
    constructor(scene: Scene) {
        this.scene = scene;
        this._engine = scene.getEngine();
        this.scene._addComponent(this);
        this._passIdForDrawWrapper = [];
        for (let i = 0; i < 4; ++i) {
            this._passIdForDrawWrapper[i] = this._engine.createRenderPassId(`Outline Renderer (${i})`);
        }

        const engine = this._engine;
        if (engine.isWebGPU) {
            this._shaderLanguage = ShaderLanguage.WGSL;
        }
    }

    /**
     * Register the component to one instance of a scene.
     */
    public register(): void {
        this.scene._beforeRenderingMeshStage.registerStep(SceneComponentConstants.STEP_BEFORERENDERINGMESH_OUTLINE, this, this._beforeRenderingMesh);
        this.scene._afterRenderingMeshStage.registerStep(SceneComponentConstants.STEP_AFTERRENDERINGMESH_OUTLINE, this, this._afterRenderingMesh);
    }

    /**
     * Rebuilds the elements related to this component in case of
     * context lost for instance.
     */
    public rebuild(): void {
        // Nothing to do here.
    }

    /**
     * Disposes the component and the associated resources.
     */
    public dispose(): void {
        for (let i = 0; i < this._passIdForDrawWrapper.length; ++i) {
            this._engine.releaseRenderPassId(this._passIdForDrawWrapper[i]);
        }
    }

    /**
     * Renders the outline in the canvas.
     * @param subMesh Defines the sumesh to render
     * @param batch Defines the batch of meshes in case of instances
     * @param useOverlay Defines if the rendering is for the overlay or the outline
     * @param renderPassId Render pass id to use to render the mesh
     */
    public render(subMesh: SubMesh, batch: _InstancesBatch, useOverlay: boolean = false, renderPassId?: number): void {
        renderPassId = renderPassId ?? this._passIdForDrawWrapper[0];

        const scene = this.scene;
        const engine = scene.getEngine();

        const hardwareInstancedRendering =
            engine.getCaps().instancedArrays &&
            ((batch.visibleInstances[subMesh._id] !== null && batch.visibleInstances[subMesh._id] !== undefined) || subMesh.getRenderingMesh().hasThinInstances);

        if (!this.isReady(subMesh, hardwareInstancedRendering, renderPassId)) {
            return;
        }

        const ownerMesh = subMesh.getMesh();
        const replacementMesh = ownerMesh._internalAbstractMeshDataInfo._actAsRegularMesh ? ownerMesh : null;
        const renderingMesh = subMesh.getRenderingMesh();
        const effectiveMesh = replacementMesh ? replacementMesh : renderingMesh;
        const material = subMesh.getMaterial();

        if (!material || !scene.activeCamera) {
            return;
        }

        const drawWrapper = subMesh._getDrawWrapper(renderPassId)!;
        const effect = DrawWrapper.GetEffect(drawWrapper)!;

        engine.enableEffect(drawWrapper);

        // Logarithmic depth
        if ((<any>material).useLogarithmicDepth) {
            effect.setFloat("logarithmicDepthConstant", 2.0 / (Math.log(scene.activeCamera.maxZ + 1.0) / Math.LN2));
        }

        effect.setFloat("offset", useOverlay ? 0 : renderingMesh.outlineWidth);
        effect.setColor4("color", useOverlay ? renderingMesh.overlayColor : renderingMesh.outlineColor, useOverlay ? renderingMesh.overlayAlpha : material.alpha);
        effect.setMatrix("viewProjection", scene.getTransformMatrix());
        effect.setMatrix("world", effectiveMesh.getWorldMatrix());

        // Bones
        BindBonesParameters(renderingMesh, effect);

        // Morph targets
        BindMorphTargetParameters(renderingMesh, effect);
        if (renderingMesh.morphTargetManager && renderingMesh.morphTargetManager.isUsingTextureForTargets) {
            renderingMesh.morphTargetManager._bind(effect);
        }

        if (!hardwareInstancedRendering) {
            renderingMesh._bind(subMesh, effect, material.fillMode);
        }

        // Baked vertex animations
        const bvaManager = subMesh.getMesh().bakedVertexAnimationManager;
        if (bvaManager && bvaManager.isEnabled) {
            bvaManager.bind(effect, hardwareInstancedRendering);
        }

        // Alpha test
        if (material && material.needAlphaTestingForMesh(effectiveMesh)) {
            const alphaTexture = material.getAlphaTestTexture();
            if (alphaTexture) {
                effect.setTexture("diffuseSampler", alphaTexture);
                effect.setMatrix("diffuseMatrix", alphaTexture.getTextureMatrix());
            }
        }

        // Clip plane
        BindClipPlane(effect, material, scene);

        engine.setZOffset(-this.zOffset);
        engine.setZOffsetUnits(-this.zOffsetUnits);

        renderingMesh._processRendering(effectiveMesh, subMesh, effect, material.fillMode, batch, hardwareInstancedRendering, (isInstance, world) => {
            effect.setMatrix("world", world);
        });

        engine.setZOffset(0);
        engine.setZOffsetUnits(0);
    }

    /**
     * Returns whether or not the outline renderer is ready for a given submesh.
     * All the dependencies e.g. submeshes, texture, effect... mus be ready
     * @param subMesh Defines the submesh to check readiness for
     * @param useInstances Defines whether wee are trying to render instances or not
     * @param renderPassId Render pass id to use to render the mesh
     * @returns true if ready otherwise false
     */
    public isReady(subMesh: SubMesh, useInstances: boolean, renderPassId?: number): boolean {
        renderPassId = renderPassId ?? this._passIdForDrawWrapper[0];

        const defines = [];
        const attribs = [VertexBuffer.PositionKind, VertexBuffer.NormalKind];

        const mesh = subMesh.getMesh();
        const material = subMesh.getMaterial();

        if (!material) {
            return false;
        }

        const scene = mesh.getScene();

        let uv1 = false;
        let uv2 = false;
        const color = false;

        // Alpha test
        if (material.needAlphaTestingForMesh(mesh)) {
            defines.push("#define ALPHATEST");
            if (mesh.isVerticesDataPresent(VertexBuffer.UVKind)) {
                attribs.push(VertexBuffer.UVKind);
                defines.push("#define UV1");
                uv1 = true;
            }
            if (mesh.isVerticesDataPresent(VertexBuffer.UV2Kind)) {
                attribs.push(VertexBuffer.UV2Kind);
                defines.push("#define UV2");
                uv2 = true;
            }
        }
        //Logarithmic depth
        if ((<any>material).useLogarithmicDepth) {
            defines.push("#define LOGARITHMICDEPTH");
        }
        // Clip planes
        PrepareStringDefinesForClipPlanes(material, scene, defines);

        // Bones
        const fallbacks = new EffectFallbacks();
        if (mesh.useBones && mesh.computeBonesUsingShaders && mesh.skeleton) {
            attribs.push(VertexBuffer.MatricesIndicesKind);
            attribs.push(VertexBuffer.MatricesWeightsKind);
            if (mesh.numBoneInfluencers > 4) {
                attribs.push(VertexBuffer.MatricesIndicesExtraKind);
                attribs.push(VertexBuffer.MatricesWeightsExtraKind);
            }
            const skeleton = mesh.skeleton;
            defines.push("#define NUM_BONE_INFLUENCERS " + mesh.numBoneInfluencers);
            if (mesh.numBoneInfluencers > 0) {
                fallbacks.addCPUSkinningFallback(0, mesh);
            }

            if (skeleton.isUsingTextureForMatrices) {
                defines.push("#define BONETEXTURE");
            } else {
                defines.push("#define BonesPerMesh " + (skeleton.bones.length + 1));
            }
        } else {
            defines.push("#define NUM_BONE_INFLUENCERS 0");
        }

        // Morph targets
        const numMorphInfluencers = mesh.morphTargetManager
            ? PrepareDefinesAndAttributesForMorphTargets(
                  mesh.morphTargetManager,
                  defines,
                  attribs,
                  mesh,
                  true, // usePositionMorph
                  true, // useNormalMorph
                  false, // useTangentMorph
                  uv1, // useUVMorph
                  uv2, // useUV2Morph
                  color // useColorMorph
              )
            : 0;

        // Instances
        if (useInstances) {
            defines.push("#define INSTANCES");
            PushAttributesForInstances(attribs);
            if (subMesh.getRenderingMesh().hasThinInstances) {
                defines.push("#define THIN_INSTANCES");
            }
        }

        // Baked vertex animations
        const bvaManager = mesh.bakedVertexAnimationManager;
        if (bvaManager && bvaManager.isEnabled) {
            defines.push("#define BAKED_VERTEX_ANIMATION_TEXTURE");
            if (useInstances) {
                attribs.push("bakedVertexAnimationSettingsInstanced");
            }
        }

        // Get correct effect
        const drawWrapper = subMesh._getDrawWrapper(renderPassId, true)!;
        const cachedDefines = drawWrapper.defines;
        const join = defines.join("\n");

        if (cachedDefines !== join) {
            const uniforms = [
                "world",
                "mBones",
                "viewProjection",
                "diffuseMatrix",
                "offset",
                "color",
                "logarithmicDepthConstant",
                "morphTargetInfluences",
                "boneTextureWidth",
                "morphTargetCount",
                "morphTargetTextureInfo",
                "morphTargetTextureIndices",
                "bakedVertexAnimationSettings",
                "bakedVertexAnimationTextureSizeInverted",
                "bakedVertexAnimationTime",
                "bakedVertexAnimationTexture",
            ];
            const samplers = ["diffuseSampler", "boneSampler", "morphTargets", "bakedVertexAnimationTexture"];

            AddClipPlaneUniforms(uniforms);

            drawWrapper.setEffect(
                this.scene.getEngine().createEffect(
                    "outline",
                    <IEffectCreationOptions>{
                        attributes: attribs,
                        uniformsNames: uniforms,
                        uniformBuffersNames: [],
                        samplers: samplers,
                        defines: join,
                        fallbacks: fallbacks,
                        onCompiled: null,
                        onError: null,
                        indexParameters: { maxSimultaneousMorphTargets: numMorphInfluencers },
                        shaderLanguage: this._shaderLanguage,
                        extraInitializationsAsync: async () => {
                            if (this._shaderLanguage === ShaderLanguage.WGSL) {
                                await Promise.all([import("../ShadersWGSL/outline.fragment"), import("../ShadersWGSL/outline.vertex")]);
                            } else {
                                await Promise.all([import("../Shaders/outline.fragment"), import("../Shaders/outline.vertex")]);
                            }
                        },
                    },
                    this.scene.getEngine()
                ),
                join
            );
        }

        return drawWrapper.effect!.isReady();
    }

    private _beforeRenderingMesh(mesh: Mesh, subMesh: SubMesh, batch: _InstancesBatch): void {
        // Outline - step 1
        this._savedDepthWrite = this._engine.getDepthWrite();
        if (mesh.renderOutline) {
            const material = subMesh.getMaterial();
            if (material && material.needAlphaBlendingForMesh(mesh)) {
                this._engine.cacheStencilState();
                // Draw only to stencil buffer for the original mesh
                // The resulting stencil buffer will be used so the outline is not visible inside the mesh when the mesh is transparent
                this._engine.setDepthWrite(false);
                this._engine.setColorWrite(false);
                this._engine.setStencilBuffer(true);
                this._engine.setStencilOperationPass(Constants.REPLACE);
                this._engine.setStencilFunction(Constants.ALWAYS);
                this._engine.setStencilMask(OutlineRenderer._StencilReference);
                this._engine.setStencilFunctionReference(OutlineRenderer._StencilReference);
                this._engine.stencilStateComposer.useStencilGlobalOnly = true;
                this.render(subMesh, batch, /* This sets offset to 0 */ true, this._passIdForDrawWrapper[1]);

                this._engine.setColorWrite(true);
                this._engine.setStencilFunction(Constants.NOTEQUAL);
            }

            // Draw the outline using the above stencil if needed to avoid drawing within the mesh
            this._engine.setDepthWrite(false);
            this.render(subMesh, batch, false, this._passIdForDrawWrapper[0]);
            this._engine.setDepthWrite(this._savedDepthWrite);

            if (material && material.needAlphaBlendingForMesh(mesh)) {
                this._engine.stencilStateComposer.useStencilGlobalOnly = false;
                this._engine.restoreStencilState();
            }
        }
    }

    private _afterRenderingMesh(mesh: Mesh, subMesh: SubMesh, batch: _InstancesBatch): void {
        // Overlay
        if (mesh.renderOverlay) {
            const currentMode = this._engine.getAlphaMode();
            const alphaBlendState = this._engine.alphaState.alphaBlend;
            this._engine.setAlphaMode(Constants.ALPHA_COMBINE);
            this.render(subMesh, batch, true, this._passIdForDrawWrapper[3]);
            this._engine.setAlphaMode(currentMode);
            this._engine.setDepthWrite(this._savedDepthWrite);
            this._engine.alphaState.setAlphaBlend(alphaBlendState);
        }

        // Outline - step 2
        if (mesh.renderOutline && this._savedDepthWrite) {
            this._engine.setDepthWrite(true);
            this._engine.setColorWrite(false);
            this.render(subMesh, batch, false, this._passIdForDrawWrapper[2]);
            this._engine.setColorWrite(true);
        }
    }
}
