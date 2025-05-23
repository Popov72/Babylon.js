import type { Nullable } from "../../types";
import { Engine } from "../../Engines/engine";
import type { DataBuffer } from "../../Buffers/dataBuffer";

/** @internal */
// eslint-disable-next-line no-var, @typescript-eslint/naming-convention
export var _forceTransformFeedbackToBundle = true;

declare module "../../Engines/engine" {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    export interface Engine {
        /**
         * Creates a webGL transform feedback object
         * Please makes sure to check webGLVersion property to check if you are running webGL 2+
         * @returns the webGL transform feedback object
         */
        createTransformFeedback(): WebGLTransformFeedback;

        /**
         * Delete a webGL transform feedback object
         * @param value defines the webGL transform feedback object to delete
         */
        deleteTransformFeedback(value: WebGLTransformFeedback): void;

        /**
         * Bind a webGL transform feedback object to the webgl context
         * @param value defines the webGL transform feedback object to bind
         */
        bindTransformFeedback(value: Nullable<WebGLTransformFeedback>): void;

        /**
         * Begins a transform feedback operation
         * @param usePoints defines if points or triangles must be used
         */
        beginTransformFeedback(usePoints: boolean): void;

        /**
         * Ends a transform feedback operation
         */
        endTransformFeedback(): void;

        /**
         * Specify the varyings to use with transform feedback
         * @param program defines the associated webGL program
         * @param value defines the list of strings representing the varying names
         */
        setTranformFeedbackVaryings(program: WebGLProgram, value: string[]): void;

        /**
         * Bind a webGL buffer for a transform feedback operation
         * @param value defines the webGL buffer to bind
         */
        bindTransformFeedbackBuffer(value: Nullable<DataBuffer>): void;

        /**
         * Read data back from the bound transform feedback buffer
         * @param target defines the webGL buffer to write to
         */
        readTransformFeedbackBuffer(target: ArrayBufferView): void;
    }
}

Engine.prototype.createTransformFeedback = function (): WebGLTransformFeedback {
    const transformFeedback = this._gl.createTransformFeedback();
    if (!transformFeedback) {
        throw new Error("Unable to create Transform Feedback");
    }
    return transformFeedback;
};

Engine.prototype.deleteTransformFeedback = function (value: WebGLTransformFeedback): void {
    this._gl.deleteTransformFeedback(value);
};

Engine.prototype.bindTransformFeedback = function (value: Nullable<WebGLTransformFeedback>): void {
    this._gl.bindTransformFeedback(this._gl.TRANSFORM_FEEDBACK, value);
};

Engine.prototype.beginTransformFeedback = function (usePoints: boolean = true): void {
    this._gl.beginTransformFeedback(usePoints ? this._gl.POINTS : this._gl.TRIANGLES);
};

Engine.prototype.endTransformFeedback = function (): void {
    this._gl.endTransformFeedback();
};

Engine.prototype.setTranformFeedbackVaryings = function (program: WebGLProgram, value: string[]): void {
    this._gl.transformFeedbackVaryings(program, value, this._gl.INTERLEAVED_ATTRIBS);
};

Engine.prototype.bindTransformFeedbackBuffer = function (value: Nullable<DataBuffer>): void {
    this._gl.bindBufferBase(this._gl.TRANSFORM_FEEDBACK_BUFFER, 0, value ? value.underlyingResource : null);
};

Engine.prototype.readTransformFeedbackBuffer = function (target: ArrayBufferView): void {
    this._gl.getBufferSubData(this._gl.TRANSFORM_FEEDBACK_BUFFER, 0, target);
};
