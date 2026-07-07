/** Read a text field from a form; non-string entries (files) become ''. */
export function readFormValue(form: HTMLFormElement, key: string): string {
  const value = new FormData(form).get(key);
  return typeof value === 'string' ? value : '';
}
