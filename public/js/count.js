// public/js/count.js
(() => {
  const log = window.getLogger('count');

  log.debug('[count.js] module loaded');

  function contarTextoSimple(texto) {
    const conEspacios = texto.length;
    const sinEspacios = texto.replace(/\s+/g, '').length;
    const palabras = texto.trim() === '' ? 0 : texto.trim().split(/\s+/).length;
    return { conEspacios, sinEspacios, palabras };
  }

  function hasIntlSegmenter() {
    return typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';
  }

  function contarTextoPrecisoFallback(texto) {
    const graphemes = [...texto];
    const conEspacios = graphemes.length;
    const sinEspacios = graphemes.filter(c => !/\s/.test(c)).length;
    const palabras = texto.trim() === '' ? 0 : texto.trim().split(/\s+/).length;
    return { conEspacios, sinEspacios, palabras };
  }

  function contarTextoPreciso(texto, language) {
    if (!hasIntlSegmenter()) {
      return contarTextoPrecisoFallback(texto);
    }
    const segGraf = new Intl.Segmenter(language, { granularity: 'grapheme' });
    const grafemas = [...segGraf.segment(texto)];
    const conEspacios = grafemas.length;
    const sinEspacios = grafemas.filter(g => !/\s/.test(g.segment)).length;

    const segPal = new Intl.Segmenter(language, { granularity: 'word' });
    const palabras = [...segPal.segment(texto)].filter(seg => seg.isWordLike).length;
    return { conEspacios, sinEspacios, palabras };
  }

  function contarTexto(texto, opts = {}) {
    const modoConteo = opts.modoConteo === 'simple' ? 'simple' : 'preciso';
    const idioma = opts.idioma || 'es';
    return (modoConteo === 'simple')
      ? contarTextoSimple(texto)
      : contarTextoPreciso(texto, idioma);
  }

  window.CountUtils = {
    contarTextoSimple,
    contarTextoPrecisoFallback,
    contarTextoPreciso,
    contarTexto,
    hasIntlSegmenter
  };
})();
