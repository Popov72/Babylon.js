// Samplers
varying vec2 vUV;

uniform sampler2D textureSampler;
uniform float motionStrength;
uniform float motionScale;
uniform vec2 screenSize;

#ifdef OBJECT_BASED
uniform sampler2D velocitySampler;
#else
uniform sampler2D depthSampler;

uniform mat4 inverseViewProjection;
uniform mat4 prevViewProjection;
uniform mat4 projection;
#endif


#define CUSTOM_FRAGMENT_DEFINITIONS

void main(void)
{
    #ifdef GEOMETRY_SUPPORTED
        #ifdef OBJECT_BASED
            vec2 texelSize = 1.0 / screenSize;
            vec4 velocityColor = textureLod(velocitySampler, vUV, 0.0);
            velocityColor.rg = velocityColor.rg * 2.0 - vec2(1.0);
            vec2 signs = sign(velocityColor.rg);
            vec2 velocity = pow(abs(velocityColor.rg), vec2(3.0)) * signs * velocityColor.a;
            velocity *= motionScale * motionStrength;
            float speed = length(velocity / texelSize);
            int samplesCount = int(clamp(speed, 1.0, SAMPLES));

            velocity = normalize(velocity) * texelSize;
            float hlim = float(-samplesCount) * 0.5 + 0.5;

            vec4 result = textureLod(textureSampler, vUV, 0.0);

            for (int i = 1; i < int(SAMPLES); ++i)
            {
                if (i >= samplesCount)
                    break;
                
                vec2 offset = vUV + velocity * (hlim + float(i));
                result += textureLod(textureSampler, offset, 0.0);
            }

            gl_FragColor = result / float(samplesCount);
            gl_FragColor.a = 1.0;
        #else
            vec4 result = textureLod(textureSampler, vUV, 0.0);

            vec2 texelSize = 1.0 / screenSize;
            float depth = textureLod(depthSampler, vUV, 0.0).r;
            if (depth == 0.0) {
                gl_FragColor = result;
                return;
            }

            depth = projection[2].z + projection[3].z / depth; // convert from view linear z to NDC z

            vec4 cpos = vec4(vUV * 2.0 - 1.0, depth, 1.0);
            cpos = inverseViewProjection * cpos;
            cpos /= cpos.w;

            vec4 ppos = prevViewProjection * cpos;
            ppos /= ppos.w;
            ppos.xy = ppos.xy * 0.5 + 0.5;

            vec2 velocity = (ppos.xy - vUV) * motionScale * motionStrength;
            float speed = length(velocity / texelSize);
            int nSamples = int(clamp(speed, 1.0, SAMPLES));

            for (int i = 1; i < int(SAMPLES); ++i) {
                if (i >= nSamples)
                    break;
                
                vec2 offset1 = vUV + velocity * (float(i) / float(nSamples - 1) - 0.5);
                result += textureLod(textureSampler, offset1, 0.0);
            }

            gl_FragColor = result / float(nSamples);
        #endif
    #else
    gl_FragColor = texture2D(textureSampler, vUV);
    #endif
}
