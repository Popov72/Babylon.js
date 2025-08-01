import { Matrix, Quaternion, Vector3 } from "../../../Maths/math.vector";
import { _SpatialAudioSubNode } from "../../abstractAudio/subNodes/spatialAudioSubNode";
import { _SpatialAudioDefaults } from "../../abstractAudio/subProperties/abstractSpatialAudio";
import { _WebAudioParameterComponent } from "../components/webAudioParameterComponent";
import type { _WebAudioEngine } from "../webAudioEngine";
import type { IWebAudioInNode } from "../webAudioNode";

const TmpMatrix = Matrix.Zero();
const TmpQuaternion = new Quaternion();
const TmpVector = Vector3.Zero();

function D2r(degrees: number): number {
    return (degrees * Math.PI) / 180;
}

function R2d(radians: number): number {
    return (radians * 180) / Math.PI;
}

/** @internal */
// eslint-disable-next-line @typescript-eslint/require-await
export async function _CreateSpatialAudioSubNodeAsync(engine: _WebAudioEngine): Promise<_SpatialAudioSubNode> {
    return new _SpatialWebAudioSubNode(engine);
}

/** @internal */
export class _SpatialWebAudioSubNode extends _SpatialAudioSubNode {
    private _lastPosition: Vector3 = Vector3.Zero();
    private _lastRotation: Vector3 = Vector3.Zero();
    private _lastRotationQuaternion: Quaternion = new Quaternion();
    private _orientationX: _WebAudioParameterComponent;
    private _orientationY: _WebAudioParameterComponent;
    private _orientationZ: _WebAudioParameterComponent;
    private _positionX: _WebAudioParameterComponent;
    private _positionY: _WebAudioParameterComponent;
    private _positionZ: _WebAudioParameterComponent;

    /** @internal */
    public override readonly engine: _WebAudioEngine;

    /** @internal */
    public readonly position = _SpatialAudioDefaults.position.clone();
    /** @internal */
    public readonly rotation: Vector3 = _SpatialAudioDefaults.rotation.clone();
    /** @internal */
    public readonly rotationQuaternion: Quaternion = _SpatialAudioDefaults.rotationQuaternion.clone();

    /** @internal */
    public readonly node: PannerNode;

    /** @internal */
    public constructor(engine: _WebAudioEngine) {
        super(engine);

        this.node = new PannerNode(engine._audioContext);

        this._orientationX = new _WebAudioParameterComponent(engine, this.node.orientationX);
        this._orientationY = new _WebAudioParameterComponent(engine, this.node.orientationY);
        this._orientationZ = new _WebAudioParameterComponent(engine, this.node.orientationZ);

        this._positionX = new _WebAudioParameterComponent(engine, this.node.positionX);
        this._positionY = new _WebAudioParameterComponent(engine, this.node.positionY);
        this._positionZ = new _WebAudioParameterComponent(engine, this.node.positionZ);
    }

    /** @internal */
    public override dispose(): void {
        super.dispose();

        this._orientationX.dispose();
        this._orientationY.dispose();
        this._orientationZ.dispose();
        this._positionX.dispose();
        this._positionY.dispose();
        this._positionZ.dispose();

        this.node.disconnect();
    }

    /** @internal */
    public get coneInnerAngle(): number {
        return D2r(this.node.coneInnerAngle);
    }

    public set coneInnerAngle(value: number) {
        this.node.coneInnerAngle = R2d(value);
    }

    /** @internal */
    public get coneOuterAngle(): number {
        return D2r(this.node.coneOuterAngle);
    }

    public set coneOuterAngle(value: number) {
        this.node.coneOuterAngle = R2d(value);
    }

    /** @internal */
    public get coneOuterVolume(): number {
        return this.node.coneOuterGain;
    }

    public set coneOuterVolume(value: number) {
        this.node.coneOuterGain = value;
    }

    /** @internal */
    public get distanceModel(): "linear" | "inverse" | "exponential" {
        return this.node.distanceModel;
    }

    public set distanceModel(value: "linear" | "inverse" | "exponential") {
        this.node.distanceModel = value;

        // Wiggle the max distance to make the change take effect.
        const maxDistance = this.node.maxDistance;
        this.node.maxDistance = maxDistance + 0.001;
        this.node.maxDistance = maxDistance;
    }

    /** @internal */
    public get minDistance(): number {
        return this.node.refDistance;
    }

    public set minDistance(value: number) {
        this.node.refDistance = value;
    }

    /** @internal */
    public get maxDistance(): number {
        return this.node.maxDistance;
    }

    public set maxDistance(value: number) {
        this.node.maxDistance = value;
    }

    /** @internal */
    public get panningModel(): "equalpower" | "HRTF" {
        return this.node.panningModel;
    }

    public set panningModel(value: "equalpower" | "HRTF") {
        this.node.panningModel = value;
    }

    /** @internal */
    public get rolloffFactor(): number {
        return this.node.rolloffFactor;
    }

    public set rolloffFactor(value: number) {
        this.node.rolloffFactor = value;
    }

    /** @internal */
    public get _inNode(): AudioNode {
        return this.node;
    }

    /** @internal */
    public get _outNode(): AudioNode {
        return this.node;
    }

    /** @internal */
    public _updatePosition(): void {
        if (this._lastPosition.equalsWithEpsilon(this.position)) {
            return;
        }

        // If attached and there is a ramp in progress, we assume another update is coming soon that we can wait for.
        // We don't do this for unattached nodes because there may not be another update coming.
        if (this.isAttached && (this._positionX.isRamping || this._positionY.isRamping || this._positionZ.isRamping)) {
            return;
        }

        this._positionX.targetValue = this.position.x;
        this._positionY.targetValue = this.position.y;
        this._positionZ.targetValue = this.position.z;

        this._lastPosition.copyFrom(this.position);
    }

    /** @internal */
    public _updateRotation(): void {
        // If attached and there is a ramp in progress, we assume another update is coming soon that we can wait for.
        // We don't do this for unattached nodes because there may not be another update coming.
        if (this.isAttached && (this._orientationX.isRamping || this._orientationY.isRamping || this._orientationZ.isRamping)) {
            return;
        }

        if (!this._lastRotationQuaternion.equalsWithEpsilon(this.rotationQuaternion)) {
            TmpQuaternion.copyFrom(this.rotationQuaternion);
            this._lastRotationQuaternion.copyFrom(this.rotationQuaternion);
        } else if (!this._lastRotation.equalsWithEpsilon(this.rotation)) {
            Quaternion.FromEulerAnglesToRef(this.rotation.x, this.rotation.y, this.rotation.z, TmpQuaternion);
            this._lastRotation.copyFrom(this.rotation);
        } else {
            return;
        }

        Matrix.FromQuaternionToRef(TmpQuaternion, TmpMatrix);
        Vector3.TransformNormalToRef(Vector3.RightReadOnly, TmpMatrix, TmpVector);

        this._orientationX.targetValue = TmpVector.x;
        this._orientationY.targetValue = TmpVector.y;
        this._orientationZ.targetValue = TmpVector.z;
    }

    protected override _connect(node: IWebAudioInNode): boolean {
        const connected = super._connect(node);

        if (!connected) {
            return false;
        }

        // If the wrapped node is not available now, it will be connected later by the subgraph.
        if (node._inNode) {
            this.node.connect(node._inNode);
        }

        return true;
    }

    protected override _disconnect(node: IWebAudioInNode): boolean {
        const disconnected = super._disconnect(node);

        if (!disconnected) {
            return false;
        }

        if (node._inNode) {
            this.node.disconnect(node._inNode);
        }

        return true;
    }

    /** @internal */
    public getClassName(): string {
        return "_SpatialWebAudioSubNode";
    }
}
