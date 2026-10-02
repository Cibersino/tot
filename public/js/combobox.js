// public/js/combobox.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared renderer combobox for fixed-choice and editable picker controls.
// Responsibilities:
// - Own generated combobox/listbox DOM and ARIA state.
// - Keep one combobox popup open at a time.
// - Normalize pointer and keyboard activation for value and action options.
// - Restore committed display text when editable queries are dismissed.
// - Expose a per-instance controller for updates, focus, and cleanup.

(() => {
  // =============================================================================
  // Module state
  // =============================================================================

  let nextComboboxId = 1;
  let openController = null;

  // =============================================================================
  // Option normalization helpers
  // =============================================================================

  function isActionOption(option) {
    return !!option && typeof option === 'object' && typeof option.action === 'string';
  }

  function normalizeOption(option) {
    if (!option || typeof option !== 'object') return null;
    const label = typeof option.label === 'string' ? option.label : String(option.label || '');
    const normalized = {
      label,
      disabled: option.disabled === true,
      variant: typeof option.variant === 'string' ? option.variant.trim() : '',
    };
    if (isActionOption(option)) {
      normalized.action = option.action;
      return normalized;
    }
    if (!Object.prototype.hasOwnProperty.call(option, 'value')) return null;
    normalized.value = String(option.value == null ? '' : option.value);
    return normalized;
  }

  function normalizeOptions(options) {
    return (Array.isArray(options) ? options : [])
      .map(normalizeOption)
      .filter(Boolean);
  }

  function findValueOption(options, value) {
    const normalizedValue = String(value == null ? '' : value);
    return options.find((option) => !isActionOption(option) && option.value === normalizedValue) || null;
  }

  function isUnmodifiedCharacterKey(event) {
    return typeof event.key === 'string'
      && event.key.length === 1
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey;
  }

  // =============================================================================
  // Combobox instance factory
  // =============================================================================

  function create(config = {}) {
    // =============================================================================
    // Instance setup and DOM creation
    // =============================================================================

    const host = config.host;
    if (!host || typeof host.appendChild !== 'function') {
      throw new Error('[combobox] host unavailable; cannot create combobox');
    }

    let mode = config.mode;
    if (mode !== 'select' && mode !== 'editable') {
      throw new Error('[combobox] mode must be "select" or "editable"');
    }

    const instanceId = nextComboboxId;
    nextComboboxId += 1;
    const inputId = `rendererComboboxInput-${instanceId}`;
    const listboxId = `rendererComboboxListbox-${instanceId}`;

    let options = normalizeOptions(config.options);
    let visibleOptions = [];
    let value = String(config.value == null ? '' : config.value);
    let disabled = config.disabled === true;
    let placeholder = typeof config.placeholder === 'string' ? config.placeholder : '';
    let noResultsLabel = typeof config.noResultsLabel === 'string' ? config.noResultsLabel : '';
    let resolveOptions = typeof config.resolveOptions === 'function' ? config.resolveOptions : null;
    let onChange = typeof config.onChange === 'function' ? config.onChange : null;
    let onAction = typeof config.onAction === 'function' ? config.onAction : null;
    let isOpen = false;
    let activeIndex = -1;
    let destroyed = false;
    let typeAheadText = '';
    let typeAheadTimer = null;

    host.classList.add('renderer-combobox');
    host.dataset.mode = mode;

    const input = document.createElement('input');
    input.id = inputId;
    input.className = 'renderer-combobox__input';
    input.type = 'text';
    input.autocomplete = 'off';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('aria-autocomplete', mode === 'editable' ? 'list' : 'none');
    input.setAttribute('aria-controls', listboxId);
    input.setAttribute('aria-expanded', 'false');

    const listbox = document.createElement('div');
    listbox.id = listboxId;
    listbox.className = 'renderer-combobox__listbox';
    listbox.setAttribute('role', 'listbox');
    listbox.setAttribute('aria-hidden', 'true');
    listbox.hidden = true;

    host.appendChild(input);
    host.appendChild(listbox);

    // =============================================================================
    // Rendering and state helpers
    // =============================================================================

    function applyAccessibleName(nextConfig) {
      if (typeof nextConfig.ariaLabelledBy === 'string' && nextConfig.ariaLabelledBy.trim()) {
        input.setAttribute('aria-labelledby', nextConfig.ariaLabelledBy.trim());
        input.removeAttribute('aria-label');
        return;
      }
      if (typeof nextConfig.ariaLabel === 'string' && nextConfig.ariaLabel.trim()) {
        input.setAttribute('aria-label', nextConfig.ariaLabel.trim());
        input.removeAttribute('aria-labelledby');
      }
    }

    function getCommittedLabel() {
      const selected = findValueOption(options, value);
      if (mode === 'editable' && selected && selected.variant === 'clear') return '';
      return selected ? selected.label : '';
    }

    function setClosedDisplay() {
      input.value = getCommittedLabel();
    }

    function getEnabledIndexes() {
      const indexes = [];
      visibleOptions.forEach((option, index) => {
        if (!option.disabled) indexes.push(index);
      });
      return indexes;
    }

    function resolveVisibleOptions(queryOverride) {
      if (mode === 'editable' && resolveOptions) {
        const query = typeof queryOverride === 'string' ? queryOverride : input.value;
        const resolved = resolveOptions(query, options.slice(), value);
        visibleOptions = normalizeOptions(resolved);
      } else {
        visibleOptions = options.slice();
      }
    }

    function setDefaultActiveIndex() {
      const enabledIndexes = getEnabledIndexes();
      if (!enabledIndexes.length) {
        activeIndex = -1;
        return;
      }
      const selectedIndex = visibleOptions.findIndex(
        (option) => !isActionOption(option) && !option.disabled && option.value === value
      );
      activeIndex = selectedIndex >= 0 ? selectedIndex : enabledIndexes[0];
    }

    function scrollActiveOptionIntoView() {
      if (activeIndex < 0) return;
      const activeElement = listbox.children[activeIndex];
      if (activeElement && typeof activeElement.scrollIntoView === 'function') {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }

    function setHoveredActiveIndex(index) {
      const option = visibleOptions[index];
      if (!option || option.disabled || index === activeIndex) return;
      const previousActiveElement = listbox.children[activeIndex];
      if (previousActiveElement) previousActiveElement.classList.remove('is-active');
      activeIndex = index;
      const activeElement = listbox.children[activeIndex];
      if (activeElement) {
        activeElement.classList.add('is-active');
        input.setAttribute('aria-activedescendant', activeElement.id);
      }
    }

    function renderOptions() {
      listbox.replaceChildren();
      if (!visibleOptions.length) {
        const empty = document.createElement('div');
        empty.className = 'renderer-combobox__option is-disabled is-empty';
        empty.setAttribute('role', 'option');
        empty.setAttribute('aria-disabled', 'true');
        empty.textContent = noResultsLabel;
        listbox.appendChild(empty);
        input.removeAttribute('aria-activedescendant');
        return;
      }

      visibleOptions.forEach((option, index) => {
        const optionElement = document.createElement('div');
        optionElement.id = `${listboxId}-option-${index}`;
        optionElement.className = 'renderer-combobox__option';
        if (option.disabled) optionElement.classList.add('is-disabled');
        if (index === activeIndex) optionElement.classList.add('is-active');
        if (option.variant) {
          optionElement.dataset.variant = option.variant;
        }
        optionElement.setAttribute('role', 'option');
        optionElement.setAttribute('aria-disabled', option.disabled ? 'true' : 'false');
        optionElement.setAttribute(
          'aria-selected',
          !isActionOption(option) && option.value === value ? 'true' : 'false'
        );
        optionElement.textContent = option.label;
        optionElement.addEventListener('mousedown', (event) => event.preventDefault());
        optionElement.addEventListener('mouseenter', () => setHoveredActiveIndex(index));
        optionElement.addEventListener('click', () => activateOption(index));
        listbox.appendChild(optionElement);
      });

      if (activeIndex >= 0) {
        input.setAttribute('aria-activedescendant', `${listboxId}-option-${activeIndex}`);
      } else {
        input.removeAttribute('aria-activedescendant');
      }
      scrollActiveOptionIntoView();
    }

    function renderOpenState() {
      input.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      listbox.hidden = !isOpen;
      listbox.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      if (isOpen) {
        renderOptions();
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }

    // =============================================================================
    // Interaction and lifecycle handlers
    // =============================================================================

    function open() {
      if (destroyed || disabled || isOpen) return;
      if (openController && openController !== controller) {
        openController.close();
      }
      isOpen = true;
      openController = controller;
      resolveVisibleOptions(mode === 'editable' ? '' : input.value);
      setDefaultActiveIndex();
      renderOpenState();
    }

    function close() {
      if (destroyed) return;
      isOpen = false;
      if (openController === controller) openController = null;
      if (mode === 'editable') setClosedDisplay();
      renderOpenState();
    }

    function moveActive(direction) {
      const enabledIndexes = getEnabledIndexes();
      if (!enabledIndexes.length) {
        activeIndex = -1;
        renderOptions();
        return;
      }
      const currentPosition = enabledIndexes.indexOf(activeIndex);
      if (direction === 'first') {
        activeIndex = enabledIndexes[0];
      } else if (direction === 'last') {
        activeIndex = enabledIndexes[enabledIndexes.length - 1];
      } else {
        const nextPosition = currentPosition < 0
          ? (direction > 0 ? 0 : enabledIndexes.length - 1)
          : Math.max(0, Math.min(currentPosition + direction, enabledIndexes.length - 1));
        activeIndex = enabledIndexes[nextPosition];
      }
      renderOptions();
    }

    function activateOption(index) {
      const option = visibleOptions[index];
      if (!option || option.disabled) return;
      if (isActionOption(option)) {
        if (onAction) onAction(option, controller);
        return;
      }
      value = option.value;
      close();
      setClosedDisplay();
      if (onChange) onChange(value, option);
    }

    function applyTypeAhead(character) {
      typeAheadText += character.toLocaleLowerCase();
      if (typeAheadTimer) window.clearTimeout(typeAheadTimer);
      typeAheadTimer = window.setTimeout(() => {
        typeAheadText = '';
        typeAheadTimer = null;
      }, 700);
      const startIndex = activeIndex >= 0 ? activeIndex + 1 : 0;
      const candidates = visibleOptions
        .map((option, index) => ({ option, index }))
        .filter(({ option }) => !option.disabled && !isActionOption(option));
      const ordered = candidates.filter(({ index }) => index >= startIndex)
        .concat(candidates.filter(({ index }) => index < startIndex));
      const match = ordered.find(({ option }) => option.label.toLocaleLowerCase().startsWith(typeAheadText));
      if (match) {
        activeIndex = match.index;
        renderOptions();
      }
    }

    function onInputClick() {
      if (disabled) return;
      if (mode === 'select' && isOpen) {
        close();
        return;
      }
      open();
      if (mode === 'editable' && value && typeof input.select === 'function') {
        input.select();
      }
    }

    function onInputChanged() {
      if (mode !== 'editable' || disabled) return;
      if (!isOpen) open();
      resolveVisibleOptions();
      setDefaultActiveIndex();
      renderOptions();
    }

    function onInputKeyDown(event) {
      if (disabled) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!isOpen) open();
        else moveActive(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (mode === 'select' && (event.key === 'Home' || event.key === 'End')) {
        event.preventDefault();
        if (!isOpen) open();
        moveActive(event.key === 'Home' ? 'first' : 'last');
        return;
      }
      if (event.key === 'Enter') {
        if (!isOpen) {
          event.preventDefault();
          open();
          return;
        }
        event.preventDefault();
        activateOption(activeIndex);
        return;
      }
      if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key === 'Tab' && isOpen) {
        close();
        return;
      }
      if (mode === 'select' && isUnmodifiedCharacterKey(event)) {
        if (!isOpen) open();
        applyTypeAhead(event.key);
        return;
      }
      if (mode === 'editable'
        && !isOpen
        && value
        && isUnmodifiedCharacterKey(event)) {
        input.value = '';
      }
    }

    function onDocumentMouseDown(event) {
      if (!isOpen || host.contains(event.target)) return;
      close();
    }

    function update(nextConfig = {}) {
      if (destroyed) return;
      if (Object.prototype.hasOwnProperty.call(nextConfig, 'mode')) {
        if (nextConfig.mode !== 'select' && nextConfig.mode !== 'editable') {
          throw new Error('[combobox] update mode must be "select" or "editable"');
        }
        mode = nextConfig.mode;
        host.dataset.mode = mode;
        input.readOnly = mode === 'select';
        input.setAttribute('aria-autocomplete', mode === 'editable' ? 'list' : 'none');
      }
      if (Object.prototype.hasOwnProperty.call(nextConfig, 'options')) {
        options = normalizeOptions(nextConfig.options);
      }
      if (Object.prototype.hasOwnProperty.call(nextConfig, 'value')) {
        value = String(nextConfig.value == null ? '' : nextConfig.value);
      }
      if (Object.prototype.hasOwnProperty.call(nextConfig, 'disabled')) {
        disabled = nextConfig.disabled === true;
      }
      if (Object.prototype.hasOwnProperty.call(nextConfig, 'placeholder')) {
        placeholder = typeof nextConfig.placeholder === 'string' ? nextConfig.placeholder : '';
      }
      if (Object.prototype.hasOwnProperty.call(nextConfig, 'noResultsLabel')) {
        noResultsLabel = typeof nextConfig.noResultsLabel === 'string' ? nextConfig.noResultsLabel : '';
      }
      if (Object.prototype.hasOwnProperty.call(nextConfig, 'resolveOptions')) {
        resolveOptions = typeof nextConfig.resolveOptions === 'function' ? nextConfig.resolveOptions : null;
      }
      if (Object.prototype.hasOwnProperty.call(nextConfig, 'onChange')) {
        onChange = typeof nextConfig.onChange === 'function' ? nextConfig.onChange : null;
      }
      if (Object.prototype.hasOwnProperty.call(nextConfig, 'onAction')) {
        onAction = typeof nextConfig.onAction === 'function' ? nextConfig.onAction : null;
      }
      applyAccessibleName(nextConfig);
      input.placeholder = placeholder;
      input.disabled = disabled;
      input.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      if (disabled && isOpen) close();
      if (isOpen) {
        resolveVisibleOptions();
        setDefaultActiveIndex();
        renderOptions();
      } else {
        setClosedDisplay();
      }
    }

    function focus() {
      if (!destroyed) input.focus();
    }

    function destroy() {
      if (destroyed) return;
      close();
      destroyed = true;
      if (typeAheadTimer) window.clearTimeout(typeAheadTimer);
      input.removeEventListener('click', onInputClick);
      input.removeEventListener('input', onInputChanged);
      input.removeEventListener('keydown', onInputKeyDown);
      document.removeEventListener('mousedown', onDocumentMouseDown);
      host.replaceChildren();
      host.classList.remove('renderer-combobox');
      delete host.dataset.mode;
    }

    // =============================================================================
    // Controller surface and event wiring
    // =============================================================================

    const controller = {
      update,
      getValue: () => value,
      open,
      close,
      focus,
      destroy,
    };

    input.addEventListener('click', onInputClick);
    input.addEventListener('input', onInputChanged);
    input.addEventListener('keydown', onInputKeyDown);
    document.addEventListener('mousedown', onDocumentMouseDown);
    input.readOnly = mode === 'select';
    applyAccessibleName(config);
    update(config);

    return controller;
  }

  // =============================================================================
  // Public module surface
  // =============================================================================

  window.RendererCombobox = { create };
})();

// =============================================================================
// End of public/js/combobox.js
// =============================================================================
