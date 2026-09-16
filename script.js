// Drengsson — shared site behaviour. No build step, no dependencies.

document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
  initContactForm();
});

function initMobileNav() {
  const toggle = document.querySelector('[data-nav-toggle]');
  const menu = document.querySelector('[data-nav-mobile]');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  menu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      menu.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

function initContactForm() {
  const form = document.querySelector('[data-contact-form]');
  if (!form) return;

  const status = form.querySelector('[data-form-status]');
  const submitBtn = form.querySelector('[data-submit-btn]');
  const successMsg = form.dataset.success;
  const failMsg = form.dataset.fail;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const data = Object.fromEntries(new FormData(form).entries());

    submitBtn.disabled = true;
    submitBtn.dataset.originalText = submitBtn.dataset.originalText || submitBtn.textContent;
    submitBtn.textContent = submitBtn.dataset.sending || submitBtn.textContent;
    setStatus(status, '', null);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error('request-failed');

      setStatus(status, successMsg, 'success');
      form.reset();
    } catch (err) {
      setStatus(status, failMsg, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = submitBtn.dataset.originalText;
    }
  });
}

function setStatus(el, message, state) {
  if (!el) return;
  el.textContent = message;
  if (state) {
    el.setAttribute('data-state', state);
  } else {
    el.removeAttribute('data-state');
  }
}
