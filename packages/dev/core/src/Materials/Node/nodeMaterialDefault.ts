import { TransformBlock } from "./Blocks/transformBlock";
import { VertexOutputBlock } from "./Blocks/Vertex/vertexOutputBlock";
import { FragmentOutputBlock } from "./Blocks/Fragment/fragmentOutputBlock";
import { InputBlock } from "./Blocks/Input/inputBlock";
import { GaussianSplattingBlock } from "./Blocks/GaussianSplatting/gaussianSplattingBlock";
import { GaussianBlock } from "./Blocks/GaussianSplatting/gaussianBlock";
import { SplatReaderBlock } from "./Blocks/GaussianSplatting/splatReaderBlock";
import { NodeMaterialModes } from "./Enums/nodeMaterialModes";
import { NodeMaterialSystemValues } from "./Enums/nodeMaterialSystemValues";
import type { NodeMaterial } from "./nodeMaterial";
import { MultiplyBlock } from "./Blocks/multiplyBlock";
import { Texture } from "../Textures/texture";
import { Tools } from "core/Misc/tools";
import { SmartFilterTextureBlock } from "./Blocks/Dual/smartFilterTextureBlock";
import { Color4 } from "core/Maths/math.color";
import { AddBlock } from "./Blocks/addBlock";
import { SmartFilterFragmentOutputBlock } from "./Blocks/Fragment/smartFilterFragmentOutputBlock";

/**
 * Clear the material and set it to a default state for gaussian splatting
 * @param nodeMaterial node material to use
 */
export function SetToDefaultGaussianSplatting(nodeMaterial: NodeMaterial): void {
    nodeMaterial.clear();

    nodeMaterial.editorData = null;

    // reading splat datas
    const splatIndex = new InputBlock("SplatIndex");
    splatIndex.setAsAttribute("splatIndex");

    const splatReader = new SplatReaderBlock("SplatReader");
    splatIndex.connectTo(splatReader);

    // transforming datas into renderable positions
    const gs = new GaussianSplattingBlock("GaussianSplatting");
    splatReader.connectTo(gs);

    // world transformation
    const worldInput = new InputBlock("World");
    worldInput.setAsSystemValue(NodeMaterialSystemValues.World);

    const worldPos = new TransformBlock("WorldPos");

    splatReader.connectTo(worldPos);
    worldInput.connectTo(worldPos);
    worldPos.connectTo(gs, { output: "xyz", input: "splatPosition" });

    // view and projections

    const view = new InputBlock("view");
    view.setAsSystemValue(NodeMaterialSystemValues.View);

    const projection = new InputBlock("Projection");
    projection.setAsSystemValue(NodeMaterialSystemValues.Projection);

    worldInput.connectTo(gs, { input: "world" });
    view.connectTo(gs, { input: "view" });
    projection.connectTo(gs, { input: "projection" });

    const addBlock = new AddBlock("Add SH");

    // from color to gaussian color
    const gaussian = new GaussianBlock("Gaussian");
    splatReader.connectTo(gaussian, { input: "splatColor", output: "splatColor" });

    // fragment and vertex outputs
    const fragmentOutput = new FragmentOutputBlock("FragmentOutput");

    gs.SH.connectTo(addBlock.left);
    gaussian.rgb.connectTo(addBlock.right);
    addBlock.output.connectTo(fragmentOutput.rgb);
    gaussian.alpha.connectTo(fragmentOutput.a);

    const vertexOutput = new VertexOutputBlock("VertexOutput");
    gs.connectTo(vertexOutput);

    // Add to nodes
    nodeMaterial.addOutputNode(vertexOutput);
    nodeMaterial.addOutputNode(fragmentOutput);

    nodeMaterial._mode = NodeMaterialModes.GaussianSplatting;
}

/**
 * Clear the material and set it to a default state for Smart Filter effects
 * @param nodeMaterial node material to use
 */
export function SetToDefaultSFE(nodeMaterial: NodeMaterial): void {
    nodeMaterial.clear();

    nodeMaterial.editorData = null;

    const uv = new InputBlock("uv");
    uv.setAsAttribute("postprocess_uv");
    uv.comments = "Normalized screen position to sample our texture with.";

    const currentScreen = new SmartFilterTextureBlock("Input Texture");
    currentScreen.comments = "A placeholder that represents the input texture to compose.";
    uv.connectTo(currentScreen);
    const textureUrl = Tools.GetAssetUrl("https://assets.babylonjs.com/core/nme/currentScreenPostProcess.png");
    currentScreen.texture = new Texture(textureUrl, nodeMaterial.getScene());

    const color = new InputBlock("Color4");
    color.value = new Color4(1, 0, 0, 1);

    const multiply = new MultiplyBlock("Multiply");
    color.connectTo(multiply);
    currentScreen.connectTo(multiply);

    const fragmentOutput = new SmartFilterFragmentOutputBlock("FragmentOutput");
    multiply.connectTo(fragmentOutput);

    nodeMaterial.addOutputNode(fragmentOutput);

    nodeMaterial._mode = NodeMaterialModes.SFE;
}
