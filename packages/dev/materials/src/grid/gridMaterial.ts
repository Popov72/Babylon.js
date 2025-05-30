/* eslint-disable @typescript-eslint/naming-convention */
import { serializeAsTexture, serialize, expandToProperty, serializeAsColor3, serializeAsVector3 } from "core/Misc/decorators";
import { SerializationHelper } from "core/Misc/decorators.serialization";
import type { Matrix } from "core/Maths/math.vector";
import { Vector4, Vector3 } from "core/Maths/math.vector";
import { Color3 } from "core/Maths/math.color";
import type { BaseTexture } from "core/Materials/Textures/baseTexture";
import { MaterialDefines } from "core/Materials/materialDefines";
import { PushMaterial } from "core/Materials/pushMaterial";
import { MaterialFlags } from "core/Materials/materialFlags";
import { VertexBuffer } from "core/Buffers/buffer";
import type { AbstractMesh } from "core/Meshes/abstractMesh";
import type { SubMesh } from "core/Meshes/subMesh";
import type { Mesh } from "core/Meshes/mesh";
import type { Scene } from "core/scene";
import { RegisterClass } from "core/Misc/typeStore";

import "./grid.fragment";
import "./grid.vertex";
import {
    BindFogParameters,
    BindLogDepth,
    PrepareAttributesForInstances,
    PrepareDefinesForAttributes,
    PrepareDefinesForFrameBoundValues,
    PrepareDefinesForMisc,
} from "core/Materials/materialHelper.functions";
import { AddClipPlaneUniforms, BindClipPlane } from "core/Materials/clipPlaneMaterialHelper";

class GridMaterialDefines extends MaterialDefines {
    public CLIPPLANE = false;
    public CLIPPLANE2 = false;
    public CLIPPLANE3 = false;
    public CLIPPLANE4 = false;
    public CLIPPLANE5 = false;
    public CLIPPLANE6 = false;
    public OPACITY = false;
    public ANTIALIAS = false;
    public TRANSPARENT = false;
    public FOG = false;
    public PREMULTIPLYALPHA = false;
    public MAX_LINE = false;
    public UV1 = false;
    public UV2 = false;
    public INSTANCES = false;
    public THIN_INSTANCES = false;
    public IMAGEPROCESSINGPOSTPROCESS = false;
    public SKIPFINALCOLORCLAMP = false;
    public LOGARITHMICDEPTH = false;

    constructor() {
        super();
        this.rebuild();
    }
}

/**
 * The grid materials allows you to wrap any shape with a grid.
 * Colors are customizable.
 */
export class GridMaterial extends PushMaterial {
    /**
     * Main color of the grid (e.g. between lines)
     */
    @serializeAsColor3()
    public mainColor = Color3.Black();

    /**
     * Color of the grid lines.
     */
    @serializeAsColor3()
    public lineColor = Color3.Teal();

    /**
     * The scale of the grid compared to unit.
     */
    @serialize()
    public gridRatio = 1.0;

    /**
     * Allows setting an offset for the grid lines.
     */
    @serializeAsVector3()
    public gridOffset = Vector3.Zero();

    /**
     * The frequency of thicker lines.
     */
    @serialize()
    public majorUnitFrequency = 10;

    /**
     * The visibility of minor units in the grid.
     */
    @serialize()
    public minorUnitVisibility = 0.33;

    /**
     * The grid opacity outside of the lines.
     */
    @serialize()
    public opacity = 1.0;

    /**
     * Whether to antialias the grid
     */
    @serialize()
    public antialias = true;

    /**
     * Determine RBG output is premultiplied by alpha value.
     */
    @serialize()
    public preMultiplyAlpha = false;

    /**
     * Determines if the max line value will be used instead of the sum wherever grid lines intersect.
     */
    @serialize()
    public useMaxLine = false;

    @serializeAsTexture("opacityTexture")
    private _opacityTexture: BaseTexture;
    /**
     * Texture to define opacity of the grid
     */
    @expandToProperty("_markAllSubMeshesAsTexturesDirty")
    public opacityTexture: BaseTexture;

    private _gridControl: Vector4 = new Vector4(this.gridRatio, this.majorUnitFrequency, this.minorUnitVisibility, this.opacity);

    /**
     * constructor
     * @param name The name given to the material in order to identify it afterwards.
     * @param scene The scene the material is used in.
     */
    constructor(name: string, scene?: Scene) {
        super(name, scene);
    }

    /**
     * @returns whether or not the grid requires alpha blending.
     */
    public override needAlphaBlending(): boolean {
        return this.opacity < 1.0 || (this._opacityTexture && this._opacityTexture.isReady());
    }

    public override needAlphaBlendingForMesh(mesh: AbstractMesh): boolean {
        return mesh.visibility < 1.0 || this.needAlphaBlending();
    }

    public override isReadyForSubMesh(mesh: AbstractMesh, subMesh: SubMesh, useInstances?: boolean): boolean {
        const drawWrapper = subMesh._drawWrapper;

        if (this.isFrozen) {
            if (drawWrapper.effect && drawWrapper._wasPreviouslyReady && drawWrapper._wasPreviouslyUsingInstances === useInstances) {
                return true;
            }
        }

        if (!subMesh.materialDefines) {
            subMesh.materialDefines = new GridMaterialDefines();
        }

        const defines = <GridMaterialDefines>subMesh.materialDefines;
        const scene = this.getScene();

        if (this._isReadyForSubMesh(subMesh)) {
            return true;
        }

        if (defines.TRANSPARENT !== this.opacity < 1.0) {
            defines.TRANSPARENT = !defines.TRANSPARENT;
            defines.markAsUnprocessed();
        }

        if (defines.PREMULTIPLYALPHA != this.preMultiplyAlpha) {
            defines.PREMULTIPLYALPHA = !defines.PREMULTIPLYALPHA;
            defines.markAsUnprocessed();
        }

        if (defines.MAX_LINE !== this.useMaxLine) {
            defines.MAX_LINE = !defines.MAX_LINE;
            defines.markAsUnprocessed();
        }

        if (defines.ANTIALIAS !== this.antialias) {
            defines.ANTIALIAS = !defines.ANTIALIAS;
            defines.markAsUnprocessed();
        }

        // Textures
        if (defines._areTexturesDirty) {
            defines._needUVs = false;
            if (scene.texturesEnabled) {
                if (this._opacityTexture && MaterialFlags.OpacityTextureEnabled) {
                    if (!this._opacityTexture.isReady()) {
                        return false;
                    } else {
                        defines._needUVs = true;
                        defines.OPACITY = true;
                    }
                }
            }
        }

        PrepareDefinesForMisc(mesh, scene, this._useLogarithmicDepth, false, this.fogEnabled, false, defines);

        // Values that need to be evaluated on every frame
        PrepareDefinesForFrameBoundValues(scene, scene.getEngine(), this, defines, !!useInstances);

        // Get correct effect
        if (defines.isDirty) {
            defines.markAsProcessed();
            scene.resetCachedMaterial();

            // Attributes
            PrepareDefinesForAttributes(mesh, defines, false, false);
            const attribs = [VertexBuffer.PositionKind, VertexBuffer.NormalKind];

            if (defines.UV1) {
                attribs.push(VertexBuffer.UVKind);
            }
            if (defines.UV2) {
                attribs.push(VertexBuffer.UV2Kind);
            }

            defines.IMAGEPROCESSINGPOSTPROCESS = scene.imageProcessingConfiguration.applyByPostProcess;

            PrepareAttributesForInstances(attribs, defines);

            const uniforms = [
                "projection",
                "mainColor",
                "lineColor",
                "gridControl",
                "gridOffset",
                "vFogInfos",
                "vFogColor",
                "world",
                "view",
                "opacityMatrix",
                "vOpacityInfos",
                "visibility",
                "logarithmicDepthConstant",
            ];
            // Defines
            const join = defines.toString();
            AddClipPlaneUniforms(uniforms);
            subMesh.setEffect(
                scene.getEngine().createEffect(
                    "grid",
                    {
                        attributes: attribs,
                        uniformsNames: uniforms,
                        uniformBuffersNames: ["Scene"],
                        samplers: ["opacitySampler"],
                        defines: join,
                        fallbacks: null,
                        onCompiled: this.onCompiled,
                        onError: this.onError,
                    },
                    scene.getEngine()
                ),
                defines,
                this._materialContext
            );
        }

        if (!subMesh.effect || !subMesh.effect.isReady()) {
            return false;
        }

        defines._renderId = scene.getRenderId();
        drawWrapper._wasPreviouslyReady = true;
        drawWrapper._wasPreviouslyUsingInstances = !!useInstances;

        return true;
    }

    public override bindForSubMesh(world: Matrix, mesh: Mesh, subMesh: SubMesh): void {
        const scene = this.getScene();

        const defines = <GridMaterialDefines>subMesh.materialDefines;
        if (!defines) {
            return;
        }

        const effect = subMesh.effect;
        if (!effect) {
            return;
        }
        this._activeEffect = effect;

        this._activeEffect.setFloat("visibility", mesh.visibility);

        // Matrices
        if (!defines.INSTANCES || defines.THIN_INSTANCE) {
            this.bindOnlyWorldMatrix(world);
        }
        this.bindView(effect);
        this.bindViewProjection(effect);

        // Uniforms
        if (this._mustRebind(scene, effect, subMesh)) {
            this._activeEffect.setColor3("mainColor", this.mainColor);
            this._activeEffect.setColor3("lineColor", this.lineColor);

            this._activeEffect.setVector3("gridOffset", this.gridOffset);

            this._gridControl.x = this.gridRatio;
            this._gridControl.y = Math.round(this.majorUnitFrequency);
            this._gridControl.z = this.minorUnitVisibility;
            this._gridControl.w = this.opacity;
            this._activeEffect.setVector4("gridControl", this._gridControl);

            if (this._opacityTexture && MaterialFlags.OpacityTextureEnabled) {
                this._activeEffect.setTexture("opacitySampler", this._opacityTexture);
                this._activeEffect.setFloat2("vOpacityInfos", this._opacityTexture.coordinatesIndex, this._opacityTexture.level);
                this._activeEffect.setMatrix("opacityMatrix", this._opacityTexture.getTextureMatrix());
            }

            // Clip plane
            BindClipPlane(effect, this, scene);
            // Log. depth
            if (this._useLogarithmicDepth) {
                BindLogDepth(defines, effect, scene);
            }
        }
        // Fog
        BindFogParameters(scene, mesh, this._activeEffect);

        this._afterBind(mesh, this._activeEffect, subMesh);
    }

    /**
     * Dispose the material and its associated resources.
     * @param forceDisposeEffect will also dispose the used effect when true
     */
    public override dispose(forceDisposeEffect?: boolean): void {
        super.dispose(forceDisposeEffect);
    }

    public override clone(name: string): GridMaterial {
        return SerializationHelper.Clone(() => new GridMaterial(name, this.getScene()), this);
    }

    public override serialize(): any {
        const serializationObject = super.serialize();
        serializationObject.customType = "BABYLON.GridMaterial";
        return serializationObject;
    }

    public override getClassName(): string {
        return "GridMaterial";
    }

    public static override Parse(source: any, scene: Scene, rootUrl: string): GridMaterial {
        return SerializationHelper.Parse(() => new GridMaterial(source.name, scene), source, scene, rootUrl);
    }
}

RegisterClass("BABYLON.GridMaterial", GridMaterial);
