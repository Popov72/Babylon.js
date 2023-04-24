import type { DeepImmutable } from "../types";
import { Scalar } from "./math.scalar";
import { ToLinearSpace, ToGammaSpace } from "./math.constants";
import { ArrayTools } from "../Misc/arrayTools";
import { RegisterClass } from "../Misc/typeStore";
import { Vector } from "./math";

function colorChannelToLinearSpace(color: number): number {
    return Math.pow(color, ToLinearSpace);
}

function colorChannelToLinearSpaceExact(color: number): number {
    if (color <= 0.04045) {
        return 0.0773993808 * color;
    }
    return Math.pow(0.947867299 * (color + 0.055), 2.4);
}

function colorChannelToGammaSpace(color: number): number {
    return Math.pow(color, ToGammaSpace);
}

function colorChannelToGammaSpaceExact(color: number): number {
    if (color <= 0.0031308) {
        return 12.92 * color;
    }
    return 1.055 * Math.pow(color, 0.41666) - 0.055;
}

/**
 * Class used to hold a RGB color
 */
export class Color3 extends Vector {
    public static Dimension: number = 3;

    /**
     * Creates a new Color3 object from red, green, blue values, all between 0 and 1
     * @param r defines the red component (between 0 and 1, default is 0)
     * @param g defines the green component (between 0 and 1, default is 0)
     * @param b defines the blue component (between 0 and 1, default is 0)
     */
    constructor(r: number = 0, g: number = 0, b: number = 0) {
        super(r, g, b);
    }

    /**
     * Gets the red component (between 0 and 1)
     */
    public get r(): number {
        return +this.vector[0];
    }

    /**
     * Gets the green component (between 0 and 1)
     */
    public get g(): number {
        return +this.vector[1];
    }

    /**
     * Gets the blue component (between 0 and 1)
     */
    public get b(): number {
        return +this.vector[2];
    }

    /**
     * Sets the red component (between 0 and 1)
     */
    public set r(value: number) {
        this.vector[0] = +value;
    }

    /**
     * Sets the green component (between 0 and 1)
     */
    public set g(value: number) {
        this.vector[1] = +value;
    }

    /**
     * Sets the blue component (between 0 and 1)
     */
    public set b(value: number) {
        this.vector[2] = +value;
    }

    /**
     * Creates a string with the Color3 current values
     * @returns the string representation of the Color3 object
     */
    public toString(): string {
        return "{R: " + this.r + " G:" + this.g + " B:" + this.b + "}";
    }

    /**
     * Returns the string "Color3"
     * @returns "Color3"
     */
    public getClassName(): string {
        return "Color3";
    }

    // Operators

    /**
     * Determines equality between Color3 objects
     * @param otherColor defines the second operand
     * @returns true if the rgb values are equal to the given ones
     * @todo fix so it works with Vector.equals
     */
    public equals(otherColor: DeepImmutable<Color3>): boolean {
        return otherColor && this.r === otherColor.r && this.g === otherColor.g && this.b === otherColor.b;
    }

    /**
     * Returns a new Color4 object from the current Color3 and the given alpha
     * @param alpha defines the alpha component on the new Color4 object (default is 1)
     * @returns a new Color4 object
     */
    public toColor4(alpha: number = 1): Color4 {
        return new Color4(this.r, this.g, this.b, alpha);
    }

    /**
     * Returns the luminance value
     * @returns a float value
     */
    public toLuminance(): number {
        return this.r * 0.3 + this.g * 0.59 + this.b * 0.11;
    }

    /**
     * Clamps the rgb values by the min and max values and stores the result into "result"
     * @param min defines minimum clamping value (default is 0)
     * @param max defines maximum clamping value (default is 1)
     * @param result defines color to store the result into
     * @returns the original Color3
     */
    public clampToRef(min: number = 0, max: number = 1, result: Color3): Color3 {
        result.r = Scalar.Clamp(this.r, min, max);
        result.g = Scalar.Clamp(this.g, min, max);
        result.b = Scalar.Clamp(this.b, min, max);
        return this;
    }

    /**
     * Compute the Color3 hexadecimal code as a string
     * @returns a string containing the hexadecimal representation of the Color3 object
     */
    public toHexString(): string {
        const intR = Math.round(this.r * 255);
        const intG = Math.round(this.g * 255);
        const intB = Math.round(this.b * 255);
        return "#" + Scalar.ToHex(intR) + Scalar.ToHex(intG) + Scalar.ToHex(intB);
    }

    /**
     * Converts current color in rgb space to HSV values
     * @returns a new color3 representing the HSV values
     */
    public toHSV(): Color3 {
        const result = new Color3();

        this.toHSVToRef(result);

        return result;
    }

    /**
     * Converts current color in rgb space to HSV values
     * @param result defines the Color3 where to store the HSV values
     */
    public toHSVToRef(result: Color3) {
        const r = this.r;
        const g = this.g;
        const b = this.b;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0;
        let s = 0;
        const v = max;

        const dm = max - min;

        if (max !== 0) {
            s = dm / max;
        }

        if (max != min) {
            if (max == r) {
                h = (g - b) / dm;
                if (g < b) {
                    h += 6;
                }
            } else if (max == g) {
                h = (b - r) / dm + 2;
            } else if (max == b) {
                h = (r - g) / dm + 4;
            }
            h *= 60;
        }

        result.r = h;
        result.g = s;
        result.b = v;
    }

    /**
     * Computes a new Color3 converted from the current one to linear space
     * @param exact defines if the conversion will be done in an exact way which is slower but more accurate (default is false)
     * @returns a new Color3 object
     */
    public toLinearSpace(exact = false): Color3 {
        const convertedColor = new Color3();
        this.toLinearSpaceToRef(convertedColor, exact);
        return convertedColor;
    }

    /**
     * Converts the Color3 values to linear space and stores the result in "convertedColor"
     * @param convertedColor defines the Color3 object where to store the linear space version
     * @param exact defines if the conversion will be done in an exact way which is slower but more accurate (default is false)
     * @returns the unmodified Color3
     */
    public toLinearSpaceToRef(convertedColor: Color3, exact = false): Color3 {
        if (exact) {
            convertedColor.r = colorChannelToLinearSpaceExact(this.r);
            convertedColor.g = colorChannelToLinearSpaceExact(this.g);
            convertedColor.b = colorChannelToLinearSpaceExact(this.b);
        } else {
            convertedColor.r = colorChannelToLinearSpace(this.r);
            convertedColor.g = colorChannelToLinearSpace(this.g);
            convertedColor.b = colorChannelToLinearSpace(this.b);
        }
        return this;
    }

    /**
     * Computes a new Color3 converted from the current one to gamma space
     * @param exact defines if the conversion will be done in an exact way which is slower but more accurate (default is false)
     * @returns a new Color3 object
     */
    public toGammaSpace(exact = false): Color3 {
        const convertedColor = new Color3();
        this.toGammaSpaceToRef(convertedColor, exact);
        return convertedColor;
    }

    /**
     * Converts the Color3 values to gamma space and stores the result in "convertedColor"
     * @param convertedColor defines the Color3 object where to store the gamma space version
     * @param exact defines if the conversion will be done in an exact way which is slower but more accurate (default is false)
     * @returns the unmodified Color3
     */
    public toGammaSpaceToRef(convertedColor: Color3, exact = false): Color3 {
        if (exact) {
            convertedColor.r = colorChannelToGammaSpaceExact(this.r);
            convertedColor.g = colorChannelToGammaSpaceExact(this.g);
            convertedColor.b = colorChannelToGammaSpaceExact(this.b);
        } else {
            convertedColor.r = colorChannelToGammaSpace(this.r);
            convertedColor.g = colorChannelToGammaSpace(this.g);
            convertedColor.b = colorChannelToGammaSpace(this.b);
        }
        return this;
    }

    // Statics

    private static _BlackReadOnly = Color3.Black() as DeepImmutable<Color3>;

	/**
	 * @see Vector.FromArray
	 */
	public static FromArray(array: ArrayLike<number>, offset: number = 0): Color3 {
		return super.FromArray<Color3>(array, offset) as Color3;
	}

    /**
     * Converts Hue, saturation and value to a Color3 (RGB)
     * @param hue defines the hue
     * @param saturation defines the saturation
     * @param value defines the value
     * @param result defines the Color3 where to store the RGB values
     */
    public static HSVtoRGBToRef(hue: number, saturation: number, value: number, result: Color3) {
        const chroma = value * saturation;
        const h = hue / 60;
        const x = chroma * (1 - Math.abs((h % 2) - 1));
        let r = 0;
        let g = 0;
        let b = 0;

        if (h >= 0 && h <= 1) {
            r = chroma;
            g = x;
        } else if (h >= 1 && h <= 2) {
            r = x;
            g = chroma;
        } else if (h >= 2 && h <= 3) {
            g = chroma;
            b = x;
        } else if (h >= 3 && h <= 4) {
            g = x;
            b = chroma;
        } else if (h >= 4 && h <= 5) {
            r = x;
            b = chroma;
        } else if (h >= 5 && h <= 6) {
            r = chroma;
            b = x;
        }

        const m = value - chroma;
        result.set(r + m, g + m, b + m);
    }

    /**
     * Converts Hue, saturation and value to a new Color3 (RGB)
     * @param hue defines the hue (value between 0 and 360)
     * @param saturation defines the saturation (value between 0 and 1)
     * @param value defines the value (value between 0 and 1)
     * @returns a new Color3 object
     */
    public static FromHSV(hue: number, saturation: number, value: number): Color3 {
        const result = new Color3(0, 0, 0);
        Color3.HSVtoRGBToRef(hue, saturation, value, result);
        return result;
    }

    /**
     * Creates a new Color3 from the string containing valid hexadecimal values
     * @param hex defines a string containing valid hexadecimal values
     * @returns a new Color3 object
     */
    public static FromHexString(hex: string): Color3 {
        if (hex.substring(0, 1) !== "#" || hex.length !== 7) {
            return new Color3(0, 0, 0);
        }

        const r = parseInt(hex.substring(1, 3), 16);
        const g = parseInt(hex.substring(3, 5), 16);
        const b = parseInt(hex.substring(5, 7), 16);

        return Color3.FromInts(r, g, b);
    }

    /**
     * Creates a new Color3 from integer values (< 256)
     * @param r defines the red component to read from (value between 0 and 255)
     * @param g defines the green component to read from (value between 0 and 255)
     * @param b defines the blue component to read from (value between 0 and 255)
     * @returns a new Color3 object
     */
    public static FromInts(r: number, g: number, b: number): Color3 {
        return new Color3(r / 255.0, g / 255.0, b / 255.0);
    }

    /**
     * Returns a Color3 value containing a red color
     * @returns a new Color3 object
     */
    public static Red(): Color3 {
        return new Color3(1, 0, 0);
    }
    /**
     * Returns a Color3 value containing a green color
     * @returns a new Color3 object
     */
    public static Green(): Color3 {
        return new Color3(0, 1, 0);
    }
    /**
     * Returns a Color3 value containing a blue color
     * @returns a new Color3 object
     */
    public static Blue(): Color3 {
        return new Color3(0, 0, 1);
    }
    /**
     * Returns a Color3 value containing a black color
     * @returns a new Color3 object
     */
    public static Black(): Color3 {
        return new Color3(0, 0, 0);
    }

    /**
     * Gets a Color3 value containing a black color that must not be updated
     */
    public static get BlackReadOnly(): DeepImmutable<Color3> {
        return Color3._BlackReadOnly;
    }

    /**
     * Returns a Color3 value containing a white color
     * @returns a new Color3 object
     */
    public static White(): Color3 {
        return new Color3(1, 1, 1);
    }
    /**
     * Returns a Color3 value containing a purple color
     * @returns a new Color3 object
     */
    public static Purple(): Color3 {
        return new Color3(0.5, 0, 0.5);
    }
    /**
     * Returns a Color3 value containing a magenta color
     * @returns a new Color3 object
     */
    public static Magenta(): Color3 {
        return new Color3(1, 0, 1);
    }
    /**
     * Returns a Color3 value containing a yellow color
     * @returns a new Color3 object
     */
    public static Yellow(): Color3 {
        return new Color3(1, 1, 0);
    }
    /**
     * Returns a Color3 value containing a gray color
     * @returns a new Color3 object
     */
    public static Gray(): Color3 {
        return new Color3(0.5, 0.5, 0.5);
    }
    /**
     * Returns a Color3 value containing a teal color
     * @returns a new Color3 object
     */
    public static Teal(): Color3 {
        return new Color3(0, 1.0, 1.0);
    }
}

/**
 * Class used to hold a RBGA color
 */
export class Color4 extends Vector {
    public static Dimension: number = 4;

    /**
     * Creates a new Color4 object from red, green, blue values, all between 0 and 1
     * @param r defines the red component (between 0 and 1, default is 0)
     * @param g defines the green component (between 0 and 1, default is 0)
     * @param b defines the blue component (between 0 and 1, default is 0)
     * @param a defines the alpha component (between 0 and 1, default is 1)
     */
    constructor(r: number = 0, g: number = 0, b: number = 0, a: number = 1) {
        super(r, g, b, a);
    }

    /**
     * Gets the red component (between 0 and 1)
     */
    public get r(): number {
        return +this.vector[0];
    }

    /**
     * Gets the green component (between 0 and 1)
     */
    public get g(): number {
        return +this.vector[1];
    }

    /**
     * Gets the blue component (between 0 and 1)
     */
    public get b(): number {
        return +this.vector[2];
    }

    /**
     * Gets the alpha component (between 0 and 1)
     */
    public get a(): number {
        return +this.vector[3];
    }

    /**
     * Sets the red component (between 0 and 1)
     */
    public set r(value: number) {
        this.vector[0] = +value;
    }

    /**
     * Sets the green component (between 0 and 1)
     */
    public set g(value: number) {
        this.vector[1] = +value;
    }

    /**
     * Sets the blue component (between 0 and 1)
     */
    public set b(value: number) {
        this.vector[2] = +value;
    }

    /**
     * Sets the alpha component (between 0 and 1)
     */
    public set a(value: number) {
        this.vector[3] = +value;
    }

    // Operators

    /**
     * Clamps the rgb values by the min and max values and stores the result into "result"
     * @param min defines minimum clamping value (default is 0)
     * @param max defines maximum clamping value (default is 1)
     * @param result defines color to store the result into.
     * @returns the current Color4
     */
    public clampToRef(min: number = 0, max: number = 1, result: Color4): Color4 {
        result.r = Scalar.Clamp(this.r, min, max);
        result.g = Scalar.Clamp(this.g, min, max);
        result.b = Scalar.Clamp(this.b, min, max);
        result.a = Scalar.Clamp(this.a, min, max);
        return this;
    }

    /**
     * Creates a string with the Color4 current values
     * @returns the string representation of the Color4 object
     */
    public toString(): string {
        return "{R: " + this.r + " G:" + this.g + " B:" + this.b + " A:" + this.a + "}";
    }

    /**
     * Returns the string "Color4"
     * @returns "Color4"
     */
    public getClassName(): string {
        return "Color4";
    }

    /**
     * Compute the Color4 hexadecimal code as a string
     * @param returnAsColor3 defines if the string should only contains RGB values (off by default)
     * @returns a string containing the hexadecimal representation of the Color4 object
     */
    public toHexString(returnAsColor3 = false): string {
        const intR = Math.round(this.r * 255);
        const intG = Math.round(this.g * 255);
        const intB = Math.round(this.b * 255);

        if (returnAsColor3) {
            return "#" + Scalar.ToHex(intR) + Scalar.ToHex(intG) + Scalar.ToHex(intB);
        }

        const intA = Math.round(this.a * 255);
        return "#" + Scalar.ToHex(intR) + Scalar.ToHex(intG) + Scalar.ToHex(intB) + Scalar.ToHex(intA);
    }

    /**
     * Computes a new Color4 converted from the current one to linear space
     * @param exact defines if the conversion will be done in an exact way which is slower but more accurate (default is false)
     * @returns a new Color4 object
     */
    public toLinearSpace(exact = false): Color4 {
        const convertedColor = new Color4();
        this.toLinearSpaceToRef(convertedColor, exact);
        return convertedColor;
    }

    /**
     * Converts the Color4 values to linear space and stores the result in "convertedColor"
     * @param convertedColor defines the Color4 object where to store the linear space version
     * @param exact defines if the conversion will be done in an exact way which is slower but more accurate (default is false)
     * @returns the unmodified Color4
     */
    public toLinearSpaceToRef(convertedColor: Color4, exact = false): Color4 {
        if (exact) {
            convertedColor.r = colorChannelToLinearSpaceExact(this.r);
            convertedColor.g = colorChannelToLinearSpaceExact(this.g);
            convertedColor.b = colorChannelToLinearSpaceExact(this.b);
        } else {
            convertedColor.r = colorChannelToLinearSpace(this.r);
            convertedColor.g = colorChannelToLinearSpace(this.g);
            convertedColor.b = colorChannelToLinearSpace(this.b);
        }
        convertedColor.a = this.a;
        return this;
    }

    /**
     * Computes a new Color4 converted from the current one to gamma space
     * @param exact defines if the conversion will be done in an exact way which is slower but more accurate (default is false)
     * @returns a new Color4 object
     */
    public toGammaSpace(exact = false): Color4 {
        const convertedColor = new Color4();
        this.toGammaSpaceToRef(convertedColor, exact);
        return convertedColor;
    }

    /**
     * Converts the Color4 values to gamma space and stores the result in "convertedColor"
     * @param convertedColor defines the Color4 object where to store the gamma space version
     * @param exact defines if the conversion will be done in an exact way which is slower but more accurate (default is false)
     * @returns the unmodified Color4
     */
    public toGammaSpaceToRef(convertedColor: Color4, exact = false): Color4 {
        if (exact) {
            convertedColor.r = colorChannelToGammaSpaceExact(this.r);
            convertedColor.g = colorChannelToGammaSpaceExact(this.g);
            convertedColor.b = colorChannelToGammaSpaceExact(this.b);
        } else {
            convertedColor.r = colorChannelToGammaSpace(this.r);
            convertedColor.g = colorChannelToGammaSpace(this.g);
            convertedColor.b = colorChannelToGammaSpace(this.b);
        }
        convertedColor.a = this.a;
        return this;
    }

    // Statics
	/**
	 * @see Vector.FromArray
	 */
	public static FromArray(array: ArrayLike<number>, offset: number = 0): Color4 {
		return super.FromArray<Color4>(array, offset) as Color4;
	}

    /**
     * Creates a new Color4 from the string containing valid hexadecimal values.
     *
     * A valid hex string is either in the format #RRGGBB or #RRGGBBAA.
     *
     * When a hex string without alpha is passed, the resulting Color4 has
     * its alpha value set to 1.0.
     *
     * An invalid string results in a Color with all its channels set to 0.0,
     * i.e. "transparent black".
     *
     * @param hex defines a string containing valid hexadecimal values
     * @returns a new Color4 object
     */
    public static FromHexString(hex: string): Color4 {
        if (hex.substring(0, 1) !== "#" || (hex.length !== 9 && hex.length !== 7)) {
            return new Color4(0.0, 0.0, 0.0, 0.0);
        }

        const r = parseInt(hex.substring(1, 3), 16);
        const g = parseInt(hex.substring(3, 5), 16);
        const b = parseInt(hex.substring(5, 7), 16);
        const a = hex.length === 9 ? parseInt(hex.substring(7, 9), 16) : 255;

        return Color4.FromInts(r, g, b, a);
    }

    /**
     * Creates a new Color4 from a Color3 and an alpha value
     * @param color3 defines the source Color3 to read from
     * @param alpha defines the alpha component (1.0 by default)
     * @returns a new Color4 object
     */
    public static FromColor3(color3: DeepImmutable<Color3>, alpha: number = 1.0): Color4 {
        return new Color4(color3.r, color3.g, color3.b, alpha);
    }

    /**
     * Creates a new Color3 from integer values (< 256)
     * @param r defines the red component to read from (value between 0 and 255)
     * @param g defines the green component to read from (value between 0 and 255)
     * @param b defines the blue component to read from (value between 0 and 255)
     * @param a defines the alpha component to read from (value between 0 and 255)
     * @returns a new Color3 object
     */
    public static FromInts(r: number, g: number, b: number, a: number): Color4 {
        return new Color4(r / 255.0, g / 255.0, b / 255.0, a / 255.0);
    }

    /**
     * Check the content of a given array and convert it to an array containing RGBA data
     * If the original array was already containing count * 4 values then it is returned directly
     * @param colors defines the array to check
     * @param count defines the number of RGBA data to expect
     * @returns an array containing count * 4 values (RGBA)
     */
    public static CheckColors4(colors: number[], count: number): number[] {
        // Check if color3 was used
        if (colors.length === count * 3) {
            const colors4 = [];
            for (let index = 0; index < colors.length; index += 3) {
                const newIndex = (index / 3) * 4;
                colors4[newIndex] = colors[index];
                colors4[newIndex + 1] = colors[index + 1];
                colors4[newIndex + 2] = colors[index + 2];
                colors4[newIndex + 3] = 1.0;
            }

            return colors4;
        }

        return colors;
    }
}

/**
 * @internal
 */
export class TmpColors {
    public static Color3: Color3[] = ArrayTools.BuildArray(3, Color3.Black);
    public static Color4: Color4[] = ArrayTools.BuildArray(3, () => new Color4(0, 0, 0, 0));
}

RegisterClass("BABYLON.Color3", Color3);
RegisterClass("BABYLON.Color4", Color4);
