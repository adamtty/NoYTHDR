/**
 * NoYTHDR
 * Makes YouTube believe this browser cannot decode HDR video, so it picks the
 * SDR rendition of the stream instead. Every HDR video on YouTube also ships
 * SDR renditions at the same resolutions, so nothing is lost but the brightness.
 *
 * This runs at document_start and patches the page's own globals (not the
 * content script's) via Firefox's wrappedJSObject, so the player sees the
 * patched versions before it ever probes for codec support.
 */

const pageWindow = window.wrappedJSObject;

// Transfer characteristics from the codec string (ITU-T H.273):
// 16 = PQ (SMPTE ST 2084), 18 = HLG. Everything else is SDR.
const HDR_TRANSFER_CHARACTERISTICS = new Set(['16', '18']);

// Short codec strings omit the colour fields, so the transfer function can't be
// read. YouTube only ships >8-bit for HDR, so treat those as HDR as well. Set
// this to false if you want to block only streams that are provably HDR.
const BLOCK_HIGH_BIT_DEPTH_WHEN_UNSPECIFIED = true;

const UNSUPPORTED_DECODE = { supported: false, smooth: false, powerEfficient: false };

/**
 * Whether a single codec string describes an HDR stream
 * @param {string} codec - e.g. "vp09.02.51.10.01.09.16.09.00"
 * @returns {boolean}
 */
function isHdrCodec(codec) {
  const fields = codec.trim().split('.');
  const bitDepth = parseInt(fields[3], 10);
  const isHighBitDepth = BLOCK_HIGH_BIT_DEPTH_WHEN_UNSPECIFIED && bitDepth > 8;

  switch (fields[0]) {
    // vp09.<profile>.<level>.<bitDepth>.<chroma>.<primaries>.<transfer>.<matrix>.<range>
    case 'vp09':
      if (fields.length > 6) return HDR_TRANSFER_CHARACTERISTICS.has(fields[6]);
      // Profiles 2 and 3 are the 10/12-bit ones, which is what YouTube uses for HDR
      return isHighBitDepth ||
        (BLOCK_HIGH_BIT_DEPTH_WHEN_UNSPECIFIED && ['02', '03'].includes(fields[1]));

    // av01.<profile>.<levelTier>.<bitDepth>.<mono>.<chroma>.<primaries>.<transfer>.<matrix>.<range>
    case 'av01':
      if (fields.length > 7) return HDR_TRANSFER_CHARACTERISTICS.has(fields[7]);
      return isHighBitDepth;

    // HEVC profile 2 is Main 10 - the only HEVC profile YouTube uses for HDR
    case 'hev1':
    case 'hvc1':
      return (fields[1] || '').replace(/^0+/, '') === '2';

    default:
      return false;
  }
}

/**
 * Whether a MIME type's codecs parameter names any HDR codec
 * @param {string} contentType - e.g. 'video/webm; codecs="vp09.02.51.10.01.09.16.09.00"'
 * @returns {boolean}
 */
function isHdrContentType(contentType) {
  if (typeof contentType !== 'string') return false;

  const codecsParameter = contentType.match(/codecs\s*=\s*"?([^"';]+)"?/i);
  if (!codecsParameter) return false;

  return codecsParameter[1].split(',').some(isHdrCodec);
}

/**
 * Whether a MediaCapabilities configuration is asking about HDR playback.
 * This API describes dynamic range explicitly, so it needs no codec parsing.
 * @param {Object} configuration - A MediaDecodingConfiguration from the page
 * @returns {boolean}
 */
function isHdrDecodingConfig(configuration) {
  const config = configuration?.wrappedJSObject || configuration;
  const video = config?.video?.wrappedJSObject || config?.video;
  if (!video) return false;

  if (video.transferFunction === 'pq' || video.transferFunction === 'hlg') return true;
  if (video.hdrMetadataType) return true;

  return isHdrContentType(video.contentType);
}

/**
 * Replaces a method on a page object with a content-script implementation
 * @param {Object} target - The page object owning the method
 * @param {string} name - Method name
 * @param {Function} createReplacement - Receives the original, returns the replacement
 * @returns {void}
 */
function patchPageMethod(target, name, createReplacement) {
  const original = target?.[name];
  if (typeof original !== 'function') return;

  exportFunction(createReplacement(original), target, { defineAs: name });
}

// The classic path: the player asks MSE whether it can source-buffer a codec.
patchPageMethod(pageWindow.MediaSource, 'isTypeSupported', original =>
  function (type) {
    if (isHdrContentType(type)) return false;
    return original.call(this, type);
  });

// The same question asked of a media element. Returning '' means "no".
patchPageMethod(pageWindow.HTMLMediaElement?.prototype, 'canPlayType', original =>
  function (type) {
    if (isHdrContentType(type)) return '';
    return original.call(this, type);
  });

// The modern path, and the one YouTube actually relies on now.
patchPageMethod(pageWindow.MediaCapabilities?.prototype, 'decodingInfo', original =>
  function (configuration) {
    if (isHdrDecodingConfig(configuration)) {
      return pageWindow.Promise.resolve(cloneInto(UNSUPPORTED_DECODE, pageWindow));
    }
    return original.call(this, configuration);
  });

// Display-capability probes. "not all" is valid CSS that never matches, so the
// page concludes the screen is SDR without us having to fake a MediaQueryList.
patchPageMethod(pageWindow, 'matchMedia', original =>
  function (query) {
    if (typeof query === 'string' && /dynamic-range\s*:\s*high/i.test(query)) {
      return original.call(this, 'not all');
    }
    return original.call(this, query);
  });
