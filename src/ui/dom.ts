// Small DOM helpers shared by the control panels.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

export function labeled(labelText: string, control: HTMLElement): HTMLElement {
  return el('label', { class: 'field' }, [el('span', { class: 'field-label' }, [labelText]), control]);
}

/** A checkbox with its text to the right. */
export function inlineChk(chk: HTMLInputElement, text: string): HTMLElement {
  return el('label', { class: 'inline' }, [chk, el('span', { class: 'inline-text' }, [text])]);
}

export function option(value: string, text: string): HTMLOptionElement {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = text;
  return o;
}
