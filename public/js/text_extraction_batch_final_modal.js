// public/js/text_extraction_batch_final_modal.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Host the shared Issue 266/267 unit-based final report modal.
// - Render retained generated-artifact reveal actions through window.Notify.
// - Expose a copy-report and open-snapshots-folder action without creating a
//   second reporting surface.

(() => {
  // =============================================================================
  // Imports / logger
  // =============================================================================

  if (typeof window.getLogger !== 'function') {
    throw new Error('[text-extraction-batch-final-modal] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('text-extraction-batch-final-modal');
  log.debug('Text extraction batch final modal starting...');
  const rendererIcons = window.RendererIcons || null;
  if (!rendererIcons || typeof rendererIcons.createIconButton !== 'function') {
    throw new Error('[text-extraction-batch-final-modal] RendererIcons unavailable; cannot continue');
  }
  if (!window.RendererI18n || typeof window.RendererI18n.tRenderer !== 'function') {
    throw new Error('[text-extraction-batch-final-modal] RendererI18n.tRenderer unavailable; cannot continue');
  }
  const { tRenderer } = window.RendererI18n;

  // =============================================================================
  // DOM references
  // =============================================================================

  const modal = document.getElementById('textExtractionBatchFinalModal');
  const backdrop = document.getElementById('textExtractionBatchFinalModalBackdrop');
  const panel = document.getElementById('textExtractionBatchFinalModalPanel');
  const title = document.getElementById('textExtractionBatchFinalModalTitle');
  const summary = document.getElementById('textExtractionBatchFinalModalSummary');
  const elapsed = document.getElementById('textExtractionBatchFinalModalElapsed');
  const body = document.getElementById('textExtractionBatchFinalModalBody');
  const btnCopy = document.getElementById('textExtractionBatchFinalModalCopy');
  const btnOpenSnapshots = document.getElementById('textExtractionBatchFinalModalOpenSnapshots');
  const btnOk = document.getElementById('textExtractionBatchFinalModalOk');
  const btnClose = document.getElementById('textExtractionBatchFinalModalClose');
  let activePromptTranslations = null;

  // =============================================================================
  // Helpers
  // =============================================================================

  function hasRequiredElements() {
    return !!(modal
      && backdrop
      && panel
      && title
      && summary
      && elapsed
      && body
      && btnCopy
      && btnOpenSnapshots
      && btnOk
      && btnClose);
  }

  function formatTranslation(key, replacements = {}) {
    let text = tRenderer(key);
    Object.keys(replacements).forEach((name) => {
      text = text.replace(`{${name}}`, String(replacements[name]));
    });
    return text;
  }

  function createDomElement(tagName, options = {}) {
    const element = document.createElement(tagName);
    if (options.className) {
      element.className = options.className;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'textContent')) {
      element.textContent = String(options.textContent);
    }
    if (options.type) {
      element.type = options.type;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'hidden')) {
      element.hidden = options.hidden === true;
    }
    if (options.attributes && typeof options.attributes === 'object') {
      Object.keys(options.attributes).forEach((name) => {
        const value = options.attributes[name];
        if (value === undefined || value === null) return;
        element.setAttribute(name, String(value));
      });
    }
    return element;
  }

  function appendChildren(parent, children) {
    children.forEach((child) => {
      if (!child) return;
      parent.appendChild(child);
    });
    return parent;
  }

  function setElementVisibility(element, isVisible) {
    element.hidden = isVisible !== true;
    element.setAttribute('aria-hidden', isVisible === true ? 'false' : 'true');
  }

  function hasSavedSnapshots(report) {
    return !!(
      report
      && Array.isArray(report.units)
      && report.units.some((unit) => unit
        && unit.snapshotResult
        && unit.snapshotResult.state === 'saved')
    );
  }

  function normalizeReport(report) {
    if (!report || typeof report !== 'object') {
      return { flowKind: 'batch', units: [], hadOutput: false };
    }
    return {
      ...report,
      flowKind: report.flowKind === 'single_file_split' ? 'single_file_split' : 'batch',
      units: Array.isArray(report.units) ? report.units : [],
      hadOutput: report.hadOutput === true,
    };
  }

  function buildSummaryText(report) {
    const parts = [
      report && report.hadOutput
        ? tRenderer('renderer.text_extraction.batch_report.current_text_has_output')
        : tRenderer('renderer.text_extraction.batch_report.current_text_unchanged'),
    ];
    if (hasSavedSnapshots(report)) {
      parts.push(tRenderer('renderer.text_extraction.batch_report.snapshot_load_guidance'));
    }
    return parts.join(' ');
  }

  function createRevealGeneratedPdfButton(artifactPath) {
    if (typeof artifactPath !== 'string' || !artifactPath.trim()) {
      return null;
    }
    const label = tRenderer('renderer.text_extraction.batch_report.reveal_generated_pdf');
    const button = rendererIcons.createIconButton({
      iconName: 'open-target',
      className: 'btn-standard btn-standard--square-half',
      ariaLabel: label,
      type: 'button',
    });
    button.setAttribute('data-tot-tooltip', label);
    button.setAttribute('data-action', 'reveal-generated-pdf');
    button.setAttribute('data-artifact-path', artifactPath);
    return button;
  }

  function normalizeReportState(state) {
    const normalizedState = typeof state === 'string' ? state : '';
    if (normalizedState === 'success') return 'success';
    if (normalizedState === 'cancelled' || normalizedState.indexOf('cancelled') === 0) return 'cancelled';
    if (normalizedState === 'omitted') return 'omitted';
    return normalizedState ? 'failed' : '';
  }

  function formatReportStatusText(state, code = '', { applyTruncated = false } = {}) {
    const normalizedState = normalizeReportState(state);
    if (!normalizedState) {
      return '';
    }
    if (normalizedState === 'success') {
      if (applyTruncated === true) {
        return tRenderer('renderer.text_extraction.batch_report.applied_truncated');
      }
      return '';
    }
    if (normalizedState === 'omitted') {
      return tRenderer('renderer.text_extraction.batch_report.omitted');
    }
    if (normalizedState === 'failed' && code === 'PAYLOAD_TOO_LARGE') {
      return tRenderer('renderer.text_extraction.batch_report.payload_too_large');
    }
    if (normalizedState === 'failed' && code === 'TEXT_LIMIT') {
      return tRenderer('renderer.text_extraction.batch_report.text_limit');
    }
    if (normalizedState === 'cancelled') {
      if (code) {
        return formatTranslation('renderer.text_extraction.batch_report.cancelled_with_code', {
          code,
        });
      }
      return tRenderer('renderer.text_extraction.batch_report.cancelled_fallback');
    }
    if (code) {
      return formatTranslation('renderer.text_extraction.batch_report.failed_with_code', {
        code,
      });
    }
    return tRenderer('renderer.text_extraction.batch_report.failed_fallback');
  }

  function buildReportStatusSuffix(state, code = '', { applyTruncated = false } = {}) {
    const statusText = formatReportStatusText(state, code, { applyTruncated });
    return statusText ? `(${statusText})` : '';
  }

  function getReportItemStatusSuffix(item) {
    return buildReportStatusSuffix(
      item && item.state,
      item && item.code ? item.code : '',
      {
        applyTruncated: item && item.applyTruncated === true,
      }
    );
  }

  function getReportItemStatusKind(item) {
    const normalizedState = normalizeReportState(item && item.state);
    if (normalizedState === 'success') {
      return item && item.applyTruncated === true ? 'truncated' : '';
    }
    return normalizedState;
  }

  function createReportItemLabel(displayName, item) {
    const label = createDomElement('span', {
      className: 'text-extraction-batch-final-item-label',
    });
    label.appendChild(createDomElement('span', {
      textContent: displayName,
    }));

    const statusSuffix = getReportItemStatusSuffix(item);
    const statusKind = getReportItemStatusKind(item);
    if (statusSuffix && statusKind) {
      label.appendChild(createDomElement('span', {
        className: `text-extraction-batch-final-status text-extraction-batch-final-status--${statusKind}`,
        textContent: ` ${statusSuffix}`,
      }));
    }
    return label;
  }

  function getRetainedArtifactPath(item) {
    return item
      && item.generatedPdfArtifact
      && item.generatedPdfArtifact.retainedArtifactPath;
  }

  function getSnapshotResultText(unit) {
    return unit && unit.snapshotResult
      ? unit.snapshotResult.text
      : tRenderer('renderer.text_extraction.batch_report.snapshot_not_created');
  }

  function renderGeneratedInputRow(generatedInput, index, unitKey) {
    const row = createDomElement('div', {
      className: 'text-extraction-batch-final-generated',
      attributes: {
        'data-unit-key': unitKey,
        'data-index': index,
      },
    });
    const label = createReportItemLabel(generatedInput.fileName, generatedInput);
    const revealButton = createRevealGeneratedPdfButton(getRetainedArtifactPath(generatedInput));
    appendChildren(row, [label, revealButton]);
    return row;
  }

  function renderInputRow(input, index, unitKey) {
    const row = createDomElement('div', {
      className: 'text-extraction-batch-final-input',
      attributes: {
        'data-index': index,
      },
    });
    const main = createDomElement('div', {
      className: 'text-extraction-batch-final-input-main',
    });
    const label = createReportItemLabel(input.displayName || input.fileName, input);
    const revealButton = createRevealGeneratedPdfButton(getRetainedArtifactPath(input));
    appendChildren(main, [label, revealButton]);
    row.appendChild(main);

    if (Array.isArray(input.generatedInputs) && input.generatedInputs.length) {
      const generatedList = createDomElement('div', {
        className: 'text-extraction-batch-final-generated-list',
      });
      input.generatedInputs.forEach((generatedInput, generatedIndex) => {
        generatedList.appendChild(renderGeneratedInputRow(generatedInput, generatedIndex, unitKey));
      });
      row.appendChild(generatedList);
    }

    return row;
  }

  function renderUnitReport(unit, unitIndex) {
    const section = createDomElement('section', {
      className: 'text-extraction-batch-final-unit',
    });
    section.appendChild(createDomElement('h3', {
      textContent: unit.unitTitle,
    }));
    (Array.isArray(unit.inputs) ? unit.inputs : []).forEach((input, inputIndex) => {
      section.appendChild(renderInputRow(input, inputIndex, `unit-${unitIndex}`));
    });
    section.appendChild(createDomElement('div', {
      className: 'text-extraction-batch-final-json-line',
      textContent: getSnapshotResultText(unit),
    }));
    return section;
  }

  function replaceReportBody(units) {
    const unitNodes = (Array.isArray(units) ? units : []).map((unit, unitIndex) => renderUnitReport(unit, unitIndex));
    if (typeof body.replaceChildren === 'function') {
      body.replaceChildren(...unitNodes);
      return;
    }
    log.warnOnce(
      'text-extraction.batch-final.replace-children-body-unavailable',
      'Batch final report: replaceChildren unavailable; using DOM fallback.'
    );
    while (body.firstChild) {
      body.removeChild(body.firstChild);
    }
    unitNodes.forEach((node) => body.appendChild(node));
  }

  function buildReportText(report, elapsedValueText = '') {
    const lines = [];
    lines.push(report.flowKind === 'single_file_split'
      ? tRenderer('renderer.text_extraction.batch_report.single_file_title')
      : tRenderer('renderer.text_extraction.batch_report.title'));
    const normalizedElapsedValueText = typeof elapsedValueText === 'string' ? elapsedValueText.trim() : '';
    if (normalizedElapsedValueText) {
      lines.push(`${tRenderer('renderer.text_extraction.batch_report.elapsed')}${normalizedElapsedValueText}`);
    }
    lines.push('');
    report.units.forEach((unit) => {
      lines.push(unit.unitTitle);
      unit.inputs.forEach((input) => {
        const label = getReportItemStatusSuffix(input);
        lines.push(`- ${input.displayName || input.fileName}${label ? ` ${label}` : ''}`);
        if (Array.isArray(input.generatedInputs)) {
          input.generatedInputs.forEach((generatedInput) => {
            const generatedLabel = getReportItemStatusSuffix(generatedInput);
            lines.push(`  - ${generatedInput.fileName}${generatedLabel ? ` ${generatedLabel}` : ''}`);
          });
        }
      });
      lines.push(getSnapshotResultText(unit));
      lines.push('');
    });
    lines.push(report.hadOutput
      ? tRenderer('renderer.text_extraction.batch_report.current_text_has_output')
      : tRenderer('renderer.text_extraction.batch_report.current_text_unchanged'));
    return lines.join('\n');
  }

  async function copyReportText(reportText) {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      throw new Error('navigator.clipboard.writeText unavailable');
    }
    await navigator.clipboard.writeText(reportText);
  }

  function applyTranslations() {
    if (activePromptTranslations) activePromptTranslations();
  }

  // =============================================================================
  // Public prompt
  // =============================================================================

  async function promptBatchFinalReport({
    report,
    elapsedValueText = '',
    onRevealGeneratedPdf,
    onOpenSnapshotsFolder,
  } = {}) {
    if (!hasRequiredElements()) {
      log.error('Batch final modal DOM elements missing.');
      return;
    }
    if (!report || typeof report !== 'object' || !Array.isArray(report.units)) {
      log.warn('Batch final modal received invalid report payload; rendering fallback report.');
    }
    const safeReport = normalizeReport(report);
    const normalizedElapsedValueText = typeof elapsedValueText === 'string' ? elapsedValueText.trim() : '';
    let reportText = '';
    const renderModalCopy = () => {
      reportText = buildReportText(safeReport, normalizedElapsedValueText);
      title.textContent = safeReport.flowKind === 'single_file_split'
        ? tRenderer('renderer.text_extraction.batch_report.single_file_title')
        : tRenderer('renderer.text_extraction.batch_report.title');
      summary.textContent = buildSummaryText(safeReport);
      if (normalizedElapsedValueText) {
        elapsed.textContent = `${tRenderer('renderer.text_extraction.batch_report.elapsed')}${normalizedElapsedValueText}`;
      } else {
        elapsed.textContent = '';
      }
      setElementVisibility(elapsed, !!normalizedElapsedValueText);
      replaceReportBody(safeReport.units);
      btnCopy.textContent = tRenderer('renderer.text_extraction.batch_report.copy_report');
      btnOpenSnapshots.textContent = tRenderer('renderer.text_extraction.batch_report.open_snapshots_folder');
      btnOk.textContent = tRenderer('renderer.text_extraction.batch_report.ok_button');
      btnClose.setAttribute('aria-label', tRenderer('renderer.text_extraction.batch_report.close_aria'));
    };
    renderModalCopy();

    return new Promise((resolve) => {
      let settled = false;
      const refreshModalTranslations = () => {
        const scrollTop = typeof panel.scrollTop === 'number' ? panel.scrollTop : 0;
        const hadBodyFocus = !!(document.activeElement && body.contains(document.activeElement));
        renderModalCopy();
        if (typeof panel.scrollTop === 'number') panel.scrollTop = scrollTop;
        if (hadBodyFocus) btnClose.focus({ preventScroll: true });
      };
      const cleanup = () => {
        activePromptTranslations = null;
        body.removeEventListener('click', onBodyClick);
        btnCopy.removeEventListener('click', onCopy);
        btnOpenSnapshots.removeEventListener('click', onOpenSnapshots);
        btnOk.removeEventListener('click', onOk);
        btnClose.removeEventListener('click', onOk);
        backdrop.removeEventListener('click', onOk);
        window.removeEventListener('keydown', onWindowKeyDown);
        modal.setAttribute('aria-hidden', 'true');
        window.Notify.deactivateModalFocus(modal);
      };

      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const onBodyClick = async (event) => {
        const target = event.target && event.target.closest ? event.target.closest('[data-action="reveal-generated-pdf"]') : null;
        if (!target) return;
        if (typeof onRevealGeneratedPdf !== 'function') {
          log.warn('Generated PDF reveal action ignored: onRevealGeneratedPdf unavailable.');
          return;
        }
        try {
          await onRevealGeneratedPdf(target.getAttribute('data-artifact-path') || '');
        } catch (err) {
          log.error('Generated PDF reveal failed from final modal:', err);
          window.Notify.notifyMain('renderer.text_extraction.alerts.generated_pdf_reveal_failed');
        }
      };
      const onCopy = async () => {
        try {
          await copyReportText(reportText);
        } catch (err) {
          log.error('Batch report copy failed:', err);
        }
      };
      const onOpenSnapshots = async () => {
        if (typeof onOpenSnapshotsFolder !== 'function') {
          log.warn('Open snapshots folder action ignored: onOpenSnapshotsFolder unavailable.');
          return;
        }
        try {
          await onOpenSnapshotsFolder();
        } catch (err) {
          log.error('Open snapshots folder failed:', err);
        }
      };
      const onOk = () => finish();
      const onWindowKeyDown = (event) => {
        if (modal.getAttribute('aria-hidden') !== 'false') return;
        if (event.key === 'Escape') {
          event.preventDefault();
          finish();
        }
      };

      body.addEventListener('click', onBodyClick);
      btnCopy.addEventListener('click', onCopy);
      btnOpenSnapshots.addEventListener('click', onOpenSnapshots);
      btnOk.addEventListener('click', onOk);
      btnClose.addEventListener('click', onOk);
      backdrop.addEventListener('click', onOk);
      window.addEventListener('keydown', onWindowKeyDown);
      activePromptTranslations = refreshModalTranslations;

      modal.setAttribute('aria-hidden', 'false');
      if (typeof panel.scrollTop === 'number') {
        panel.scrollTop = 0;
      }
      window.Notify.activateModalFocus(modal, {
        initialFocus: btnClose,
        fallbackFocus: btnClose,
      });
    });
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================

  window.Notify.registerCustomPrompt('promptTextExtractionBatchFinalReport', promptBatchFinalReport);
  window.TextExtractionBatchFinalModal = { applyTranslations };
})();

// =============================================================================
// End of public/js/text_extraction_batch_final_modal.js
// =============================================================================
