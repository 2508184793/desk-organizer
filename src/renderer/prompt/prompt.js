'use strict';

(() => {
  const p = new URLSearchParams(location.search);
  const title = p.get('title') || '输入';
  const initial = p.get('initial') || '';

  document.getElementById('ptitle').textContent = title;
  const input = document.getElementById('pinput');
  input.value = initial;

  const submit = () => promptApi.submit(input.value);
  const cancel = () => promptApi.close();

  document.getElementById('p-ok').onclick = submit;
  document.getElementById('p-cancel').onclick = cancel;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') cancel();
  });

  input.focus();
  input.select();
})();
