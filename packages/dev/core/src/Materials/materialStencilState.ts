import { SerializationHelper } from "../Misc/decorators.serialization";
import { Constants } from "../Engines/constants";
import { serialize } from "../Misc/decorators";
import type { IStencilState } from "../States/IStencilState";

import type { Scene } from "../scene";

/**
 * Class that holds the different stencil states of a material
 * Usage example: https://playground.babylonjs.com/#CW5PRI#10
 */
export class MaterialStencilState implements IStencilState {
    /**
     * Creates a material stencil state instance
     */
    public constructor() {
        this.reset();
    }

    /**
     * Resets all the stencil states to default values
     */
    public reset() {
        this.enabled = false;
        this.mask = 0xff;

        this.funcRef = 1;
        this.funcMask = 0xff;

        this.func = Constants.ALWAYS;
        this.opStencilFail = Constants.KEEP;
        this.opDepthFail = Constants.KEEP;
        this.opStencilDepthPass = Constants.REPLACE;

        this.backFunc = Constants.ALWAYS;
        this.backOpStencilFail = Constants.KEEP;
        this.backOpDepthFail = Constants.KEEP;
        this.backOpStencilDepthPass = Constants.REPLACE;
    }

    private _func: number;
    /**
     * Gets or sets the stencil function
     */
    @serialize()
    public get func(): number {
        return this._func;
    }

    public set func(value: number) {
        this._func = value;
    }

    private _backFunc: number;
    /**
     * Gets or sets the stencil back function
     */
    @serialize()
    public get backFunc(): number {
        return this._backFunc;
    }

    public set backFunc(value: number) {
        this._backFunc = value;
    }

    private _funcRef: number;
    /**
     * Gets or sets the stencil function reference
     */
    @serialize()
    public get funcRef(): number {
        return this._funcRef;
    }

    public set funcRef(value: number) {
        this._funcRef = value;
    }

    private _funcMask: number;
    /**
     * Gets or sets the stencil function mask
     */
    @serialize()
    public get funcMask(): number {
        return this._funcMask;
    }

    public set funcMask(value: number) {
        this._funcMask = value;
    }

    private _opStencilFail: number;
    /**
     * Gets or sets the operation when the stencil test fails
     */
    @serialize()
    public get opStencilFail(): number {
        return this._opStencilFail;
    }

    public set opStencilFail(value: number) {
        this._opStencilFail = value;
    }

    private _opDepthFail: number;
    /**
     * Gets or sets the operation when the depth test fails
     */
    @serialize()
    public get opDepthFail(): number {
        return this._opDepthFail;
    }

    public set opDepthFail(value: number) {
        this._opDepthFail = value;
    }

    private _opStencilDepthPass: number;
    /**
     * Gets or sets the operation when the stencil+depth test succeeds
     */
    @serialize()
    public get opStencilDepthPass(): number {
        return this._opStencilDepthPass;
    }

    public set opStencilDepthPass(value: number) {
        this._opStencilDepthPass = value;
    }

    private _backOpStencilFail: number;
    /**
     * Gets or sets the operation when the back stencil test fails
     */
    @serialize()
    public get backOpStencilFail(): number {
        return this._backOpStencilFail;
    }

    public set backOpStencilFail(value: number) {
        this._backOpStencilFail = value;
    }

    private _backOpDepthFail: number;
    /**
     * Gets or sets the operation when the back depth test fails
     */
    @serialize()
    public get backOpDepthFail(): number {
        return this._backOpDepthFail;
    }

    public set backOpDepthFail(value: number) {
        this._backOpDepthFail = value;
    }

    private _backOpStencilDepthPass: number;
    /**
     * Gets or sets the operation when the back stencil+depth test succeeds
     */
    @serialize()
    public get backOpStencilDepthPass(): number {
        return this._backOpStencilDepthPass;
    }

    public set backOpStencilDepthPass(value: number) {
        this._backOpStencilDepthPass = value;
    }

    private _mask: number;
    /**
     * Gets or sets the stencil mask
     */
    @serialize()
    public get mask(): number {
        return this._mask;
    }

    public set mask(value: number) {
        this._mask = value;
    }

    private _enabled: boolean;
    /**
     * Enables or disables the stencil test
     */
    @serialize()
    public get enabled(): boolean {
        return this._enabled;
    }

    public set enabled(value: boolean) {
        this._enabled = value;
    }

    /**
     * Get the current class name, useful for serialization or dynamic coding.
     * @returns "MaterialStencilState"
     */
    public getClassName(): string {
        return "MaterialStencilState";
    }

    /**
     * Makes a duplicate of the current configuration into another one.
     * @param stencilState defines stencil state where to copy the info
     */
    public copyTo(stencilState: MaterialStencilState): void {
        SerializationHelper.Clone(() => stencilState, this);
    }

    /**
     * Serializes this stencil configuration.
     * @returns - An object with the serialized config.
     */
    public serialize(): any {
        return SerializationHelper.Serialize(this);
    }

    /**
     * Parses a stencil state configuration from a serialized object.
     * @param source - Serialized object.
     * @param scene Defines the scene we are parsing for
     * @param rootUrl Defines the rootUrl to load from
     */
    public parse(source: any, scene: Scene, rootUrl: string): void {
        SerializationHelper.Parse(() => this, source, scene, rootUrl);
    }
}
