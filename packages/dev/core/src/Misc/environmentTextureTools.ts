/* eslint-disable @typescript-eslint/naming-convention */
import type { Nullable } from "../types";
import { Tools } from "./tools";
import { Vector3 } from "../Maths/math.vector";
import { ILog2 } from "../Maths/math.scalar.functions";
import { SphericalPolynomial } from "../Maths/sphericalPolynomial";
import { InternalTexture, InternalTextureSource } from "../Materials/Textures/internalTexture";
import { BaseTexture } from "../Materials/Textures/baseTexture";
import { Constants } from "../Engines/constants";
import { Scene } from "../scene";
import { PostProcess } from "../PostProcesses/postProcess";
import { Logger } from "../Misc/logger";
import { RGBDTextureTools } from "./rgbdTextureTools";
import { DumpDataAsync } from "../Misc/dumpTools";
import { ShaderLanguage } from "core/Materials";

import type { RenderTargetWrapper } from "../Engines/renderTargetWrapper";
import type { Engine, WebGPUEngine } from "core/Engines";

import "../Materials/Textures/baseTexture.polynomial";

const DefaultEnvironmentTextureImageType = "image/png";
const CurrentVersion = 2;

/**
 * Raw texture data and descriptor sufficient for WebGL texture upload
 */
export type EnvironmentTextureInfo = EnvironmentTextureInfoV1 | EnvironmentTextureInfoV2;

/**
 * v1 of EnvironmentTextureInfo
 */
interface EnvironmentTextureInfoV1 {
    /**
     * Version of the environment map
     */
    version: 1;

    /**
     * Width of image
     */
    width: number;

    /**
     * Irradiance information stored in the file.
     */
    irradiance: Nullable<EnvironmentTextureIrradianceInfoV1>;

    /**
     * Specular information stored in the file.
     */
    specular: EnvironmentTextureSpecularInfoV1;
}

/**
 * v2 of EnvironmentTextureInfo
 */
interface EnvironmentTextureInfoV2 {
    /**
     * Version of the environment map
     */
    version: 2;

    /**
     * Width of image
     */
    width: number;

    /**
     * Irradiance information stored in the file.
     */
    irradiance: Nullable<EnvironmentTextureIrradianceInfoV1>;

    /**
     * Specular information stored in the file.
     */
    specular: EnvironmentTextureSpecularInfoV1;

    /**
     * The mime type used to encode the image data.
     */
    imageType: string;

    /**
     * Defines where the specular Payload is located. It is a runtime value only not stored in the file.
     */
    binaryDataPosition?: number;
}

/**
 * Defines One Image in the file. It requires only the position in the file
 * as well as the length.
 */
interface BufferImageData {
    /**
     * Length of the image data.
     */
    length: number;
    /**
     * Position of the data from the null terminator delimiting the end of the JSON.
     */
    position: number;
}

/**
 * Defines the diffuse data enclosed in the file.
 * This corresponds to the version 1 of the data.
 */
export interface EnvironmentTextureIrradianceTextureInfoV1 {
    /**
     * Size of the texture faces.
     */
    size: number;
    /**
     * This contains all the images data needed to reconstruct the cubemap.
     */
    faces: Array<BufferImageData>;

    /**
     * The dominant direction of light in the environment texture.
     */
    dominantDirection?: Array<number>;
}

/**
 * Defines the specular data enclosed in the file.
 * This corresponds to the version 1 of the data.
 */
export interface EnvironmentTextureSpecularInfoV1 {
    /**
     * This contains all the images data needed to reconstruct the cubemap.
     */
    mipmaps: Array<BufferImageData>;

    /**
     * Defines the scale applied to environment texture. This manages the range of LOD level used for IBL according to the roughness.
     */
    lodGenerationScale: number;
}

/**
 * Defines the required storage to save the environment irradiance information.
 */
interface EnvironmentTextureIrradianceInfoV1 {
    x: Array<number>;
    y: Array<number>;
    z: Array<number>;

    xx: Array<number>;
    yy: Array<number>;
    zz: Array<number>;

    yz: Array<number>;
    zx: Array<number>;
    xy: Array<number>;

    irradianceTexture?: EnvironmentTextureIrradianceTextureInfoV1 | undefined;
}

/**
 * Options for creating environment textures
 */
export interface CreateEnvTextureOptions {
    /**
     * The mime type of encoded images.
     */
    imageType?: string;

    /**
     * the image quality of encoded WebP images.
     */
    imageQuality?: number;

    /**
     * Disables the generation of irradiance texture even if present on the source.
     */
    disableIrradianceTexture?: boolean;
}

/**
 * Magic number identifying the env file.
 */
const MagicBytes = [0x86, 0x16, 0x87, 0x96, 0xf6, 0xd6, 0x96, 0x36];

/**
 * Gets the environment info from an env file.
 * @param data The array buffer containing the .env bytes.
 * @returns the environment file info (the json header) if successfully parsed, normalized to the latest supported version.
 */
export function GetEnvInfo(data: ArrayBufferView): Nullable<EnvironmentTextureInfoV2> {
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;

    for (let i = 0; i < MagicBytes.length; i++) {
        if (dataView.getUint8(pos++) !== MagicBytes[i]) {
            Logger.Error("Not a babylon environment map");
            return null;
        }
    }

    // Read json manifest - collect characters up to null terminator
    let manifestString = "";
    let charCode = 0x00;
    while ((charCode = dataView.getUint8(pos++))) {
        manifestString += String.fromCharCode(charCode);
    }

    let manifest: EnvironmentTextureInfo = JSON.parse(manifestString);
    manifest = normalizeEnvInfo(manifest);
    // Extend the header with the position of the payload.
    manifest.binaryDataPosition = pos;

    if (manifest.specular) {
        // Fallback to 0.8 exactly if lodGenerationScale is not defined for backward compatibility.
        manifest.specular.lodGenerationScale = manifest.specular.lodGenerationScale || 0.8;
    }

    return manifest;
}

/**
 * Normalizes any supported version of the environment file info to the latest version
 * @param info environment file info on any supported version
 * @returns environment file info in the latest supported version
 * @private
 */
export function normalizeEnvInfo(info: EnvironmentTextureInfo): EnvironmentTextureInfoV2 {
    if (info.version > CurrentVersion) {
        throw new Error(`Unsupported babylon environment map version "${info.version}". Latest supported version is "${CurrentVersion}".`);
    }

    if (info.version === 2) {
        return info;
    }

    // Migrate a v1 info to v2
    info = { ...info, version: 2, imageType: DefaultEnvironmentTextureImageType };

    return info;
}

/**
 * Creates an environment texture from a loaded cube texture.
 * @param texture defines the cube texture to convert in env file
 * @param options options for the conversion process
 * @returns a promise containing the environment data if successful.
 */
export async function CreateEnvTextureAsync(texture: BaseTexture, options: CreateEnvTextureOptions = {}): Promise<ArrayBuffer> {
    const internalTexture = texture.getInternalTexture();
    if (!internalTexture) {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return await Promise.reject("The cube texture is invalid.");
    }

    const engine = internalTexture.getEngine();

    if (
        texture.textureType !== Constants.TEXTURETYPE_HALF_FLOAT &&
        texture.textureType !== Constants.TEXTURETYPE_FLOAT &&
        texture.textureType !== Constants.TEXTURETYPE_UNSIGNED_BYTE &&
        texture.textureType !== Constants.TEXTURETYPE_UNSIGNED_BYTE &&
        texture.textureType !== Constants.TEXTURETYPE_UNSIGNED_INTEGER &&
        texture.textureType !== -1
    ) {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return await Promise.reject("The cube texture should allow HDR (Full Float or Half Float).");
    }

    let textureType = Constants.TEXTURETYPE_FLOAT;
    if (!engine.getCaps().textureFloatRender) {
        textureType = Constants.TEXTURETYPE_HALF_FLOAT;
        if (!engine.getCaps().textureHalfFloatRender) {
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            return await Promise.reject("Env texture can only be created when the browser supports half float or full float rendering.");
        }
    }

    // sphericalPolynomial is lazy loaded so simply accessing it should trigger the computation.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    texture.sphericalPolynomial;

    // Lets keep track of the polynomial promise so we can wait for it to be ready before generating the pixels.
    const sphericalPolynomialPromise = texture.getInternalTexture()?._sphericalPolynomialPromise;

    const cubeWidth = internalTexture.width;
    const hostingScene = new Scene(engine);
    const specularTextures: { [key: number]: ArrayBuffer } = {};
    const diffuseTextures: { [key: number]: ArrayBuffer } = {};

    // As we are going to readPixels the faces of the cube, make sure the drawing/update commands for the cube texture are fully sent to the GPU in case it is drawn for the first time in this very frame!
    engine.flushFramebuffer();

    const imageType = options.imageType ?? DefaultEnvironmentTextureImageType;

    // Read and collect all mipmaps data from the cube.
    const mipmapsCount = ILog2(internalTexture.width);
    for (let i = 0; i <= mipmapsCount; i++) {
        const faceWidth = Math.pow(2, mipmapsCount - i);

        // All faces of the cube.
        for (let face = 0; face < 6; face++) {
            // eslint-disable-next-line no-await-in-loop
            specularTextures[i * 6 + face] = await _GetTextureEncodedDataAsync(hostingScene, texture, textureType, face, i, faceWidth, imageType, options.imageQuality);
        }
    }

    // Read and collect all irradiance data from the cube.
    const irradianceTexture = options.disableIrradianceTexture ? null : texture.irradianceTexture;
    if (irradianceTexture) {
        const faceWidth = irradianceTexture.getSize().width;

        // All faces of the cube.
        for (let face = 0; face < 6; face++) {
            // eslint-disable-next-line no-await-in-loop
            diffuseTextures[face] = await _GetTextureEncodedDataAsync(hostingScene, irradianceTexture, textureType, face, 0, faceWidth, imageType, options.imageQuality);
        }
    }

    // We can delete the hosting scene keeping track of all the creation objects
    hostingScene.dispose();

    // Ensure completion of the polynomial creation promise.
    if (sphericalPolynomialPromise) {
        await sphericalPolynomialPromise;
    }

    // Creates the json header for the env texture
    const info: EnvironmentTextureInfo = {
        version: CurrentVersion,
        width: cubeWidth,
        imageType,
        irradiance: CreateEnvTextureIrradiance(texture),
        specular: {
            mipmaps: [],
            lodGenerationScale: texture.lodGenerationScale,
        },
    };

    // Sets the specular image data information
    let position = 0;
    for (let i = 0; i <= mipmapsCount; i++) {
        for (let face = 0; face < 6; face++) {
            const byteLength = specularTextures[i * 6 + face].byteLength;
            info.specular.mipmaps.push({
                length: byteLength,
                position: position,
            });
            position += byteLength;
        }
    }

    // Sets the irradiance image data information
    if (irradianceTexture) {
        info.irradiance = info.irradiance || {
            x: [0, 0, 0],
            xx: [0, 0, 0],
            y: [0, 0, 0],
            yy: [0, 0, 0],
            z: [0, 0, 0],
            zz: [0, 0, 0],
            yz: [0, 0, 0],
            zx: [0, 0, 0],
            xy: [0, 0, 0],
        };
        info.irradiance.irradianceTexture = {
            size: irradianceTexture.getSize().width,
            faces: [],
            dominantDirection: irradianceTexture._dominantDirection?.asArray(),
        };

        for (let face = 0; face < 6; face++) {
            const byteLength = diffuseTextures[face].byteLength;
            info.irradiance.irradianceTexture.faces.push({
                length: byteLength,
                position: position,
            });
            position += byteLength;
        }
    }

    // Encode the JSON as an array buffer
    const infoString = JSON.stringify(info);
    const infoBuffer = new ArrayBuffer(infoString.length + 1);
    const infoView = new Uint8Array(infoBuffer); // Limited to ascii subset matching unicode.
    for (let i = 0, strLen = infoString.length; i < strLen; i++) {
        infoView[i] = infoString.charCodeAt(i);
    }
    // Ends up with a null terminator for easier parsing
    infoView[infoString.length] = 0x00;

    // Computes the final required size and creates the storage
    const totalSize = MagicBytes.length + position + infoBuffer.byteLength;
    const finalBuffer = new ArrayBuffer(totalSize);
    const finalBufferView = new Uint8Array(finalBuffer);
    const dataView = new DataView(finalBuffer);

    // Copy the magic bytes identifying the file in
    let pos = 0;
    for (let i = 0; i < MagicBytes.length; i++) {
        dataView.setUint8(pos++, MagicBytes[i]);
    }

    // Add the json info
    finalBufferView.set(new Uint8Array(infoBuffer), pos);
    pos += infoBuffer.byteLength;

    // Finally inserts the radiance texture data
    for (let i = 0; i <= mipmapsCount; i++) {
        for (let face = 0; face < 6; face++) {
            const dataBuffer = specularTextures[i * 6 + face];
            finalBufferView.set(new Uint8Array(dataBuffer), pos);
            pos += dataBuffer.byteLength;
        }
    }

    // Finally inserts the irradiance texture data
    if (irradianceTexture) {
        for (let face = 0; face < 6; face++) {
            const dataBuffer = diffuseTextures[face];
            finalBufferView.set(new Uint8Array(dataBuffer), pos);
            pos += dataBuffer.byteLength;
        }
    }

    // Voila
    return finalBuffer;
}

/**
 * Get the texture encoded data from the current texture
 * @internal
 */
async function _GetTextureEncodedDataAsync(
    hostingScene: Scene,
    texture: BaseTexture,
    textureType: number,
    face: number,
    i: number,
    size: number,
    imageType: string,
    imageQuality?: number
) {
    let faceData = await texture.readPixels(face, i, undefined, false);
    if (faceData && faceData.byteLength === (faceData as Uint8Array).length) {
        const faceDataFloat = new Float32Array(faceData.byteLength * 4);
        for (let i = 0; i < faceData.byteLength; i++) {
            faceDataFloat[i] = (faceData as Uint8Array)[i] / 255;
            // Gamma to linear
            faceDataFloat[i] = Math.pow(faceDataFloat[i], 2.2);
        }
        faceData = faceDataFloat;
    } else if (faceData && texture.gammaSpace) {
        const floatData = faceData as Float32Array;
        for (let i = 0; i < floatData.length; i++) {
            // Gamma to linear
            floatData[i] = Math.pow(floatData[i], 2.2);
        }
    }

    const engine = hostingScene.getEngine();
    const tempTexture = engine.createRawTexture(faceData, size, size, Constants.TEXTUREFORMAT_RGBA, false, true, Constants.TEXTURE_NEAREST_SAMPLINGMODE, null, textureType);

    await RGBDTextureTools.EncodeTextureToRGBD(tempTexture, hostingScene, textureType);

    const rgbdEncodedData = await engine._readTexturePixels(tempTexture, size, size);

    const imageEncodedData = await DumpDataAsync(size, size, rgbdEncodedData, imageType, undefined, false, true, imageQuality);

    tempTexture.dispose();

    return imageEncodedData as ArrayBuffer;
}

/**
 * Creates a JSON representation of the spherical data.
 * @param texture defines the texture containing the polynomials
 * @returns the JSON representation of the spherical info
 */
function CreateEnvTextureIrradiance(texture: BaseTexture): Nullable<EnvironmentTextureIrradianceInfoV1> {
    const polynmials = texture.sphericalPolynomial;
    if (polynmials == null) {
        return null;
    }

    return {
        x: [polynmials.x.x, polynmials.x.y, polynmials.x.z],
        y: [polynmials.y.x, polynmials.y.y, polynmials.y.z],
        z: [polynmials.z.x, polynmials.z.y, polynmials.z.z],

        xx: [polynmials.xx.x, polynmials.xx.y, polynmials.xx.z],
        yy: [polynmials.yy.x, polynmials.yy.y, polynmials.yy.z],
        zz: [polynmials.zz.x, polynmials.zz.y, polynmials.zz.z],

        yz: [polynmials.yz.x, polynmials.yz.y, polynmials.yz.z],
        zx: [polynmials.zx.x, polynmials.zx.y, polynmials.zx.z],
        xy: [polynmials.xy.x, polynmials.xy.y, polynmials.xy.z],
    };
}

/**
 * Creates the ArrayBufferViews used for initializing environment texture image data.
 * @param data the image data
 * @param info parameters that determine what views will be created for accessing the underlying buffer
 * @returns the views described by info providing access to the underlying buffer
 */
export function CreateRadianceImageDataArrayBufferViews(data: ArrayBufferView, info: EnvironmentTextureInfo): Array<Array<ArrayBufferView>> {
    info = normalizeEnvInfo(info);

    const specularInfo = info.specular;

    // Double checks the enclosed info
    let mipmapsCount = Math.log2(info.width);
    mipmapsCount = Math.round(mipmapsCount) + 1;
    if (specularInfo.mipmaps.length !== 6 * mipmapsCount) {
        throw new Error(`Unsupported specular mipmaps number "${specularInfo.mipmaps.length}"`);
    }

    const imageData = new Array<Array<ArrayBufferView>>(mipmapsCount);
    for (let i = 0; i < mipmapsCount; i++) {
        imageData[i] = new Array<ArrayBufferView>(6);
        for (let face = 0; face < 6; face++) {
            const imageInfo = specularInfo.mipmaps[i * 6 + face];
            imageData[i][face] = new Uint8Array(data.buffer, data.byteOffset + info.binaryDataPosition! + imageInfo.position, imageInfo.length);
        }
    }

    return imageData;
}

/**
 * Creates the ArrayBufferViews used for initializing environment texture image data.
 * @param data the image data
 * @param info parameters that determine what views will be created for accessing the underlying buffer
 * @returns the views described by info providing access to the underlying buffer
 */
export function CreateIrradianceImageDataArrayBufferViews(data: ArrayBufferView, info: EnvironmentTextureInfo): Array<ArrayBufferView> {
    info = normalizeEnvInfo(info);

    const imageData = new Array<ArrayBufferView>(6);

    const irradianceTexture = info.irradiance?.irradianceTexture;
    if (irradianceTexture) {
        if (irradianceTexture.faces.length !== 6) {
            throw new Error(`Incorrect irradiance texture faces number "${irradianceTexture.faces.length}"`);
        }

        for (let face = 0; face < 6; face++) {
            const imageInfo = irradianceTexture.faces[face];
            imageData[face] = new Uint8Array(data.buffer, data.byteOffset + info.binaryDataPosition! + imageInfo.position, imageInfo.length);
        }
    }

    return imageData;
}

/**
 * Uploads the texture info contained in the env file to the GPU.
 * @param texture defines the internal texture to upload to
 * @param data defines the data to load
 * @param info defines the texture info retrieved through the GetEnvInfo method
 * @returns a promise
 */
// eslint-disable-next-line @typescript-eslint/promise-function-async, no-restricted-syntax
export function UploadEnvLevelsAsync(texture: InternalTexture, data: ArrayBufferView, info: EnvironmentTextureInfo): Promise<void[]> {
    info = normalizeEnvInfo(info);

    const specularInfo = info.specular;
    if (!specularInfo) {
        // Nothing else parsed so far
        return Promise.resolve([]);
    }

    texture._lodGenerationScale = specularInfo.lodGenerationScale;

    const promises: Promise<void>[] = [];

    const radianceImageData = CreateRadianceImageDataArrayBufferViews(data, info);
    promises.push(UploadRadianceLevelsAsync(texture, radianceImageData, info.imageType));

    const irradianceTexture = info.irradiance?.irradianceTexture;
    if (irradianceTexture) {
        const irradianceImageData = CreateIrradianceImageDataArrayBufferViews(data, info);
        let dominantDirection = null;
        if (info.irradiance?.irradianceTexture?.dominantDirection) {
            dominantDirection = Vector3.FromArray(info.irradiance.irradianceTexture.dominantDirection);
        }
        promises.push(UploadIrradianceLevelsAsync(texture, irradianceImageData, irradianceTexture.size, info.imageType, dominantDirection));
    }

    return Promise.all(promises);
}

async function _OnImageReadyAsync(
    image: HTMLImageElement | ImageBitmap,
    engine: Engine | WebGPUEngine,
    expandTexture: boolean,
    rgbdPostProcess: Nullable<PostProcess>,
    url: string,
    face: number,
    i: number,
    generateNonLODTextures: boolean,
    lodTextures: Nullable<{ [lod: number]: BaseTexture }>,
    cubeRtt: Nullable<RenderTargetWrapper>,
    texture: InternalTexture
): Promise<void> {
    return await new Promise((resolve, reject) => {
        if (expandTexture) {
            const tempTexture = engine.createTexture(
                null,
                true,
                true,
                null,
                Constants.TEXTURE_NEAREST_SAMPLINGMODE,
                null,
                (message) => {
                    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                    reject(message);
                },
                image
            );

            rgbdPostProcess?.onEffectCreatedObservable.addOnce((effect) => {
                effect.executeWhenCompiled(() => {
                    // Uncompress the data to a RTT
                    rgbdPostProcess.externalTextureSamplerBinding = true;
                    rgbdPostProcess.onApply = (effect) => {
                        effect._bindTexture("textureSampler", tempTexture);
                        effect.setFloat2("scale", 1, engine._features.needsInvertingBitmap && image instanceof ImageBitmap ? -1 : 1);
                    };

                    if (!engine.scenes.length) {
                        return;
                    }

                    engine.scenes[0].postProcessManager.directRender([rgbdPostProcess], cubeRtt, true, face, i);

                    // Cleanup
                    engine.restoreDefaultFramebuffer();
                    tempTexture.dispose();
                    URL.revokeObjectURL(url);
                    resolve();
                });
            });
        } else {
            engine._uploadImageToTexture(texture, image, face, i);

            // Upload the face to the non lod texture support
            if (generateNonLODTextures) {
                const lodTexture = lodTextures![i];
                if (lodTexture) {
                    engine._uploadImageToTexture(lodTexture._texture!, image, face, 0);
                }
            }
            resolve();
        }
    });
}

/**
 * Uploads the levels of image data to the GPU.
 * @param texture defines the internal texture to upload to
 * @param imageData defines the array buffer views of image data [mipmap][face]
 * @param imageType the mime type of the image data
 * @returns a promise
 */
export async function UploadRadianceLevelsAsync(texture: InternalTexture, imageData: ArrayBufferView[][], imageType: string = DefaultEnvironmentTextureImageType): Promise<void> {
    const engine = texture.getEngine() as Engine;
    texture.format = Constants.TEXTUREFORMAT_RGBA;
    texture.type = Constants.TEXTURETYPE_UNSIGNED_BYTE;
    texture.generateMipMaps = true;
    texture._cachedAnisotropicFilteringLevel = null;
    engine.updateTextureSamplingMode(Constants.TEXTURE_TRILINEAR_SAMPLINGMODE, texture);

    await _UploadLevelsAsync(texture, imageData, true, imageType);

    // Flag internal texture as ready in case they are in use.
    texture.isReady = true;
}

/**
 * Uploads the levels of image data to the GPU.
 * @param mainTexture defines the internal texture to upload to
 * @param imageData defines the array buffer views of image data [mipmap][face]
 * @param size defines the size of the texture faces
 * @param imageType the mime type of the image data
 * @param dominantDirection the dominant direction of light in the environment texture, if available
 * @returns a promise
 */
export async function UploadIrradianceLevelsAsync(
    mainTexture: InternalTexture,
    imageData: ArrayBufferView[],
    size: number,
    imageType: string = DefaultEnvironmentTextureImageType,
    dominantDirection: Nullable<Vector3> = null
): Promise<void> {
    // Gets everything ready.
    const engine = mainTexture.getEngine() as Engine;
    const texture = new InternalTexture(engine, InternalTextureSource.RenderTarget);
    const baseTexture = new BaseTexture(engine, texture);
    mainTexture._irradianceTexture = baseTexture;
    baseTexture._dominantDirection = dominantDirection;
    texture.isCube = true;
    texture.format = Constants.TEXTUREFORMAT_RGBA;
    texture.type = Constants.TEXTURETYPE_UNSIGNED_BYTE;
    texture.generateMipMaps = true;
    texture._cachedAnisotropicFilteringLevel = null;
    texture.generateMipMaps = true;
    texture.width = size;
    texture.height = size;
    engine.updateTextureSamplingMode(Constants.TEXTURE_TRILINEAR_SAMPLINGMODE, texture);

    await _UploadLevelsAsync(texture, [imageData], false, imageType);

    engine.generateMipMapsForCubemap(texture);

    // Flag internal texture as ready in case they are in use.
    texture.isReady = true;
}

/**
 * Uploads the levels of image data to the GPU.
 * @param texture defines the internal texture to upload to
 * @param imageData defines the array buffer views of image data [mipmap][face]
 * @param canGenerateNonLODTextures defines whether or not to generate non lod textures
 * @param imageType the mime type of the image data
 * @returns a promise
 */
async function _UploadLevelsAsync(
    texture: InternalTexture,
    imageData: ArrayBufferView[][],
    canGenerateNonLODTextures: boolean,
    imageType: string = DefaultEnvironmentTextureImageType
) {
    if (!Tools.IsExponentOfTwo(texture.width)) {
        throw new Error("Texture size must be a power of two");
    }

    const mipmapsCount = ILog2(texture.width) + 1;

    // Gets everything ready.
    const engine = texture.getEngine() as Engine;
    let expandTexture = false;
    let generateNonLODTextures = false;
    let rgbdPostProcess: Nullable<PostProcess> = null;
    let cubeRtt: Nullable<RenderTargetWrapper> = null;
    let lodTextures: Nullable<{ [lod: number]: BaseTexture }> = null;
    const caps = engine.getCaps();

    if (!caps.textureLOD) {
        expandTexture = false;
        generateNonLODTextures = canGenerateNonLODTextures;
    } else if (!engine._features.supportRenderAndCopyToLodForFloatTextures) {
        expandTexture = false;
    }
    // If half float available we can uncompress the texture
    else if (caps.textureHalfFloatRender && caps.textureHalfFloatLinearFiltering) {
        expandTexture = true;
        texture.type = Constants.TEXTURETYPE_HALF_FLOAT;
    }
    // If full float available we can uncompress the texture
    else if (caps.textureFloatRender && caps.textureFloatLinearFiltering) {
        expandTexture = true;
        texture.type = Constants.TEXTURETYPE_FLOAT;
    }

    // Expand the texture if possible
    let shaderLanguage = ShaderLanguage.GLSL;
    if (expandTexture) {
        if (engine.isWebGPU) {
            shaderLanguage = ShaderLanguage.WGSL;
            await import("../ShadersWGSL/rgbdDecode.fragment");
        } else {
            await import("../Shaders/rgbdDecode.fragment");
        }

        // Simply run through the decode PP
        rgbdPostProcess = new PostProcess(
            "rgbdDecode",
            "rgbdDecode",
            null,
            null,
            1,
            null,
            Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
            engine,
            false,
            undefined,
            texture.type,
            undefined,
            null,
            false,
            undefined,
            shaderLanguage
        );

        texture._isRGBD = false;
        texture.invertY = false;
        cubeRtt = engine.createRenderTargetCubeTexture(texture.width, {
            generateDepthBuffer: false,
            generateMipMaps: true,
            generateStencilBuffer: false,
            samplingMode: Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
            type: texture.type,
            format: Constants.TEXTUREFORMAT_RGBA,
        });
    } else {
        texture._isRGBD = true;
        texture.invertY = true;

        // In case of missing support, applies the same patch than DDS files.
        if (generateNonLODTextures) {
            const mipSlices = 3;
            lodTextures = {};
            const scale = texture._lodGenerationScale;
            const offset = texture._lodGenerationOffset;

            for (let i = 0; i < mipSlices; i++) {
                //compute LOD from even spacing in smoothness (matching shader calculation)
                const smoothness = i / (mipSlices - 1);
                const roughness = 1 - smoothness;

                const minLODIndex = offset; // roughness = 0
                const maxLODIndex = (mipmapsCount - 1) * scale + offset; // roughness = 1 (mipmaps start from 0)

                const lodIndex = minLODIndex + (maxLODIndex - minLODIndex) * roughness;
                const mipmapIndex = Math.round(Math.min(Math.max(lodIndex, 0), maxLODIndex));

                //compute LOD from even spacing in smoothness (matching shader calculation)
                const glTextureFromLod = new InternalTexture(engine, InternalTextureSource.Temp);
                glTextureFromLod.isCube = true;
                glTextureFromLod.invertY = true;
                glTextureFromLod.generateMipMaps = false;
                engine.updateTextureSamplingMode(Constants.TEXTURE_LINEAR_LINEAR, glTextureFromLod);

                // Wrap in a base texture for easy binding.
                const lodTexture = new BaseTexture(null);
                lodTexture._isCube = true;
                lodTexture._texture = glTextureFromLod;
                lodTextures[mipmapIndex] = lodTexture;

                switch (i) {
                    case 0:
                        texture._lodTextureLow = lodTexture;
                        break;
                    case 1:
                        texture._lodTextureMid = lodTexture;
                        break;
                    case 2:
                        texture._lodTextureHigh = lodTexture;
                        break;
                }
            }
        }
    }

    const promises: Promise<void>[] = [];
    // All mipmaps up to provided number of images
    for (let i = 0; i < imageData.length; i++) {
        // All faces
        for (let face = 0; face < 6; face++) {
            // Constructs an image element from image data
            const bytes = imageData[i][face];
            const blob = new Blob([bytes], { type: imageType });
            const url = URL.createObjectURL(blob);
            let promise: Promise<void>;

            if (engine._features.forceBitmapOverHTMLImageElement) {
                // eslint-disable-next-line github/no-then
                promise = engine.createImageBitmap(blob, { premultiplyAlpha: "none" }).then(async (img) => {
                    return await _OnImageReadyAsync(img, engine, expandTexture, rgbdPostProcess, url, face, i, generateNonLODTextures, lodTextures, cubeRtt, texture);
                });
            } else {
                const image = new Image();
                image.src = url;

                // Enqueue promise to upload to the texture.
                promise = new Promise<void>((resolve, reject) => {
                    image.onload = () => {
                        _OnImageReadyAsync(image, engine, expandTexture, rgbdPostProcess, url, face, i, generateNonLODTextures, lodTextures, cubeRtt, texture)
                            // eslint-disable-next-line github/no-then
                            .then(() => resolve())
                            // eslint-disable-next-line github/no-then
                            .catch((reason) => {
                                // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                                reject(reason);
                            });
                    };
                    image.onerror = (error) => {
                        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                        reject(error);
                    };
                });
            }
            promises.push(promise);
        }
    }

    await Promise.all(promises);

    // Fill remaining mipmaps with black textures.
    if (imageData.length < mipmapsCount) {
        let data: ArrayBufferView;
        const size = Math.pow(2, mipmapsCount - 1 - imageData.length);
        const dataLength = size * size * 4;
        switch (texture.type) {
            case Constants.TEXTURETYPE_UNSIGNED_BYTE: {
                data = new Uint8Array(dataLength);
                break;
            }
            case Constants.TEXTURETYPE_HALF_FLOAT: {
                data = new Uint16Array(dataLength);
                break;
            }
            case Constants.TEXTURETYPE_FLOAT: {
                data = new Float32Array(dataLength);
                break;
            }
        }
        for (let i = imageData.length; i < mipmapsCount; i++) {
            for (let face = 0; face < 6; face++) {
                engine._uploadArrayBufferViewToTexture(cubeRtt?.texture || texture, data!, face, i);
            }
        }
    }

    // Release temp RTT.
    if (cubeRtt) {
        const irradiance = texture._irradianceTexture;
        texture._irradianceTexture = null;
        engine._releaseTexture(texture);
        cubeRtt._swapAndDie(texture);
        texture._irradianceTexture = irradiance;
    }
    // Release temp Post Process.
    if (rgbdPostProcess) {
        rgbdPostProcess.dispose();
    }
    // Flag internal texture as ready in case they are in use.
    if (generateNonLODTextures) {
        if (texture._lodTextureHigh && texture._lodTextureHigh._texture) {
            texture._lodTextureHigh._texture.isReady = true;
        }
        if (texture._lodTextureMid && texture._lodTextureMid._texture) {
            texture._lodTextureMid._texture.isReady = true;
        }
        if (texture._lodTextureLow && texture._lodTextureLow._texture) {
            texture._lodTextureLow._texture.isReady = true;
        }
    }
}

/**
 * Uploads spherical polynomials information to the texture.
 * @param texture defines the texture we are trying to upload the information to
 * @param info defines the environment texture info retrieved through the GetEnvInfo method
 */
export function UploadEnvSpherical(texture: InternalTexture, info: EnvironmentTextureInfo): void {
    info = normalizeEnvInfo(info);

    const irradianceInfo = info.irradiance as EnvironmentTextureIrradianceInfoV1;
    if (!irradianceInfo) {
        return;
    }

    const sp = new SphericalPolynomial();
    Vector3.FromArrayToRef(irradianceInfo.x, 0, sp.x);
    Vector3.FromArrayToRef(irradianceInfo.y, 0, sp.y);
    Vector3.FromArrayToRef(irradianceInfo.z, 0, sp.z);
    Vector3.FromArrayToRef(irradianceInfo.xx, 0, sp.xx);
    Vector3.FromArrayToRef(irradianceInfo.yy, 0, sp.yy);
    Vector3.FromArrayToRef(irradianceInfo.zz, 0, sp.zz);
    Vector3.FromArrayToRef(irradianceInfo.yz, 0, sp.yz);
    Vector3.FromArrayToRef(irradianceInfo.zx, 0, sp.zx);
    Vector3.FromArrayToRef(irradianceInfo.xy, 0, sp.xy);
    texture._sphericalPolynomial = sp;
}

/**
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/promise-function-async, no-restricted-syntax
export function _UpdateRGBDAsync(
    internalTexture: InternalTexture,
    data: ArrayBufferView[][],
    sphericalPolynomial: Nullable<SphericalPolynomial>,
    lodScale: number,
    lodOffset: number
): Promise<InternalTexture> {
    const proxy = internalTexture
        .getEngine()
        .createRawCubeTexture(
            null,
            internalTexture.width,
            internalTexture.format,
            internalTexture.type,
            internalTexture.generateMipMaps,
            internalTexture.invertY,
            internalTexture.samplingMode,
            internalTexture._compression
        );
    // eslint-disable-next-line github/no-then
    const proxyPromise = UploadRadianceLevelsAsync(proxy, data).then(() => internalTexture);
    internalTexture.onRebuildCallback = (_internalTexture) => {
        return {
            proxy: proxyPromise,
            isReady: true,
            isAsync: true,
        };
    };
    internalTexture._source = InternalTextureSource.CubeRawRGBD;
    internalTexture._bufferViewArrayArray = data;
    internalTexture._lodGenerationScale = lodScale;
    internalTexture._lodGenerationOffset = lodOffset;
    internalTexture._sphericalPolynomial = sphericalPolynomial;

    // eslint-disable-next-line github/no-then
    return UploadRadianceLevelsAsync(internalTexture, data).then(() => {
        internalTexture.isReady = true;
        return internalTexture;
    });
}

/**
 * Sets of helpers addressing the serialization and deserialization of environment texture
 * stored in a BabylonJS env file.
 * Those files are usually stored as .env files.
 */
export const EnvironmentTextureTools = {
    /**
     * Gets the environment info from an env file.
     * @param data The array buffer containing the .env bytes.
     * @returns the environment file info (the json header) if successfully parsed, normalized to the latest supported version.
     */
    GetEnvInfo,

    /**
     * Creates an environment texture from a loaded cube texture.
     * @param texture defines the cube texture to convert in env file
     * @param options options for the conversion process
     * @param options.imageType the mime type for the encoded images, with support for "image/png" (default) and "image/webp"
     * @param options.imageQuality the image quality of encoded WebP images.
     * @returns a promise containing the environment data if successful.
     */
    CreateEnvTextureAsync,

    /**
     * Creates the ArrayBufferViews used for initializing environment texture image data.
     * @param data the image data
     * @param info parameters that determine what views will be created for accessing the underlying buffer
     * @returns the views described by info providing access to the underlying buffer
     */
    CreateRadianceImageDataArrayBufferViews,

    /**
     * Creates the ArrayBufferViews used for initializing environment texture image data.
     * @param data the image data
     * @param info parameters that determine what views will be created for accessing the underlying buffer
     * @returns the views described by info providing access to the underlying buffer
     */
    CreateIrradianceImageDataArrayBufferViews,

    /**
     * Uploads the texture info contained in the env file to the GPU.
     * @param texture defines the internal texture to upload to
     * @param data defines the data to load
     * @param info defines the texture info retrieved through the GetEnvInfo method
     * @returns a promise
     */
    UploadEnvLevelsAsync,

    /**
     * Uploads the levels of image data to the GPU.
     * @param texture defines the internal texture to upload to
     * @param imageData defines the array buffer views of image data [mipmap][face]
     * @param imageType the mime type of the image data
     * @returns a promise
     */
    UploadRadianceLevelsAsync,

    /**
     * Uploads the levels of image data to the GPU.
     * @param texture defines the internal texture to upload to
     * @param imageData defines the array buffer views of image data [mipmap][face]
     * @param imageType the mime type of the image data
     * @param dominantDirection the dominant direction of light in the environment texture, if available
     * @returns a promise
     */
    UploadIrradianceLevelsAsync,

    /**
     * Uploads spherical polynomials information to the texture.
     * @param texture defines the texture we are trying to upload the information to
     * @param info defines the environment texture info retrieved through the GetEnvInfo method
     */
    UploadEnvSpherical,
};
