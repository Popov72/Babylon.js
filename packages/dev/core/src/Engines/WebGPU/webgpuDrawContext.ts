import type { VertexBuffer } from "../../Buffers/buffer";
import type { DataBuffer } from "../../Buffers/dataBuffer";
import type { WebGPUDataBuffer } from "../../Meshes/WebGPU/webgpuDataBuffer";
import type { Nullable } from "../../types";
import type { IDrawContext } from "../IDrawContext";
import type { WebGPUBufferManager } from "./webgpuBufferManager";
import type { WebGPUPipelineContext } from "./webgpuPipelineContext";
import * as WebGPUConstants from "./webgpuConstants";

/** @internal */
export class WebGPUDrawContext implements IDrawContext {
    private static _Counter = 0;

    public fastBundle?: GPURenderBundle; // used only when compatibilityMode==false (fast mode)
    public bindGroups?: GPUBindGroup[]; // cache of the bind groups. Will be reused for the next draw if isDirty==false (and materialContext.isDirty==false)

    public uniqueId: number;

    public buffers: { [name: string]: Nullable<WebGPUDataBuffer> };

    public indirectDrawBuffer?: GPUBuffer;

    private _materialContextUpdateId: number;
    private _bufferManager: WebGPUBufferManager;
    private _useInstancing: boolean;
    private _indirectDrawData?: Uint32Array;
    private _currentInstanceCount: number;
    private _isDirty: boolean;
    private _vertexPullingEnabled: boolean;

    public isDirty(materialContextUpdateId: number): boolean {
        return this._isDirty || this._materialContextUpdateId !== materialContextUpdateId;
    }

    public resetIsDirty(materialContextUpdateId: number): void {
        this._isDirty = false;
        this._materialContextUpdateId = materialContextUpdateId;
    }

    public get useInstancing() {
        return this._useInstancing;
    }

    public set useInstancing(use: boolean) {
        if (this._useInstancing === use) {
            return;
        }

        if (!use) {
            if (this.indirectDrawBuffer) {
                this._bufferManager.releaseBuffer(this.indirectDrawBuffer);
            }
            this.indirectDrawBuffer = undefined;
            this._indirectDrawData = undefined;
        } else {
            this.indirectDrawBuffer = this._bufferManager.createRawBuffer(
                20,
                WebGPUConstants.BufferUsage.CopyDst | WebGPUConstants.BufferUsage.Indirect | WebGPUConstants.BufferUsage.Storage,
                undefined,
                "IndirectDrawBuffer"
            );
            this._indirectDrawData = new Uint32Array(5);
            this._indirectDrawData[3] = 0;
            this._indirectDrawData[4] = 0;
        }

        this._useInstancing = use;
        this._currentInstanceCount = -1;
    }

    constructor(
        bufferManager: WebGPUBufferManager,
        private _dummyIndexBuffer: WebGPUDataBuffer
    ) {
        this._bufferManager = bufferManager;
        this.uniqueId = WebGPUDrawContext._Counter++;
        this._useInstancing = false;
        this._currentInstanceCount = 0;
        this._vertexPullingEnabled = false;
        this.reset();
    }

    public reset(): void {
        this.buffers = {};
        this._isDirty = true;
        this._materialContextUpdateId = 0;
        this.fastBundle = undefined;
        this.bindGroups = undefined;
        this._vertexPullingEnabled = false;
    }

    public setBuffer(name: string, buffer: Nullable<WebGPUDataBuffer>): void {
        this._isDirty ||= buffer?.uniqueId !== this.buffers[name]?.uniqueId;

        this.buffers[name] = buffer;
    }

    public setIndirectData(indexOrVertexCount: number, instanceCount: number, firstIndexOrVertex: number): void {
        if (instanceCount === this._currentInstanceCount || !this.indirectDrawBuffer || !this._indirectDrawData) {
            // The current buffer is already up to date so do nothing
            // Note that we only check for instanceCount and not indexOrVertexCount nor firstIndexOrVertex because those values
            // are supposed to not change during the lifetime of a draw context
            return;
        }
        this._currentInstanceCount = instanceCount;

        this._indirectDrawData[0] = indexOrVertexCount;
        this._indirectDrawData[1] = instanceCount;
        this._indirectDrawData[2] = firstIndexOrVertex;

        this._bufferManager.setRawData(this.indirectDrawBuffer, 0, this._indirectDrawData, 0, 20);
    }

    public setVertexPulling(
        useVertexPulling: boolean,
        webgpuPipelineContext: WebGPUPipelineContext,
        vertexBuffers: { [key: string]: Nullable<VertexBuffer> },
        indexBuffer: Nullable<DataBuffer>,
        overrideVertexBuffers: Nullable<{ [kind: string]: Nullable<VertexBuffer> }>
    ): void {
        if (this._vertexPullingEnabled === useVertexPulling) {
            return;
        }

        this._vertexPullingEnabled = useVertexPulling;
        this._isDirty = true;

        const bufferNames = webgpuPipelineContext.shaderProcessingContext.bufferNames;

        if (overrideVertexBuffers) {
            for (const attributeName in overrideVertexBuffers) {
                const vertexBuffer = overrideVertexBuffers[attributeName];
                if (!vertexBuffer || bufferNames.indexOf(attributeName) === -1) {
                    continue;
                }

                const buffer = vertexBuffer.effectiveBuffer as Nullable<WebGPUDataBuffer>;

                this.setBuffer(attributeName, useVertexPulling ? buffer : null);
            }
        }

        for (const attributeName in vertexBuffers) {
            if (overrideVertexBuffers && attributeName in overrideVertexBuffers) {
                continue;
            }

            const vertexBuffer = vertexBuffers[attributeName];
            if (!vertexBuffer || bufferNames.indexOf(attributeName) === -1) {
                continue;
            }

            const buffer = vertexBuffer.effectiveBuffer as Nullable<WebGPUDataBuffer>;

            this.setBuffer(attributeName, useVertexPulling ? buffer : null);
        }

        if (bufferNames.indexOf("indices") !== -1) {
            if (!useVertexPulling) {
                this.setBuffer("indices", null);
            } else {
                let is32bits = false;
                if (indexBuffer) {
                    this.setBuffer("indices", indexBuffer as WebGPUDataBuffer);
                    is32bits = indexBuffer.is32Bits;
                } else {
                    // If no index buffer exists but the vertex shader uses the "indices" buffer, we need
                    // to bind a dummy index buffer (of size 4 to avoid WebGPU errors). Then we'll set the
                    // uniform to indicate that indices aren't used by the mesh.
                    this.setBuffer("indices", this._dummyIndexBuffer);
                }
                // Set uniforms to indicate that the index buffer is used and whether it is 32-bit or 16-bit.
                if (webgpuPipelineContext.uniformBuffer?.has("hasIndices")) {
                    webgpuPipelineContext.uniformBuffer.updateInt("hasIndices", indexBuffer ? 1 : 0);
                }
                if (webgpuPipelineContext.uniformBuffer?.has("indicesAre32bit")) {
                    webgpuPipelineContext.uniformBuffer?.updateInt("indicesAre32bit", is32bits ? 1 : 0);
                }
            }
        }
    }

    public dispose(): void {
        if (this.indirectDrawBuffer) {
            this._bufferManager.releaseBuffer(this.indirectDrawBuffer);
            this.indirectDrawBuffer = undefined;
            this._indirectDrawData = undefined;
        }
        this.fastBundle = undefined;
        this.bindGroups = undefined;
        this.buffers = undefined as any;
    }
}
