function createCustomSelect({ trigger, label, menu, onOpen, onChange }) {
    let options = [];
    let value = 'all';
    let active = 0;
    let typed = '';
    let lastTyped = 0;

    function close() {
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        trigger.removeAttribute('aria-activedescendant');
        typed = '';
    }

    function position() {
        const rect = trigger.getBoundingClientRect();
        const action = document.querySelector('.action-bar');
        const bar = action?.getClientRects().length ? action.getBoundingClientRect() : null;
        const header = document.querySelector('.app-header')?.getBoundingClientRect();
        const top = Math.max(12, (header?.bottom || 0) + 8);
        const bottom = Math.min(innerHeight - 12, bar ? bar.top - 8 : innerHeight - 12);
        const below = Math.max(0, bottom - rect.bottom - 6);
        const above = Math.max(0, rect.top - top - 6);
        const opensAbove = below < Math.min(menu.scrollHeight, 240) && above > below;
        menu.classList.toggle('opens-above', opensAbove);
        menu.style.maxHeight = Math.min(320, opensAbove ? above : below) + 'px';
        menu.style.maxWidth = Math.max(0, innerWidth - rect.left - 12) + 'px';
    }

    function highlight(index) {
        active = Math.max(0, Math.min(options.length - 1, index));
        [...menu.children].forEach((option, position) => option.classList.toggle('keyboard-active', position === active));
        const option = menu.children[active];
        if (!option) return;
        trigger.setAttribute('aria-activedescendant', option.id);
        if (option.offsetTop < menu.scrollTop) menu.scrollTop = option.offsetTop;
        else if (option.offsetTop + option.offsetHeight > menu.scrollTop + menu.clientHeight) {
            menu.scrollTop = option.offsetTop + option.offsetHeight - menu.clientHeight;
        }
    }

    function open(index = options.findIndex(option => option.value === value)) {
        if (trigger.disabled || !options.length) return;
        onOpen();
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        position();
        highlight(index);
    }

    function commit() {
        const selected = options[active];
        close();
        if (selected && selected.value !== value) onChange(selected.value);
    }

    function update(nextOptions, nextValue) {
        options = nextOptions;
        value = nextValue;
        const selected = options.find(option => option.value === value) || options[0];
        label.textContent = selected?.label || '';
        trigger.title = selected?.label || '';
        menu.replaceChildren(...options.map((option, index) => {
            const item = document.createElement('div');
            item.id = menu.id + '-option-' + index;
            item.className = 'select-option';
            item.dataset.value = option.value;
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', String(option.value === value));
            const text = document.createElement('span');
            text.className = 'option-label';
            text.textContent = option.label;
            item.appendChild(text);
            if (option.count !== undefined) {
                const count = document.createElement('span');
                count.className = 'option-count';
                count.textContent = new Intl.NumberFormat('en-IE').format(option.count);
                item.appendChild(count);
            }
            return item;
        }));
        if (!menu.hidden) { position(); highlight(active); }
    }

    trigger.addEventListener('click', () => menu.hidden ? open() : close());
    trigger.addEventListener('keydown', event => {
        const isOpen = !menu.hidden;
        const key = event.key;
        if (key === 'Tab') { if (isOpen) commit(); return; }
        if (key === 'Escape') { if (isOpen) { event.preventDefault(); close(); } return; }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp', 'Enter', ' '].includes(key)) {
            event.preventDefault();
            if (!isOpen) open(key === 'Home' || key === 'ArrowUp' ? 0 : key === 'End' ? options.length - 1 : undefined);
            else if (key === 'Enter' || key === ' ' || (key === 'ArrowUp' && event.altKey)) commit();
            else highlight(key === 'Home' ? 0 : key === 'End' ? options.length - 1 : active + ({ ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[key] || 0));
            return;
        }
        if (key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        if (!isOpen) open();
        const now = Date.now();
        typed = now - lastTyped < 700 ? typed + key : key;
        lastTyped = now;
        const normalize = text => text.toLocaleLowerCase('en').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const query = normalize([...typed].every(character => character === typed[0]) ? key : typed);
        const start = query.length === 1 ? active + 1 : active;
        for (let offset = 0; offset < options.length; offset++) {
            const index = (start + offset) % options.length;
            if (normalize(options[index].label).startsWith(query)) { highlight(index); break; }
        }
    });
    trigger.addEventListener('blur', () => { if (!menu.hidden) commit(); });
    menu.addEventListener('pointerdown', event => event.preventDefault());
    menu.addEventListener('click', event => {
        const option = event.target.closest('[role="option"]');
        if (!option || !menu.contains(option)) return;
        active = [...menu.children].indexOf(option);
        commit();
        trigger.focus({ preventScroll: true });
    });
    document.addEventListener('pointerdown', event => {
        if (!menu.hidden && !trigger.contains(event.target) && !menu.contains(event.target)) commit();
    });
    window.addEventListener('resize', () => { if (!menu.hidden) position(); });
    document.addEventListener('scroll', () => { if (!menu.hidden) position(); }, true);
    return { update, close };
}
