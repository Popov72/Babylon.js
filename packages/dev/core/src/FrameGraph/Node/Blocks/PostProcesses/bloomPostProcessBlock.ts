import { NodeRenderGraphBlock } from "../../nodeRenderGraphBlock";
import type { NodeRenderGraphConnectionPoint } from "../../nodeRenderGraphBlockConnectionPoint";
import { RegisterClass } from "../../../../Misc/typeStore";
import { NodeRenderGraphBlockConnectionPointTypes } from "../../Types/nodeRenderGraphTypes";
import { editableInPropertyPage, PropertyTypeForEdition } from "../../../../Decorators/nodeDecorator";
import type { Scene } from "../../../../scene";
import { Constants } from "../../../../Engines/constants";
import { BloomEffect } from "../../../../PostProcesses/bloomEffect";
import type { NodeRenderGraphBuildState } from "../../nodeRenderGraphBuildState";
import type { FrameGraphTextureId } from "../../../frameGraphTypes";
import { FrameGraphBloomTask } from "../../../Tasks/PostProcesses/bloomTask";

/**
 * Block that implements the bloom post process
 */
export class NodeRenderGraphBloomPostProcessBlock extends NodeRenderGraphBlock {
    protected override _frameGraphTask: FrameGraphBloomTask;
    protected _postProcess: BloomEffect;

    /**
     * Gets the frame graph task associated with this block
     */
    public override get task() {
        return this._frameGraphTask;
    }

    /**
     * Gets the post process used by this block
     */
    public get postProcess() {
        return this._postProcess;
    }

    /**
     * Create a new NodeRenderGraphBloomPostProcessBlock
     * @param name defines the block name
     * @param scene defines the hosting scene
     * @param hdr If high dynamic range textures should be used (default: false)
     * @param bloomScale The scale of the bloom effect (default: 0.5)
     */
    public constructor(name: string, scene: Scene, hdr = false, bloomScale = 0.5) {
        super(name, scene);

        this._additionalConstructionParameters = [hdr, bloomScale];

        this.registerInput("source", NodeRenderGraphBlockConnectionPointTypes.Texture);
        this.registerInput("destination", NodeRenderGraphBlockConnectionPointTypes.Texture, true);
        this.registerOutput("output", NodeRenderGraphBlockConnectionPointTypes.BasedOnInput);

        this.source.addAcceptedConnectionPointTypes(NodeRenderGraphBlockConnectionPointTypes.TextureAllButBackBuffer);
        this.destination.addAcceptedConnectionPointTypes(NodeRenderGraphBlockConnectionPointTypes.TextureAll);
        this.output._typeConnectionSource = () => {
            return this.destination.isConnected ? this.destination : this.source;
        };

        let defaultPipelineTextureType = Constants.TEXTURETYPE_UNSIGNED_BYTE;
        if (hdr) {
            const caps = this._engine.getCaps();
            if (caps.textureHalfFloatRender) {
                defaultPipelineTextureType = Constants.TEXTURETYPE_HALF_FLOAT;
            } else if (caps.textureFloatRender) {
                defaultPipelineTextureType = Constants.TEXTURETYPE_FLOAT;
            }
        }

        this._postProcess = new BloomEffect(this._engine, bloomScale, 0.75, 64, defaultPipelineTextureType, false, true);
        this._postProcess.threshold = 0.2;

        this._frameGraphTask = new FrameGraphBloomTask(this.name, this._postProcess);
    }

    /** Sampling mode used to sample from the source texture */
    @editableInPropertyPage("Source sampling mode", PropertyTypeForEdition.SamplingMode)
    public get sourceSamplingMode() {
        return this._frameGraphTask.sourceSamplingMode;
    }

    public set sourceSamplingMode(value: number) {
        this._frameGraphTask.sourceSamplingMode = value;
    }

    /** The luminance threshold to find bright areas of the image to bloom. */
    @editableInPropertyPage("Threshold", PropertyTypeForEdition.Float, "PROPERTIES", { min: 0, max: 2 })
    public get threshold(): number {
        return this._postProcess.threshold;
    }

    public set threshold(value: number) {
        this._postProcess.threshold = value;
    }

    /** The strength of the bloom. */
    @editableInPropertyPage("Weight", PropertyTypeForEdition.Float, "PROPERTIES", { min: 0, max: 3 })
    public get weight(): number {
        return this._postProcess.weight;
    }

    public set weight(value: number) {
        this._postProcess.weight = value;
    }

    /** Specifies the size of the bloom blur kernel, relative to the final output size */
    @editableInPropertyPage("Kernel", PropertyTypeForEdition.Int, "PROPERTIES", { min: 1, max: 128 })
    public get kernel(): number {
        return this._postProcess.kernel;
    }

    public set kernel(value: number) {
        this._postProcess.kernel = value;
    }

    /**
     * Gets the current class name
     * @returns the class name
     */
    public override getClassName() {
        return "NodeRenderGraphBloomPostProcessBlock";
    }

    /**
     * Gets the source input component
     */
    public get source(): NodeRenderGraphConnectionPoint {
        return this._inputs[0];
    }

    /**
     * Gets the destination input component
     */
    public get destination(): NodeRenderGraphConnectionPoint {
        return this._inputs[1];
    }

    /**
     * Gets the output component
     */
    public get output(): NodeRenderGraphConnectionPoint {
        return this._outputs[0];
    }

    protected override _buildBlock(state: NodeRenderGraphBuildState) {
        super._buildBlock(state);

        this._frameGraphTask.name = this.name;

        this.output.value = this._frameGraphTask.outputTextureReference; // the value of the output connection point is the "output" texture of the task

        const sourceConnectedPoint = this.source.connectedPoint;
        if (sourceConnectedPoint) {
            this._frameGraphTask.sourceTexture = sourceConnectedPoint.value as FrameGraphTextureId;
        }

        const destinationConnectedPoint = this.destination.connectedPoint;
        if (destinationConnectedPoint) {
            this._frameGraphTask.destinationTexture = destinationConnectedPoint.value as FrameGraphTextureId;
        }

        state.frameGraph.addTask(this._frameGraphTask);
    }

    protected override _dumpPropertiesCode() {
        const codes: string[] = [];
        codes.push(`${this._codeVariableName}.threshold = ${this.threshold};`);
        codes.push(`${this._codeVariableName}.weight = ${this.weight};`);
        codes.push(`${this._codeVariableName}.kernel = ${this.kernel};`);
        codes.push(`${this._codeVariableName}.sourceSamplingMode = ${this.sourceSamplingMode};`);
        return super._dumpPropertiesCode() + codes.join("\n");
    }

    public override serialize(): any {
        const serializationObject = super.serialize();
        serializationObject.threshold = this.threshold;
        serializationObject.weight = this.weight;
        serializationObject.kernel = this.kernel;
        serializationObject.sourceSamplingMode = this.sourceSamplingMode;
        return serializationObject;
    }

    public override _deserialize(serializationObject: any) {
        super._deserialize(serializationObject);
        this.threshold = serializationObject.threshold;
        this.weight = serializationObject.weight;
        this.kernel = serializationObject.kernel;
        this.sourceSamplingMode = serializationObject.sourceSamplingMode;
    }
}

RegisterClass("BABYLON.NodeRenderGraphBloomPostProcessBlock", NodeRenderGraphBloomPostProcessBlock);