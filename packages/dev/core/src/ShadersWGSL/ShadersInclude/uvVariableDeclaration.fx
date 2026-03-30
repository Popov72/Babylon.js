#ifdef MAINUV{X}
	#if !defined(UV{X})
		var uv{X}: vec2f = vec2f(0., 0.);
	#elif defined(USE_VERTEX_PULLING) && defined(VP_UV{X}_SUPPORTED)
		var uv{X}: vec2f = uv{X}Updated;
	#elif !defined(USE_VERTEX_PULLING)
		var uv{X}: vec2f = vertexInputs.uv{X};
	#else
		var uv{X}: vec2f = vec2f(0., 0.);
	#endif

	vertexOutputs.vMainUV{X} = uv{X};
#endif
