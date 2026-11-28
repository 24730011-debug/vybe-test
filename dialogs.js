// Native modal dialogs handle Escape. Dismiss a backdrop gesture only when
// both ends are outside the dialog, including its padding and scrollbars.
(() => {
  let backdropDialog;
  function outside(event) {
    const dialog = event.target;
    if (!(dialog instanceof HTMLDialogElement) || !dialog.matches(':modal')) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX >= bounds.right ||
        event.clientY < bounds.top || event.clientY >= bounds.bottom) return dialog;
  }

  document.addEventListener('pointerdown', event => {
    if (event.isPrimary) backdropDialog = event.button === 0 ? outside(event) : null;
  });
  document.addEventListener('pointercancel', event => {
    if (event.isPrimary) backdropDialog = null;
  });
  document.addEventListener('click', event => {
    const dialog = outside(event);
    if (dialog && dialog === backdropDialog) dialog.close();
    backdropDialog = null;
  });
})();
