import type { Nullable } from "../../../../types";
import { RegisterClass } from "../../../../Misc/typeStore";
import { NodeRenderGraphBlockConnectionPointTypes } from "../../Types/nodeRenderGraphTypes";
import { NodeRenderGraphBlock } from "../../nodeRenderGraphBlock";
import type { NodeRenderGraphConnectionPoint } from "../../nodeRenderGraphBlockConnectionPoint";
import type { NodeRenderGraphTeleportInBlock } from "./teleportInBlock";
import type { Scene } from "../../../../scene";
import type { NodeRenderGraphBuildState } from "../../nodeRenderGraphBuildState";

/**
 * Defines a block used to receive a value from a teleport entry point
 */
export class NodeRenderGraphTeleportOutBlock extends NodeRenderGraphBlock {
    /** @internal */
    public _entryPoint: Nullable<NodeRenderGraphTeleportInBlock> = null;
    /** @internal */
    public _tempEntryPointUniqueId: Nullable<number> = null;

    /**
     * Create a new NodeRenderGraphTeleportOutBlock
     * @param name defines the block name
     * @param scene defines the hosting scene
     */
    public constructor(name: string, scene: Scene) {
        super(name, scene);

        this._isTeleportOut = true;

        this.registerOutput("output", NodeRenderGraphBlockConnectionPointTypes.BasedOnInput);
    }

    /**
     * Gets the entry point
     */
    public get entryPoint() {
        return this._entryPoint;
    }

    /**
     * Gets the current class name
     * @returns the class name
     */
    public override getClassName() {
        return "NodeRenderGraphTeleportOutBlock";
    }

    /**
     * Gets the output component
     */
    public get output(): NodeRenderGraphConnectionPoint {
        return this._outputs[0];
    }

    /** Detach from entry point */
    public detach() {
        if (!this._entryPoint) {
            return;
        }
        this._entryPoint.detachFromEndpoint(this);
    }

    protected override _buildBlock() {
        // Do nothing
        // All work done by the emitter
    }

    protected override _customBuildStep(state: NodeRenderGraphBuildState): void {
        if (this.entryPoint) {
            this.entryPoint.build(state);
        }
    }

    public override _dumpCode(uniqueNames: string[], alreadyDumped: NodeRenderGraphBlock[]) {
        let codeString: string = "";
        if (this.entryPoint) {
            if (alreadyDumped.indexOf(this.entryPoint) === -1) {
                codeString += this.entryPoint._dumpCode(uniqueNames, alreadyDumped);
            }
        }

        return codeString + super._dumpCode(uniqueNames, alreadyDumped);
    }

    public override _dumpCodeForOutputConnections(alreadyDumped: NodeRenderGraphBlock[]) {
        let codeString = super._dumpCodeForOutputConnections(alreadyDumped);

        if (this.entryPoint) {
            codeString += this.entryPoint._dumpCodeForOutputConnections(alreadyDumped);
        }

        return codeString;
    }

    /**
     * Clone the current block to a new identical block
     * @returns a copy of the current block
     */
    public override clone() {
        const clone = super.clone();

        if (this.entryPoint) {
            this.entryPoint.attachToEndpoint(clone as NodeRenderGraphTeleportOutBlock);
        }

        return clone;
    }

    protected override _dumpPropertiesCode() {
        let codeString = super._dumpPropertiesCode();
        if (this.entryPoint) {
            codeString += `${this.entryPoint._codeVariableName}.attachToEndpoint(${this._codeVariableName});\n`;
        }
        return codeString;
    }

    /**
     * Serializes this block in a JSON representation
     * @returns the serialized block object
     */
    public override serialize(): any {
        const serializationObject = super.serialize();

        serializationObject.entryPoint = this.entryPoint?.uniqueId ?? "";

        return serializationObject;
    }

    public override _deserialize(serializationObject: any) {
        super._deserialize(serializationObject);

        this._tempEntryPointUniqueId = serializationObject.entryPoint;
    }
}

RegisterClass("BABYLON.NodeRenderGraphTeleportOutBlock", NodeRenderGraphTeleportOutBlock);