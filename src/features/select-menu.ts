// Keep the select's values and change handler, with a terminal-style popup and rail.
export function selectMenu(select: HTMLSelectElement) {
  // Keep the lazy game module independent of the inlined application entry.
  const displayScale = () => parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const abort = new AbortController();
  const button = document.createElement('button');
  button.className = `${select.className} module-select-trigger`;
  button.setAttribute('role', 'combobox');
  button.setAttribute('aria-label', select.getAttribute('aria-label') ?? 'Select');
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('div');
  menu.className = 'module-menu';
  menu.popover = 'auto';
  const list = document.createElement('div');
  list.className = 'module-options';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', button.getAttribute('aria-label')!);
  const rail = document.createElement('terminal-scrollbar');
  rail.className = 'file-scroll module-menu-scroll';
  rail.setAttribute('aria-label', 'Options');
  menu.append(list, rail);
  select.before(button);
  select.after(menu);
  select.hidden = true;
  const options = Array.from(select.options, (option) => {
    const item = document.createElement('button');
    item.className = 'module-option';
    item.setAttribute('role', 'option');
    item.textContent = option.text;
    item.addEventListener(
      'click',
      () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        refresh();
        menu.hidePopover();
        button.focus();
      },
      { signal: abort.signal },
    );
    list.append(item);
    return item;
  });
  const updateRail = () => {
    const max = Math.max(0, list.scrollHeight - list.clientHeight);
    rail.setAttribute('max', String(max));
    rail.setAttribute('page', String(list.clientHeight));
    rail.setAttribute('value', String(list.scrollTop));
  };
  function refresh() {
    button.textContent = select.selectedOptions[0]?.text ?? '';
    options.forEach((item, i) =>
      item.setAttribute('aria-selected', String(i === select.selectedIndex)),
    );
  }
  function focusOption(index: number) {
    const option = options[(index + options.length) % options.length];
    option.focus({ preventScroll: true });
    const a = option.getBoundingClientRect(),
      b = list.getBoundingClientRect();
    if (a.top < b.top) list.scrollTop -= (b.top - a.top) / displayScale();
    else if (a.bottom > b.bottom) list.scrollTop += (a.bottom - b.bottom) / displayScale();
    updateRail();
  }
  function open() {
    if (menu.matches(':popover-open')) return;
    const rect = button.getBoundingClientRect(),
      scale = displayScale(),
      viewportWidth = innerWidth / scale,
      viewportHeight = innerHeight / scale,
      below = viewportHeight - rect.bottom / scale - 8;
    const above = rect.top / scale - 8,
      upwards = below < 160 && above > below;
    const height = Math.min(options.length * 32 + 4, 284, Math.max(64, upwards ? above : below));
    const width = Math.min(Math.max(rect.width / scale, 260), viewportWidth - 16);
    menu.style.width = `${width}px`;
    menu.style.height = `${height}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left / scale, viewportWidth - width - 8))}px`;
    menu.style.top = `${upwards ? rect.top / scale - height - 4 : rect.bottom / scale + 4}px`;
    menu.showPopover();
    button.setAttribute('aria-expanded', 'true');
    focusOption(select.selectedIndex);
  }
  button.addEventListener(
    'click',
    () => (menu.matches(':popover-open') ? menu.hidePopover() : open()),
    { signal: abort.signal },
  );
  button.addEventListener(
    'keydown',
    (event) => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        open();
        if (event.key === 'Home') focusOption(0);
        if (event.key === 'End') focusOption(options.length - 1);
      }
    },
    { signal: abort.signal },
  );
  menu.addEventListener(
    'toggle',
    () => button.setAttribute('aria-expanded', String(menu.matches(':popover-open'))),
    { signal: abort.signal },
  );
  menu.addEventListener(
    'keydown',
    (event) => {
      event.stopPropagation();
      const index = options.indexOf(document.activeElement as HTMLButtonElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(event.key)) {
        event.preventDefault();
        focusOption(
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? options.length - 1
              : Math.max(
                  0,
                  Math.min(
                    options.length - 1,
                    index +
                      (event.key === 'ArrowDown'
                        ? 1
                        : event.key === 'ArrowUp'
                          ? -1
                          : event.key === 'PageDown'
                            ? 7
                            : -7),
                  ),
                ),
        );
      } else if (event.key === 'Escape') {
        event.preventDefault();
        menu.hidePopover();
        button.focus();
      }
    },
    { signal: abort.signal },
  );
  menu.addEventListener('wheel', (event) => event.stopPropagation(), {
    passive: true,
    signal: abort.signal,
  });
  menu.addEventListener('touchmove', (event) => event.stopPropagation(), {
    passive: true,
    signal: abort.signal,
  });
  list.addEventListener('scroll', updateRail, { signal: abort.signal });
  rail.addEventListener(
    'scrollbar-change',
    (event) => {
      event.stopPropagation();
      list.scrollTop = (event as CustomEvent<{ value: number }>).detail.value;
      updateRail();
    },
    { signal: abort.signal },
  );
  refresh();
  return {
    refresh,
    dispose() {
      abort.abort();
      menu.remove();
      button.remove();
      select.hidden = false;
    },
  };
}
